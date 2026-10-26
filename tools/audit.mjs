/**
 * 自动视觉审计（开发工具，不随模组发布）。
 *
 * 用无头 Chrome + CDP 打开 render.mjs 生成的评审页面，做只读检查：
 *   - 文字对比度：把文字临时透明化后截图，取文字矩形下的真实背景像素，按 WCAG 计算对比度
 *   - 横向溢出 / 裁切：scrollWidth > clientWidth、元素超出窗口或溢出祖先、关键标签被 ellipsis 截断
 *   - 空 / 破图：img.naturalWidth === 0、<use href="#symbol"> 找不到对应 symbol
 *   - Foundry 核心样式污染：appearance / 字体栈 / 无自绘背景的按钮等启发式检查
 *   - 字体加载、tab 一致性、关键组件尺寸与重叠、状态类是否按预期出现（低资源/激活状态/公式模式/非 GM 视角）
 *
 * 用法：
 *   node tools/audit.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/audit
 *   node tools/audit.mjs --dir /tmp/c7t-art/html --only investigator --strict
 *   node tools/audit.mjs --dir /tmp/c7t-art/html --crops --png-dir /tmp/c7t-art/png
 *
 * 输出（默认 /tmp/c7t-art/audit/）：
 *   report.json   完整数据（每页指标、问题明细）
 *   issues.json   扁平问题清单（按 P0/P1/P2 排序）
 *   summary.txt   人读摘要（中文）
 *   shots/        --shots 时保存「文字透明」背景截图
 *   crops/        --crops 时用 sips 从正式截图裁出的问题局部放大图
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawn, execFileSync } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const INJECTED = fs.readFileSync(new URL("./audit-page.js", import.meta.url), "utf8");
const VERSION = 1;
const PAD = 30; // render.mjs 中窗口外的页面留白

/* ============================================================
   参数
   ============================================================ */
function parseArgs(argv) {
  const args = {
    dir: "/tmp/c7t-art/html",
    out: "/tmp/c7t-art/audit",
    pngDir: "/tmp/c7t-art/png",
    only: "",
    limit: 0,
    shots: false,
    crops: false,
    strict: false,
    noSample: false,
    timeout: 20000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--dir=")) args.dir = a.slice(6);
    else if (a === "--dir") args.dir = argv[++i];
    else if (a.startsWith("--out=")) args.out = a.slice(6);
    else if (a === "--out") args.out = argv[++i];
    else if (a.startsWith("--png-dir=")) args.pngDir = a.slice(10);
    else if (a === "--png-dir") args.pngDir = argv[++i];
    else if (a.startsWith("--only=")) args.only = a.slice(7);
    else if (a === "--only") args.only = argv[++i];
    else if (a.startsWith("--limit=")) args.limit = Number(a.slice(8));
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a.startsWith("--timeout=")) args.timeout = Number(a.slice(10));
    else if (a === "--timeout") args.timeout = Number(argv[++i]);
    else if (a === "--shots") args.shots = true;
    else if (a === "--crops") args.crops = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--no-sample") args.noSample = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

/* ============================================================
   Chrome / CDP
   ============================================================ */
class Cdp {
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = (event) => reject(new Error(`WebSocket 连接失败：${event?.message ?? "unknown"}`));
    });
    return new Cdp(ws);
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id && this.pending.has(message.id)) {
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
        else entry.resolve(message.result);
        return;
      }
      if (message.method) {
        for (const fn of this.listeners.get(message.method) ?? []) fn(message.params);
      }
    };
    ws.onclose = () => {
      for (const entry of this.pending.values()) entry.reject(new Error("CDP 连接已关闭"));
      this.pending.clear();
    };
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event, fn) {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
    return () => this.listeners.set(event, (this.listeners.get(event) ?? []).filter((entry) => entry !== fn));
  }

  once(event, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`等待 ${event} 超时（${timeout}ms）`));
      }, timeout);
      const off = this.on(event, (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

async function readDevToolsPort(profile, child, timeout = 12000) {
  const file = path.join(profile, "DevToolsActivePort");
  const start = Date.now();
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  while (Date.now() - start < timeout) {
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, "utf8").trim().split("\n");
      if (lines[0]) return { port: Number(lines[0]), wsPath: lines[1] ?? "" };
    }
    if (child.exitCode != null) break;
    await sleep(40);
  }
  throw new Error(`Chrome 未就绪（DevToolsActivePort 未生成）${stderr ? `\n${stderr.slice(0, 800)}` : ""}`);
}

