#!/usr/bin/env node
/**
 * 生成发布封面 docs/screenshots/cover.png（2400×1260，1200×630 @2x）。
 *
 * 步骤：
 *   1. 准备主视觉卡片截图：--refresh 时调用 tools/render.mjs + tools/shot.mjs 现场渲染
 *      （调查员卡 · 技能页 · 780×800 · 2x），否则读取 --src 指定的 PNG；
 *   2. 用 macOS `sips` 居中裁掉无头截图四周的 30px（@2x 为 60px）窗口留白，
 *      输出到 docs/promo/assets/hero-investigator.png；
 *   3. 用无头 Chrome + CDP 打开 docs/promo/cover.html：等待 document.fonts.ready
 *      （避免 Cinzel / EB Garamond 尚未加载就截图，退回系统衬线）后按 2x 截图，
 *      输出 docs/screenshots/cover.png。
 *
 * 用法：
 *   node docs/promo/build-cover.mjs                  # 用现有 docs/screenshots/skills.png 裁主视觉
 *   node docs/promo/build-cover.mjs --refresh        # 现场渲染主视觉（推荐，改版后先跑这个）
 *   node docs/promo/build-cover.mjs --src /tmp/x.png # 指定主视觉截图
 *   node docs/promo/build-cover.mjs --out /tmp/cover.png
 *
 * 依赖：Node ≥ 22（内置 WebSocket / fetch）、Google Chrome、macOS sips、tools/ 已安装依赖。
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROMO = path.join(ROOT, "docs/promo");
const HERO = path.join(PROMO, "assets/hero-investigator.png");
const VIEW = { width: 1200, height: 630, scale: 2 };

function parseArgs(argv) {
  const args = {
    out: path.join(ROOT, "docs/screenshots/cover.png"),
    src: path.join(ROOT, "docs/screenshots/skills.png"),
    border: 60, // @2x 下 shot.mjs 的 PAD(30) 两侧合计
    refresh: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--refresh") args.refresh = true;
    else if (a.startsWith("--src=")) args.src = a.slice(6);
    else if (a === "--src") args.src = argv[++i];
    else if (a.startsWith("--out=")) args.out = a.slice(6);
    else if (a === "--out") args.out = argv[++i];
    else if (a.startsWith("--border=")) args.border = Number(a.slice(9));
    else if (a === "--border") args.border = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(new URL("./README.md", import.meta.url), "utf8"));
      process.exit(0);
    }
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(cmd, args, label) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (res.status !== 0) throw new Error(`${label} 失败（${cmd} 退出码 ${res.status}）`);
}

function pngSize(file) {
  const buffer = Buffer.alloc(24);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, 24, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`不是 PNG：${file}`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function sipsInfo(file) {
  const res = spawnSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`sips 读取失败：${file}`);
  const width = Number(/pixelWidth:\s*(\d+)/.exec(res.stdout)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(res.stdout)?.[1]);
  if (!width || !height) throw new Error(`无法解析图片尺寸：${file}`);
  return { width, height };
}

/* ============================================================
   主视觉：渲染 / 裁切
   ============================================================ */
function makeHero(args) {
  fs.mkdirSync(path.dirname(HERO), { recursive: true });

  if (args.refresh) {
    const htmlDir = "/tmp/c7t-promo/hero-html";
    const pngDir = "/tmp/c7t-promo/hero-png";
    fs.rmSync(htmlDir, { recursive: true, force: true });
    fs.rmSync(pngDir, { recursive: true, force: true });
    console.log("· 渲染调查员卡主视觉（skills · 780×800）…");
    run("node", ["tools/render.mjs", "--sheet", "investigator", "--tab", "skills", "--height", "800", "--out", htmlDir], "render");
    run("node", ["tools/shot.mjs", "--dir", htmlDir, "--out", pngDir, "--budget", "20000"], "shot");
    args.src = path.join(pngDir, "investigator-skills-light.png");
  }

  if (!fs.existsSync(args.src)) throw new Error(`主视觉截图不存在：${args.src}（可加 --refresh 现场渲染）`);

  const { width, height } = sipsInfo(args.src);
  const cropW = width - args.border * 2;
  const cropH = height - args.border * 2;
  if (cropW <= 0 || cropH <= 0) throw new Error(`裁切尺寸非法：${width}×${height} - ${args.border}×2`);

  console.log(`· 主视觉 ${path.relative(ROOT, args.src)} ${width}×${height} → 裁切 ${cropW}×${cropH}`);
  run("sips", ["-c", String(cropH), String(cropW), args.src, "--out", HERO], "sips 裁切");
  return sipsInfo(HERO);
}