async function launchChrome(profileRoot) {
  fs.mkdirSync(profileRoot, { recursive: true });
  const profile = path.join(profileRoot, `audit-${Date.now()}-${process.pid}`);
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      "--allow-file-access-from-files",
      "--disable-lcd-text",
      "--disable-extensions",
      "--mute-audio",
      "--disk-cache-size=1",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--force-device-scale-factor=1",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const { port } = await readDevToolsPort(profile, child);
  const target = await findPageTarget(port);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {});
  return {
    cdp,
    child,
    profile,
    async close() {
      cdp.close();
      child.kill("SIGKILL");
      await sleep(120);
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function findPageTarget(port) {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* retry */
    }
    await sleep(80);
  }
  throw new Error("找不到可连接的 Chrome page target");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ============================================================
   PNG 解码 / 背景像素采样
   ============================================================ */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePng(buffer) {
  if (buffer.subarray(0, 8).compare(PNG_SIGNATURE) !== 0) throw new Error("不是 PNG 文件");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`不支持的 PNG：bitDepth=${bitDepth} interlace=${interlace}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`不支持的 PNG colorType=${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error("PNG 数据不完整");
  const out = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  };
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const dest = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? dest[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      const value = row[x];
      let result;
      switch (filter) {
        case 0:
          result = value;
          break;
        case 1:
          result = value + a;
          break;
        case 2:
          result = value + b;
          break;
        case 3:
          result = value + ((a + b) >> 1);
          break;
        case 4:
          result = value + paeth(a, b, c);
          break;
        default:
          throw new Error(`未知 PNG filter ${filter}`);
      }
      dest[x] = result & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/** 取文字矩形内部像素中位数作为背景色（文字已透明，矩形内全是背景）。 */
function sampleBackground(image, rect, windowRect = null) {
  if (!rect || rect.w < 1 || rect.h < 1) return null;
  // 取样必须落在窗口内部：窗口之外的像素是页面背景，会造成「纸面文字 vs 纯黑」的假对比度。
  let left = Math.max(0, Math.floor(rect.x));
  let top = Math.max(0, Math.floor(rect.y));
  let right = Math.min(image.width - 1, Math.ceil(rect.x + rect.w));
  let bottom = Math.min(image.height - 1, Math.ceil(rect.y + rect.h));
  if (windowRect) {
    left = Math.max(left, Math.floor(windowRect.x));
    top = Math.max(top, Math.floor(windowRect.y));
    right = Math.min(right, Math.ceil(windowRect.x + windowRect.w));
    bottom = Math.min(bottom, Math.ceil(windowRect.y + windowRect.h));
  }
  if (right <= left || bottom <= top) return null;
  const insetX = Math.min(3, Math.floor((right - left) * 0.15));
  const insetY = Math.min(3, Math.floor((bottom - top) * 0.15));
  const x0 = left + insetX;
  const x1 = right - insetX;
  const y0 = top + insetY;
  const y1 = bottom - insetY;
  if (x1 <= x0 || y1 <= y0) return null;
  const stride = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 8));
  const rs = [];
  const gs = [];
  const bs = [];
  for (let y = y0; y <= y1; y += stride) {
    for (let x = x0; x <= x1; x += stride) {
      const index = (y * image.width + x) * image.channels;
      rs.push(image.data[index]);
      gs.push(image.data[index + 1]);
      bs.push(image.data[index + 2]);
    }
    if (rs.length > 900) break;
  }
  if (!rs.length) return null;
  const median = (values) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return { r: median(rs), g: median(gs), b: median(bs), a: 1 };
}

/* ============================================================
   颜色与对比度
   ============================================================ */
function parseCssColor(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1 };
  }
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = text.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const valueHex = hex[1];
    if (valueHex.length === 3) {
      return { r: parseInt(valueHex[0] + valueHex[0], 16), g: parseInt(valueHex[1] + valueHex[1], 16), b: parseInt(valueHex[2] + valueHex[2], 16), a: 1 };
    }
    if (valueHex.length === 6) {
      return { r: parseInt(valueHex.slice(0, 2), 16), g: parseInt(valueHex.slice(2, 4), 16), b: parseInt(valueHex.slice(4, 6), 16), a: 1 };
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function compositeColor(fg, bg) {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (top, bottom) => Math.round((top * fg.a + bottom * bg.a * (1 - fg.a)) / a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a };
}

function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function hexOf(color) {
  const part = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

/* ============================================================
   单页审计
   ============================================================ */
async function auditPage(cdp, job, config, counters) {
  const viewport = {
    w: job.width + (job.chrome === false ? 0 : PAD * 2),
    h: job.height + (job.chrome === false ? 0 : PAD * 2),
  };
  counters.errors.length = 0;
  const offException = cdp.on("Runtime.exceptionThrown", (params) => {
    counters.errors.push(params?.exceptionDetails?.text ?? JSON.stringify(params).slice(0, 200));
  });
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.w,
      height: viewport.h,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.w,
      screenHeight: viewport.h,
    });
    const loaded = cdp.once("Page.loadEventFired", config.timeout);
    await cdp.send("Page.navigate", { url: `file://${job.file}` });
    await loaded;
    await evaluate(cdp, `(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 60));
      return true;
    })()`, true);
    await evaluate(cdp, INJECTED, false);
    const collected = await evaluate(cdp, "window.__c7tAuditCollect()", true);
    if (!collected?.meta) throw new Error("审计探针未返回数据");

    let image = null;
    let screenshotBuffer = null;
    if (!config.noSample) {
      await evaluate(cdp, "window.__c7tAuditHideText()", true);
      const capture = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      screenshotBuffer = Buffer.from(capture.data, "base64");
      image = decodePng(screenshotBuffer);
      if (config.shots) {
        fs.mkdirSync(path.join(config.out, "shots"), { recursive: true });
        fs.writeFileSync(path.join(config.out, "shots", `${job.name}-bg.png`), screenshotBuffer);
      }
    }

    return buildPageReport(job, collected, image, counters.errors.slice(), config, viewport);
  } finally {
    offException();
  }
}

async function evaluate(cdp, expression, awaitPromise) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    timeout: 15000,
  });
  if (result.exceptionDetails) {
    throw new Error(`页面脚本异常：${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ""}`);
  }
  return result.result?.value;
}

const KEY_LABEL_RE = /(技能|物品|武器|生命|血量|魔法|理智|幸运|伤害|护甲|移动|名字|名称|调查员|守秘|笔记)/;

function buildPageReport(job, data, image, errors, config, viewport) {
  const issues = [];
  const stats = {
    textNodes: data.text.length,
    contrastChecked: 0,
    contrastFailed: 0,
    overflow: data.overflow.length,
    images: data.images.items.length,
    brokenImages: data.images.items.filter((image) => image.naturalWidth === 0).length,
    widgets: data.widgets.length,
    widgetWarnings: data.widgets.filter((widget) => widget.reasons.length).length,
    overlaps: data.layout.overlaps.length,
    fontsMissing: data.fonts.missing.length,
  };
  const add = (severity, kind, title, detail, evidence = null) => {
    issues.push({ severity, kind, title, detail, evidence });
  };

  /* ---- 1. 对比度 ---- */
  // 同一选择器 + 同色的重复文本（表格里的基础值/半值等）合并成一条，避免刷屏。
  const contrastGroups = new Map();
  for (const entry of data.text) {
    let bg;
    if (image) bg = sampleBackground(image, entry.rect, data.layout?.window);
    if (!bg && entry.bgGuess) bg = { r: entry.bgGuess.r, g: entry.bgGuess.g, b: entry.bgGuess.b, a: 1 };
    if (!bg) continue;
    const fgRaw = parseCssColor(entry.color);
    const opacity = Number.isFinite(entry.opacity) && entry.opacity > 0 ? entry.opacity : 1;
    const fgOnBg = compositeColor({ ...fgRaw, a: fgRaw.a * opacity }, bg);
    const ratio = contrastRatio(fgOnBg, bg);
    const large = entry.fontSize >= 24 || (entry.fontSize >= 18.66 && entry.fontWeight >= 700);
    const required = entry.secondary || large ? 3 : 4.5;
    stats.contrastChecked += 1;
    if (ratio < required - 0.01) {
      stats.contrastFailed += 1;
      const key = `${entry.sel}|${entry.color}|${hexOf(bg)}|${required}`;
      const prev = contrastGroups.get(key);
      if (prev) {
        prev.count += 1;
        prev.ratio = Math.min(prev.ratio, ratio);
      } else {
        contrastGroups.set(key, {
          sel: entry.sel,
          text: entry.text,
          ratio,
          required,
          secondary: entry.secondary,
          large,
          fontSize: entry.fontSize,
          color: hexOf(fgOnBg),
          background: hexOf(bg),
          rect: entry.rect,
          count: 1,
        });
      }
    }
  }
  // 可读性一律归入 P1/P2：< 3:1 属于明显可读性问题，边缘值（4.2~4.5）降为细节项。
  const contrastRows = [...contrastGroups.values()]
    .map((row) => ({ ...row, ratio: Number(row.ratio.toFixed(2)), severity: row.ratio < 3 ? "P1" : "P2" }))
    .sort((a, b) => a.ratio - b.ratio);
  stats.contrastGroups = contrastRows.length;
  for (const row of contrastRows.slice(0, 16)) {
    add(
      row.severity,
      "contrast",
      `文字对比度不足（${row.ratio}:1 < ${row.required}:1${row.count > 1 ? `，${row.count} 处同类` : ""}）`,
      `文本「${row.text || "?"}」${row.secondary ? "（次要文字）" : "（正文）"} 前景 ${row.color} / 背景 ${row.background}，选择器 \`${row.sel}\`，字号 ${row.fontSize}px`,
      row,
    );
  }

  /* ---- 2. 横向溢出 / 裁切 ---- */
  if (data.page?.horizontalScroll) {
    add("P0", "overflow-page", "页面出现横向滚动", `documentElement.scrollWidth=${data.page.docScrollWidth} > clientWidth=${data.page.docClientWidth}`, data.page);
  }
  const overflowRows = data.overflow.filter((row) => row.outsideWindow || row.clipped || row.delta > 2 || row.truncated);
  for (const row of overflowRows.slice(0, 20)) {
    const severity = row.outsideWindow || row.clipped ? "P1" : row.truncated && KEY_LABEL_RE.test(row.text) ? "P1" : "P2";
    const detail = row.clipped
      ? `内容超出祖先 \`${row.clipped.by}\`（右 ${row.clipped.right}px / 左 ${row.clipped.left}px）`
      : row.outsideWindow
        ? "元素超出窗口边界"
        : row.truncated
          ? `文字可能被省略号截断（scrollWidth ${row.scrollWidth} > clientWidth ${row.clientWidth}）`
          : `可滚动内容宽 ${row.scrollWidth} > 容器宽 ${row.clientWidth}`;
    add(severity, "overflow", `${row.tag} 溢出/裁切：${row.text || row.sel}`, `${detail}；选择器 \`${row.sel}\``, row);
  }

  /* ---- 3. 空 / 破图 ---- */
  for (const imageEntry of data.images.items.filter((entry) => entry.naturalWidth === 0)) {
    add("P1", "image", "图片加载失败（naturalWidth = 0）", `src=${imageEntry.src || "(空)"}，alt=${imageEntry.alt || "(空)"}，选择器 \`${imageEntry.sel}\``, imageEntry);
  }
  for (const symbol of data.images.brokenSymbols.slice(0, 12)) {
    add("P1", "image-symbol", "SVG symbol 引用不存在", `\`<use href="${symbol.href}">\` 找不到 symbol，位置 \`${symbol.owner}\``, symbol);
  }

  /* ---- 4. Foundry 核心样式污染（启发式） ---- */
  const widgetRows = data.widgets.filter((widget) => widget.reasons.length);
  for (const widget of widgetRows.slice(0, 16)) {
    add("P2", "widget", `控件疑似被核心/浏览器默认样式影响：${widget.reasons[0]}`, `\`<${widget.tag}${widget.type ? ` type="${widget.type}"` : ""}>\` ${widget.text ? `「${widget.text}」` : ""}，appearance=${widget.appearance}，font=${widget.fontFamily}，bg=${widget.backgroundColor}，选择器 \`${widget.sel}\``, widget);
  }

  /* ---- 4b. 容器卡专项（图标 filter / 分组折叠 / 空态） ---- */
  if (job.sheet === "container") {
    for (const image of data.images.items) {
      if (!image.visible || !image.filter || image.filter === "none") continue;
      const brightness = [...String(image.filter).matchAll(/brightness\(\s*([\d.]+)\s*\)/g)].map((match) => Number(match[1]));
      const darkFilter = brightness.find((value) => Number.isFinite(value) && value < 0.8);
      if (darkFilter != null) {
        add("P2", "widget", "行图标被 CSS filter 压暗", `\`${image.sel}\` 的 img filter=\`${image.filter}\`（brightness ${darkFilter}），会连同徽章衬底/阴影一起压暗；容器卡应使用共享浅黄铜徽章`, image);
      }
    }
    if ((data.classes?.groupHeads ?? 0) > 0 && (data.classes?.toggleGroups ?? 0) === 0) {
      add("P2", "interaction", "分组头缺少折叠交互", `检测到 ${data.classes.groupHeads} 个分组头，但没有 [data-action="toggleGroup"]`, data.classes);
    }
    if (job.empty && (data.classes?.emptyStates ?? 0) === 0) {
      add("P2", "empty", "空容器/空描述页未检测到空状态提示", "空分组/空描述建议显示空状态文案；如模板已用其它类名请忽略", { textNodes: data.text.length });
    }
  }

  /* ---- 5. 字体 ---- */
  // 只有展示拉丁字符的文本才会真正触发拉丁字体加载；纯中文文本走 CJK 回退，不能算缺字体。
  const usedFamilies = new Set();
  for (const entry of data.text) {
    if (!/[A-Za-z0-9]/.test(entry.text ?? "")) continue;
    const first = String(entry.fontFamily ?? "").split(",")[0].replace(/["']/g, "").trim();
    if (first) usedFamilies.add(first);
  }
  // 只按「具体文本元素 + 具体 style/weight」报告缺字体；family 级别的 check 会因为
  // 未使用某个字重/斜体而误报，仅作为 metrics 保留。usedFamilies 仍记录用于报告概览。
  void usedFamilies;
  for (const entry of (data.fonts.missing ?? []).slice(0, 10)) {
    add("P1", "font", `字体缺失：${entry.family}`, `\`${entry.sel}\`「${entry.text}」字号 ${entry.fontSize}px 使用了未成功加载的 ${entry.family}`, entry);
  }

  /* ---- 6. tab 一致性 ---- */
  const navIds = new Set(data.tabs.nav.map((entry) => entry.id));
  const sectionIds = new Set(data.tabs.sections.map((entry) => entry.id));
  if (job.viewer && job.viewer !== "gm") {
    for (const hidden of ["notes", "keeper"]) {
      if (navIds.has(hidden)) add("P1", "tabs", `非 GM 视角仍显示 ${hidden} tab`, `viewer=${job.viewer} 时应隐藏守秘/笔记 tab`, { hidden });
      if (sectionIds.has(hidden)) add("P1", "tabs", `非 GM 视角仍渲染 ${hidden} 内容区`, `模板应通过 {{#if isGM}} 隐藏 ${hidden} section`, { hidden });
    }
    if (data.meta.isGM) add("P1", "tabs", "非 GM 页面带上了 is-gm 类", "`.c7t-sheet` 出现 is-gm，可能使 GM 专属样式泄漏", {});
  }
  for (const id of navIds) {
    if (!sectionIds.has(id)) add("P1", "tabs", `tab「${id}」有导航但没有内容区`, "模板 section 与 TABS 定义不一致", { id });
  }
  for (const id of sectionIds) {
    if (!navIds.has(id)) add("P2", "tabs", `tab「${id}」有内容区但没有导航`, "可能是 GM 隐藏 tab 的预期行为；非 GM 视角请忽略", { id });
  }
  const gmOnlyTab = job.tab === "notes" || job.tab === "keeper";
  if (data.tabs.activeId !== job.tab && !(gmOnlyTab && job.viewer && job.viewer !== "gm")) {
    add("P1", "tabs", `激活 tab 与渲染参数不一致（${data.tabs.activeId || "无"} ≠ ${job.tab}）`, "`.tab.active` 与 manifest 的 tab 不一致", { activeId: data.tabs.activeId, expected: job.tab });
  }
  const activeSection = data.tabs.sections.find((entry) => entry.active);
  if (activeSection && (activeSection.rect.h < 8 || activeSection.rect.w < 8)) {
    add("P0", "tabs", `激活 tab「${activeSection.id}」内容区尺寸为 0`, "tab 可能是空模板或 CSS 未生效", activeSection);
  }

  /* ---- 7. 布局 / 关键组件 ---- */
  for (const overlap of data.layout.overlaps.slice(0, 12)) {
    add("P1", "layout", "同级元素重叠", `\`${overlap.a}\` 与 \`${overlap.b}\` 重叠 ${overlap.overlap.w}×${overlap.overlap.h}px（较小者 ${Math.round(overlap.overlap.ratio * 100)}%）；可能是有意的绝对定位，也可能是错位`, overlap);
  }
  if (data.layout.banner && data.layout.banner.ratio > 0.62) {
    add("P2", "layout", "横幅占比偏高", `banner 高度 ${Math.round(data.layout.banner.h)}px，占窗口 ${Math.round(data.layout.banner.ratio * 100)}%，内容首屏可能被挤压`, data.layout.banner);
  }
  if (job.sheet === "investigator" && !data.layout.sidebar) add("P1", "layout", "调查员卡缺少收藏侧栏", "`.c7t-sidebar` 不存在", {});
  if (job.sheet !== "container" && !data.layout.body) add("P0", "layout", "卡片缺少主体区域", "`.c7t-body` 不存在", {});

  /* ---- 8. 状态 / 视角 / 模式类是否按预期出现 ---- */
  const stateText = String(job.state ?? "normal");
  const stateTokens = stateText === "normal" ? [] : stateText.split("+");
  const stateClasses = data.classes ?? {};
  if (job.viewer === "observer" && Number(stateClasses.editControls ?? 0) > 0) {
    add("P1", "viewer", "只读观察者页面出现可编辑输入框", `observer 视角应完全不渲染编辑控件，实际找到 ${stateClasses.editControls} 个`, { editControls: stateClasses.editControls });
  }
  if (job.editing && Number(stateClasses.editControls ?? 0) === 0) {
    add("P2", "editing", "编辑态页面没有出现编辑控件", "编辑态应出现 input[name^='system.'] 等控件；如模板已按权限隐藏请忽略", {});
  }
  if (job.formulaMode && !stateClasses.formula) {
    add("P1", "formula", "公式模式未生效（缺少 .is-formula）", "`--formula` 需要编辑态且 system.flags.displayFormula=true", {});
  }
  if (job.compact && !stateClasses.compact) {
    add("P1", "compact", "紧凑模式未生效（缺少 .is-compact）", "模板根节点没有 is-compact 类", {});
  }
  if (stateTokens.length) {
    const lowText = (stateClasses.lowVitals ?? []).map((vital) => vital.text).join("|");
    const activeChips = (stateClasses.activeChips ?? []).map((chip) => chip.text);
    for (const token of stateTokens) {
      if (token === "low-res" && !(stateClasses.lowVitals ?? []).length) {
        add("P1", "state", "低资源状态没有 is-low 标记", "HP ≤25% 时资源卡应出现 .is-low", { token });
      }
      if (["wounded", "temp-insane", "indef-insane"].includes(token) && !activeChips.length) {
        add("P1", "state", `激活状态没有对应高亮（${token}）`, "状态芯片应出现 .c7t-chip.is-active", { token, chips: stateClasses.chips ?? [] });
      }
      if (token === "san-hit" && !/理智|SAN/.test(lowText)) {
        add("P2", "state", "SAN 受伤状态未在界面上体现", "检查理智资源条是否 is-low、今日 SAN 损失是否有值", { token });
      }
    }
  }
  if (job.npcType === "npc") {
    const textBlob = data.text.map((entry) => entry.text).join("|");
    if (!/邪教徒|无形之子|类型/.test(textBlob)) add("P2", "npc-type", "人类 NPC 副标题数据未显示", "npc 类型应显示职业/年龄/组织，而不是生物「类型」", {});
  }

  /* ---- 9. 页面脚本异常 ---- */
  for (const error of errors.slice(0, 5)) {
    add("P1", "js", "页面脚本异常", error, {});
  }

  return {
    name: job.name,
    file: job.file,
    screenshot: path.join(config.pngDir, `${job.name}.png`),
    meta: data.meta,
    viewport: { w: viewport.w, h: viewport.h },
    stats,
    issues,
    metrics: {
      banner: data.layout.banner,
      activeTab: data.layout.activeTab,
      fonts: data.fonts.checks,
      usedFamilies: [...usedFamilies].slice(0, 12),
      widgetWarnings: widgetRows.length,
      contrastChecked: stats.contrastChecked,
    },
    _contrastRows: contrastRows.slice(0, 24),
  };
}

/* ============================================================
   问题编号 / 报告
   ============================================================ */
const SEVERITY_RANK = { P0: 0, P1: 1, P2: 2 };

function flattenIssues(pages) {
  const flat = [];
  for (const page of pages) {
    for (const issue of page.issues) {
      flat.push({
        ...issue,
        page: page.name,
        sheet: page.meta.sheet,
        screenshot: page.screenshot,
      });
    }
  }
  flat.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || a.page.localeCompare(b.page));
  flat.forEach((issue, index) => {
    issue.id = `${issue.severity}-${String(index + 1).padStart(3, "0")}`;
  });
  return flat;
}

const FILE_HINTS = {
  contrast: {
    investigator: ["module/styles/tokens.css", "module/styles/sheet.css"],
    npc: ["module/styles/tokens.css", "module/styles/npc.css"],
    container: ["module/styles/tokens.css", "module/styles/container.css"],
  },
  overflow: {
    investigator: ["module/styles/sheet.css", "module/templates/tabs/*.hbs"],
    npc: ["module/styles/npc.css", "module/templates/npc/tabs/*.hbs"],
    container: ["module/styles/container.css", "module/templates/container/tabs/*.hbs"],
  },
  layout: {
    investigator: ["module/styles/sheet.css"],
    npc: ["module/styles/npc.css"],
    container: ["module/styles/container.css"],
  },
  tabs: {
    investigator: ["module/templates/investigator/sheet.hbs", "module/templates/parts/tabs-nav.hbs"],
    npc: ["module/templates/npc/sheet.hbs", "module/templates/parts/tabs-nav.hbs"],
    container: ["module/templates/container/sheet.hbs", "module/templates/parts/tabs-nav.hbs"],
  },
};

function annotateOwners(flat) {
  for (const issue of flat) {
    const sheet = issue.sheet || "investigator";
    issue.owner = sheet === "npc" ? "npc-art" : sheet === "container" ? "container-art" : "lead";
    const kind = issue.kind.startsWith("image") ? "image" : issue.kind.startsWith("overflow") ? "overflow" : issue.kind;
    issue.files = FILE_HINTS[kind]?.[sheet] ?? null;
    if (issue.kind === "image") issue.files = ["module/templates/parts/icons.hbs", "tools/fixtures.mjs"];
    if (issue.kind === "widget") issue.files = ["module/styles/sheet.css"];
  }
}

function buildSummary(report) {
  const flat = report.issues;
  const bySeverity = { P0: 0, P1: 0, P2: 0 };
  for (const issue of flat) bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
  const bySheet = {};
  for (const issue of flat) {
    bySheet[issue.sheet] ??= { P0: 0, P1: 0, P2: 0 };
    bySheet[issue.sheet][issue.severity] += 1;
  }
  const byKind = {};
  for (const issue of flat) byKind[issue.kind] = (byKind[issue.kind] ?? 0) + 1;
  const stale = [];
  for (const page of report.pages) {
    if (!fs.existsSync(page.screenshot)) continue;
    const png = fs.statSync(page.screenshot).mtimeMs;
    const html = fs.statSync(page.file).mtimeMs;
    if (png < html) stale.push(page.name);
  }
  return { pages: report.pages.length, bySeverity, bySheet, byKind, staleScreenshots: stale };
}

function renderSummary(report) {
  const { summary } = report;
  const lines = [];
  lines.push("CoC7 Tidy 视觉审计摘要");
  lines.push("=======================");
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push(`HTML 目录：${report.settings.dir}`);
  lines.push(`页面数：${summary.pages}`);
  lines.push(`问题合计：P0 ${summary.bySeverity.P0 ?? 0} / P1 ${summary.bySeverity.P1 ?? 0} / P2 ${summary.bySeverity.P2 ?? 0}`);
  lines.push(`按卡片：${Object.entries(summary.bySheet).map(([sheet, value]) => `${sheet} P0=${value.P0} P1=${value.P1} P2=${value.P2}`).join("；") || "无"}`);
  lines.push(`按类型：${Object.entries(summary.byKind).map(([kind, value]) => `${kind}=${value}`).join("；") || "无"}`);
  if (summary.staleScreenshots.length) {
    lines.push(`注意：${summary.staleScreenshots.length} 张截图早于 HTML，建议重跑 shot.mjs（例：${summary.staleScreenshots.slice(0, 3).join(", ")}）`);
  }
  lines.push("");
  for (const issue of report.issues.filter((entry) => entry.severity !== "P2")) {
    lines.push(`[${issue.severity}] ${issue.id}  ${issue.page}  ${issue.title}`);
    lines.push(`    ${issue.detail}`);
    lines.push(`    截图：${issue.screenshot}${issue.files ? `  涉及：${issue.files.join(", ")}` : ""}`);
  }
  const p2 = report.issues.filter((entry) => entry.severity === "P2");
  if (p2.length) {
    lines.push("");
    lines.push(`P2 明细（${p2.length} 条）：`);
    for (const issue of p2.slice(0, 40)) {
      lines.push(`  - ${issue.page}  ${issue.title}  ${issue.detail}`);
    }
  }
  return lines.join("\n");
}

/* ============================================================
   局部裁图（sips）
   ============================================================ */
function cropIssues(report, config) {
  const outDir = path.join(config.out, "crops");
  fs.mkdirSync(outDir, { recursive: true });
  const targets = report.issues.filter((issue) => issue.severity !== "P2" && issue.evidence?.rect);
  let count = 0;
  for (const issue of targets.slice(0, 40)) {
    const screenshot = issue.screenshot;
    if (!fs.existsSync(screenshot)) continue;
    const rect = issue.evidence.rect;
    const scale = 2; // shot.mjs 固定 2x
    const pad = 18;
    const x = Math.max(0, Math.floor((rect.x - pad) * scale));
    const y = Math.max(0, Math.floor((rect.y - pad) * scale));
    const w = Math.max(24, Math.ceil((rect.w + pad * 2) * scale));
    const h = Math.max(18, Math.ceil((rect.h + pad * 2) * scale));
    const output = path.join(outDir, `${issue.id}-${issue.page}.png`);
    try {
      execFileSync("sips", ["-c", String(h), String(w), "--cropOffset", String(y), String(x), screenshot, "--out", output], { stdio: "ignore" });
      issue.crop = output;
      count += 1;
    } catch {
      /* sips 不可用/越界时忽略 */
    }
  }
  return count;
}

/* ============================================================
   main
   ============================================================ */
async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    console.log(fs.readFileSync(new URL("./README.md", import.meta.url), "utf8"));
    return;
  }
  const manifestPath = path.join(config.dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`manifest not found: ${manifestPath}（先运行 tools/render.mjs）`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  let jobs = manifest;
  if (config.only) jobs = jobs.filter((job) => job.name.includes(config.only));
  if (config.limit > 0) jobs = jobs.slice(0, config.limit);
  if (!jobs.length) {
    console.error("没有匹配的页面");
    process.exit(1);
  }

  const htmlMeta = fs.existsSync(path.join(config.dir, "meta.json"))
    ? JSON.parse(fs.readFileSync(path.join(config.dir, "meta.json"), "utf8"))
    : null;

  fs.mkdirSync(config.out, { recursive: true });
  const startedAt = Date.now();
  const chrome = await launchChrome("/tmp/c7t-art/profiles");
  const pages = [];
  const counters = { errors: [] };
  console.log(`审计 ${jobs.length} 个页面 → ${config.out}`);
  try {
    let index = 0;
    for (const job of jobs) {
      index += 1;
      const label = `[${String(index).padStart(2, "0")}/${jobs.length}] ${job.name}`;
      try {
        const page = await auditPage(chrome.cdp, job, config, counters);
        pages.push(page);
        const p0 = page.issues.filter((issue) => issue.severity === "P0").length;
        const p1 = page.issues.filter((issue) => issue.severity === "P1").length;
        const p2 = page.issues.filter((issue) => issue.severity === "P2").length;
        console.log(`${label}  P0=${p0} P1=${p1} P2=${p2}  (${page.stats.textNodes} 文本 / ${page.stats.contrastFailed} 对比度不足)`);
      } catch (error) {
        console.error(`${label}  失败：${error.message}`);
        pages.push({
          name: job.name,
          file: job.file,
          screenshot: path.join(config.pngDir, `${job.name}.png`),
          meta: { sheet: job.sheet },
          viewport: { w: job.width, h: job.height },
          stats: {},
          issues: [{ severity: "P0", kind: "audit", title: "审计执行失败", detail: `页面未能完成审计：${error.message}` }],
          metrics: {},
        });
      }
    }
  } finally {
    await chrome.close();
  }

  const flat = flattenIssues(pages);
  annotateOwners(flat);
  const report = {
    generatedAt: new Date().toISOString(),
    toolVersion: VERSION,
    settings: {
      dir: config.dir,
      out: config.out,
      pngDir: config.pngDir,
      only: config.only,
      noSample: config.noSample,
      chromeVersion: chromeVersion(),
      durationMs: Date.now() - startedAt,
    },
    htmlMeta,
    pages,
    issues: flat,
  };
  report.summary = buildSummary(report);
  fs.writeFileSync(path.join(config.out, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(config.out, "issues.json"), JSON.stringify(flat, null, 2));
  const summary = renderSummary(report);
  fs.writeFileSync(path.join(config.out, "summary.txt"), `${summary}\n`);
  if (config.crops) {
    const count = cropIssues(report, config);
    fs.writeFileSync(path.join(config.out, "issues.json"), JSON.stringify(flat, null, 2));
    console.log(`裁图 ${count} 张 → ${path.join(config.out, "crops")}`);
  }
  console.log(summary);
  if (config.strict && (report.summary.bySeverity.P0 > 0 || report.summary.bySeverity.P1 > 0)) {
    process.exit(1);
  }
}

function chromeVersion() {
  try {
    const out = execFileSync(CHROME, ["--version"], { encoding: "utf8" }).trim();
    return out;
  } catch {
    return "unknown";
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