/* ============================================================
   无头 Chrome + CDP（等待 webfont 就绪后截图）
   ============================================================ */
class Cdp {
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("WebSocket 连接失败"));
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
      if (message.method) for (const fn of this.listeners.get(message.method) ?? []) fn(message.params);
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
  while (Date.now() - start < timeout) {
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, "utf8").trim().split("\n");
      if (lines[0]) return { port: Number(lines[0]), wsPath: lines[1] ?? "" };
    }
    if (child.exitCode != null) break;
    await sleep(40);
  }
  throw new Error("Chrome 未就绪（DevToolsActivePort 未生成）");
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

async function launchChrome() {
  const profile = `/tmp/c7t-promo/chrome-profile-${Date.now()}-${process.pid}`;
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
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  const { port } = await readDevToolsPort(profile, child);
  const target = await findPageTarget(port);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  return {
    cdp,
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

async function shootCover(out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const coverUrl = `file://${path.join(PROMO, "cover.html")}`;
  console.log(`· 无头 Chrome 截图 ${coverUrl} → ${path.relative(ROOT, out)}`);

  const chrome = await launchChrome();
  try {
    await chrome.cdp.send("Emulation.setDeviceMetricsOverride", {
      width: VIEW.width,
      height: VIEW.height,
      deviceScaleFactor: VIEW.scale,
      mobile: false,
    });
    await chrome.cdp.send("Page.navigate", { url: coverUrl });
    await sleep(300);

    const ready = await chrome.cdp.send("Runtime.evaluate", {
      expression: `(async () => {
        await Promise.all([
          document.fonts.load('54px "Cover Cinzel"'),
          document.fonts.load('italic 13px "Cover Garamond"'),
          document.fonts.load('12px "Cover Condensed"'),
        ]);
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return {
          status: document.fonts.status,
          cinzel: document.fonts.check('54px "Cover Cinzel"'),
          garamond: document.fonts.check('italic 13px "Cover Garamond"'),
          cond: document.fonts.check('12px "Cover Condensed"'),
          imgs: [...document.images].map((img) => ({ src: img.getAttribute("src"), ok: img.complete && img.naturalWidth > 0 })),
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const value = ready?.result?.value ?? {};
    console.log(`· 字体就绪：${value.status} · Cinzel=${value.cinzel} · Garamond=${value.garamond} · Condensed=${value.cond}`);
    const broken = (value.imgs ?? []).filter((img) => !img.ok);
    if (broken.length) throw new Error(`封面图片加载失败：${broken.map((img) => img.src).join(", ")}`);
    if (!value.cinzel || !value.garamond) throw new Error("封面字体未加载（检查 module/assets/fonts 与 cover.css 路径）");

    const capture = await chrome.cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(out, Buffer.from(capture.data, "base64"));
  } finally {
    await chrome.close();
  }
}

/* ============================================================
   main
   ============================================================ */
const args = parseArgs(process.argv.slice(2));
const hero = makeHero(args);
await shootCover(args.out);

const cover = pngSize(args.out);
if (sipsInfo(args.out).width !== cover.width) throw new Error("封面尺寸校验失败");
if (cover.width !== VIEW.width * VIEW.scale || cover.height !== VIEW.height * VIEW.scale) {
  throw new Error(`封面尺寸 ${cover.width}×${cover.height}，预期 ${VIEW.width * VIEW.scale}×${VIEW.height * VIEW.scale}`);
}
console.log(
  JSON.stringify(
    {
      hero: path.relative(ROOT, HERO),
      heroSize: `${hero.width}×${hero.height}`,
      cover: path.relative(ROOT, args.out),
      coverSize: `${cover.width}×${cover.height}`,
    },
    null,
    2,
  ),
);
