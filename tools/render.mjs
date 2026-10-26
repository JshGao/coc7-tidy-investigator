/**
 * 把真实 Handlebars 模板 + 真实 CSS 渲染成独立 HTML（开发工具，不随模组发布）。
 *
 * 用法（完整参数见 tools/README.md）：
 *   node tools/render.mjs --all                         # 标准评审矩阵（= --matrix）
 *   node tools/render.mjs --matrix=quick                # 快速冒烟（每卡默认 tab × 亮/暗）
 *   node tools/render.mjs --matrix=standard             # 标准评审矩阵
 *   node tools/render.mjs --matrix=full                 # 完整矩阵（更多编辑态/窄窗/非 GM）
 *   node tools/render.mjs --sheet investigator --tab summary --theme dark --out /tmp/c7t
 *   node tools/render.mjs --sheet npc --tab combat --edit --formula --theme light --out /tmp/x
 *   node tools/render.mjs --sheet investigator --tab skills --state wounded,low-res --out /tmp/x
 *   node tools/render.mjs --sheet npc --viewer=owner --tab combat --out /tmp/x
 *
 * 输出：<out>/<name>.html + <out>/manifest.json（shot.mjs / audit.mjs 读取）+ <out>/meta.json
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  COC7_SYSTEM,
  FOUNDRY_APP,
  MODULE,
  MODULE_ID,
  ROOT,
  buildContexts,
  installGlobals,
  parseStates,
} from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const Handlebars = require("handlebars");

installGlobals();

const CN = JSON.parse(fs.readFileSync(path.join(MODULE, "lang/cn.json"), "utf8"));
const SYS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(COC7_SYSTEM, "lang/cn.json"), "utf8"));
  } catch {
    return {};
  }
})();

Handlebars.registerHelper("localize", (key) => CN[key] ?? SYS[key] ?? String(key));
Handlebars.registerHelper("c7t-eq", (a, b) => a === b);

/* ---------------- 模板 partial ---------------- */
function registerPartials(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) registerPartials(full);
    else if (entry.name.endsWith(".hbs")) {
      const rel = path.relative(MODULE, full).split(path.sep).join("/");
      Handlebars.registerPartial(`modules/${MODULE_ID}/${rel}`, fs.readFileSync(full, "utf8"));
    }
  }
}
registerPartials(path.join(MODULE, "templates"));

/* ---------------- CSS ---------------- */
export const CORE_CSS = [
  path.join(FOUNDRY_APP, "css/foundry2.css"),
  path.join(FOUNDRY_APP, "fonts/fontawesome/css/all.min.css"),
  path.join(COC7_SYSTEM, "system.css"),
];
export const MODULE_CSS = ["tokens.css", "sheet.css", "npc.css", "container.css"].map((f) => path.join(MODULE, "styles", f));

/**
 * 把 CSS 内联进 HTML：彻底避免 file:// 外部样式在无头 Chrome 中的加载竞态/缓存，
 * 让 2x 截图的样式与磁盘上的 CSS 严格一致（字体/图片仍走 file:// 绝对路径）。
 */
function inlineCss(file) {
  const base = path.dirname(file);
  let css = fs.readFileSync(file, "utf8");
  css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) => {
    if (/^(data:|https?:|#|\/|file:)/i.test(url)) return match;
    return `url("file://${path.resolve(base, url)}")`;
  });
  css = css.replace(/<\/style/gi, "<\\/style");
  return `<style data-c7t-src="${path.basename(file)}">\n${css}\n</style>`;
}

/** 主题背景（Foundry 窗口外） */
const PAGE_BG = {
  light: "radial-gradient(120% 100% at 50% 0%, #2b2b30 0%, #141417 60%, #0c0c0e 100%)",
  dark: "radial-gradient(120% 100% at 50% 0%, #16171c 0%, #0b0b0e 60%, #060608 100%)",
};

/**
 * 生成窗口外壳。
 * 结构尽量贴近 Foundry：.application.coc7-tidy.theme-* > .window-content > .c7t-sheet
 * data-c7t-* 只给 audit.mjs / shot.mjs 记录用，不参与样式。
 */
export function wrapHtml(templateHtml, { kind, dark, width, height, chrome = true, tab = "", viewer = "gm", state = "normal", npcType = "creature" }) {
  const klass = {
    investigator: "sheet actor investigator",
    npc: "sheet actor c7t-npc",
    container: "sheet actor c7t-container",
  }[kind] ?? "sheet actor";
  const links = [...CORE_CSS, ...MODULE_CSS].map(inlineCss).join("\n  ");
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${dark ? "dark" : "light"}">
<head>
  <meta charset="utf-8">
  <title>${kind} ${tab || ""} ${dark ? "dark" : "light"} preview</title>
  ${links}
  <style>
    html,body{margin:0;padding:0;background:${PAGE_BG[dark ? "dark" : "light"]};}
    body{display:flex;justify-content:center;align-items:flex-start;padding:${chrome ? 30 : 0}px;box-sizing:border-box;}
    .c7t-window{position:relative;width:${width}px;height:${height}px;border-radius:7px;overflow:hidden;
      background:var(--c7t-bg);
      box-shadow:0 24px 70px -18px #000c, 0 10px 26px -6px #000a, 0 0 0 1px #0009, 0 0 0 2px #ffffff08;
      display:flex;flex-direction:column;}
    .c7t-window > .window-content{flex:1;min-height:0;display:flex;flex-direction:column;padding:0;overflow:hidden;background:var(--c7t-bg);}
    .c7t-window .c7t-sheet{flex:1;min-height:0;}
    ${chrome ? "" : ".c7t-window{border-radius:0;box-shadow:none;}"}
  </style>
</head>
<body>
  <div class="c7t-window application coc7-tidy ${klass} ${dark ? "theme-dark" : "theme-light"}"
    data-c7t-sheet="${kind}" data-c7t-tab="${tab}" data-c7t-viewer="${viewer}" data-c7t-state="${state}"
    data-c7t-npc-type="${npcType}" data-c7t-width="${width}" data-c7t-height="${height}">
    <div class="window-content">
${templateHtml}
    </div>
  </div>
</body>
</html>`;
}

export const SHEETS = {
  investigator: {
    template: "templates/investigator/sheet.hbs",
    tabs: ["skills", "summary", "possessions", "background", "growth", "notes", "effects"],
    defaultTab: "skills",
    width: 780,
    height: 780,
  },
  npc: {
    template: "templates/npc/sheet.hbs",
    tabs: ["combat", "skills", "inventory", "description", "keeper", "effects"],
    defaultTab: "combat",
    width: 780,
    height: 780,
  },
  container: {
    template: "templates/container/sheet.hbs",
    tabs: ["items", "description", "keeper", "effects"],
    defaultTab: "items",
    width: 660,
    height: 720,
  },
};

const compiled = {};
function compile(kind) {
  compiled[kind] ??= Handlebars.compile(fs.readFileSync(path.join(MODULE, SHEETS[kind].template), "utf8"));
  return compiled[kind];
}

const VIEWERS = ["gm", "owner", "observer"];

/** 渲染一个状态为 HTML 字符串 */
export async function renderOne(options) {
  const {
    sheet,
    theme = "light",
    editing = false,
    compact = false,
    npcType = "creature",
    viewer = "gm",
    state = "normal",
    formulaMode = false,
    empty = false,
    chrome = true,
  } = options;
  if (!SHEETS[sheet]) throw new Error(`unknown sheet: ${sheet}`);
  if (!VIEWERS.includes(viewer)) throw new Error(`unknown viewer: ${viewer} (${VIEWERS.join(" | ")})`);
  const tab = options.tab ?? SHEETS[sheet].defaultTab;
  const built = await buildContexts({ sheet, tab, editing, compact, dark: theme === "dark", npcType, viewer, state, formulaMode, empty });
  const width = options.width ?? built.width;
  const height = options.height ?? built.height;
  const templateHtml = compile(sheet)(built.html);
  const normalizedState = normalizeState(state);
  return {
    html: wrapHtml(templateHtml, {
      kind: built.kind,
      dark: theme === "dark",
      width,
      height,
      chrome,
      tab,
      viewer,
      state: normalizedState,
      npcType,
    }),
    width,
    height,
    kind: built.kind,
    sheet,
    tab,
    theme,
    viewer,
    state: normalizedState,
    npcType,
    editing: Boolean(built.editing),
    compact,
    formulaMode: Boolean(formulaMode),
    empty: Boolean(empty),
    chrome,
  };
}

const STATE_ORDER = ["wounded", "temp-insane", "indef-insane", "low-res", "san-hit"];

function normalizeState(state) {
  const tokens = parseStates(state);
  const known = STATE_ORDER.filter((token) => tokens.has(token));
  return known.length ? known.join("+") : "normal";
}

/* ---------------- 评审矩阵 ---------------- */
/** 矩阵里的一项：只写与默认值不同的维度，name 由 jobName 生成。 */
function jobName(job) {
  const meta = SHEETS[job.sheet];
  const parts = [job.sheet, job.tab ?? meta.defaultTab];
  parts.push(job.theme ?? "light");
  if (job.formulaMode) parts.push("formula");
  if (job.editing) parts.push("edit");
  if (job.compact) parts.push("compact");
  const state = normalizeState(job.state);
  if (state === STATE_ORDER.join("+")) parts.push("all-active");
  else if (state !== "normal") parts.push(state.replace(/\+/g, "-"));
  if (job.viewer && job.viewer !== "gm") parts.push(job.viewer === "observer" ? "observer" : "playerview");
  if (job.npcType === "npc") parts.push("npctype");
  if (job.empty) parts.push("empty");
  const width = job.width ?? meta.width;
  if (width !== meta.width) parts.push(`w${width}`);
  return parts.join("-");
}

const splitSheetTab = (entry) => {
  const [sheet, tab] = entry.split(":");
  return { sheet, tab };
};

function standardMatrix() {
  const jobs = [];
  // 1) 三张卡全部 tab × 亮/暗
  for (const [sheet, meta] of Object.entries(SHEETS)) {
    for (const tab of meta.tabs) {
      jobs.push({ sheet, tab, theme: "light" });
      jobs.push({ sheet, tab, theme: "dark" });
    }
  }
  // 2) 编辑态基线（含模板里只在编辑态出现的控件）
  for (const entry of ["investigator:skills", "investigator:summary", "npc:combat", "npc:skills", "container:items"]) {
    jobs.push({ ...splitSheetTab(entry), theme: "light", editing: true });
  }
  // 3) 激活状态 / 低资源 / SAN 受伤
  for (const state of ["wounded", "temp-insane", "indef-insane", "low-res", "san-hit", "all-active"]) {
    jobs.push({ sheet: "investigator", tab: "skills", theme: "light", state });
    jobs.push({ sheet: "npc", tab: "combat", theme: "light", state });
  }
  jobs.push({ sheet: "investigator", tab: "skills", theme: "dark", state: "all-active" });
  jobs.push({ sheet: "npc", tab: "combat", theme: "dark", state: "all-active" });
  // 4) NPC 公式模式 / 人类 NPC 类型
  jobs.push({ sheet: "npc", tab: "combat", theme: "light", editing: true, formulaMode: true });
  jobs.push({ sheet: "npc", tab: "combat", theme: "dark", editing: true, formulaMode: true });
  jobs.push({ sheet: "npc", tab: "combat", theme: "light", npcType: "npc" });
  jobs.push({ sheet: "npc", tab: "skills", theme: "light", npcType: "npc" });
  // 5) 非 GM 视角（无守秘/笔记 tab）+ 只读观察者
  for (const entry of ["investigator:skills", "npc:combat", "container:items"]) {
    jobs.push({ ...splitSheetTab(entry), theme: "light", viewer: "owner" });
    jobs.push({ ...splitSheetTab(entry), theme: "light", viewer: "observer" });
  }
  // 6) 宽度档位：调查员 / NPC 700·1020，容器 560·780
  jobs.push({ sheet: "investigator", tab: "skills", theme: "light", width: 700 });
  jobs.push({ sheet: "investigator", tab: "skills", theme: "light", width: 1020 });
  jobs.push({ sheet: "npc", tab: "combat", theme: "light", width: 700 });
  jobs.push({ sheet: "npc", tab: "combat", theme: "light", width: 1020 });
  jobs.push({ sheet: "container", tab: "items", theme: "light", width: 560 });
  jobs.push({ sheet: "container", tab: "items", theme: "light", width: 780 });
  // 7) 紧凑模式
  jobs.push({ sheet: "investigator", tab: "skills", theme: "light", compact: true });
  jobs.push({ sheet: "npc", tab: "combat", theme: "light", compact: true });
  jobs.push({ sheet: "container", tab: "items", theme: "light", compact: true });
  // 8) 容器双栏目录（780 宽）编辑态 + 空容器/空描述/空守秘
  jobs.push({ sheet: "container", tab: "items", theme: "light", width: 780, editing: true });
  jobs.push({ sheet: "container", tab: "items", theme: "light", empty: true });
  jobs.push({ sheet: "container", tab: "items", theme: "dark", empty: true });
  jobs.push({ sheet: "container", tab: "description", theme: "light", empty: true });
  jobs.push({ sheet: "container", tab: "keeper", theme: "light", empty: true });
  return dedupe(jobs);
}

function fullMatrix() {
  const jobs = standardMatrix();
  // 全部 tab 的编辑态（亮）
  for (const [sheet, meta] of Object.entries(SHEETS)) {
    for (const tab of meta.tabs) jobs.push({ sheet, tab, theme: "light", editing: true });
  }
  // 全部 tab 的窄窗（调查员/NPC 700，容器 560）
  for (const [sheet, meta] of Object.entries(SHEETS)) {
    const width = sheet === "container" ? 560 : 700;
    for (const tab of meta.tabs) jobs.push({ sheet, tab, theme: "light", width });
  }
  // 全部 tab 的非 GM 所有者视角（notes / keeper 对非 GM 不可见，跳过，否则没有激活 tab）
  for (const [sheet, meta] of Object.entries(SHEETS)) {
    for (const tab of meta.tabs) {
      if (tab === "notes" || tab === "keeper") continue;
      jobs.push({ sheet, tab, theme: "light", viewer: "owner" });
    }
  }
  return dedupe(jobs);
}

function quickMatrix() {
  const jobs = [];
  for (const [sheet, meta] of Object.entries(SHEETS)) {
    jobs.push({ sheet, tab: meta.defaultTab, theme: "light" });
    jobs.push({ sheet, tab: meta.defaultTab, theme: "dark" });
  }
  return dedupe(jobs);
}

function dedupe(jobs) {
  const seen = new Map();
  for (const job of jobs) {
    const name = jobName(job);
    if (!seen.has(name)) seen.set(name, { ...job, name });
  }
  return [...seen.values()];
}

export const MATRIX_PRESETS = { quick: quickMatrix, standard: standardMatrix, full: fullMatrix };

/* ---------------- CLI ---------------- */
function parseArgs(argv) {
  const args = { out: "/tmp/c7t-art/html" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--out=")) args.out = a.slice(6);
    else if (a === "--out") args.out = argv[++i];
    else if (a.startsWith("--sheet=")) args.sheet = a.slice(8);
    else if (a === "--sheet") args.sheet = argv[++i];
    else if (a.startsWith("--tab=")) args.tab = a.slice(6);
    else if (a === "--tab") args.tab = argv[++i];
    else if (a.startsWith("--theme=")) args.theme = a.slice(8);
    else if (a === "--theme") args.theme = argv[++i];
    else if (a === "--edit") args.editing = true;
    else if (a === "--compact") args.compact = true;
    else if (a === "--empty") args.empty = true;
    else if (a === "--all") args.matrix = "standard";
    else if (a === "--matrix") args.matrix = "standard";
    else if (a.startsWith("--matrix=")) args.matrix = a.slice(9);
    else if (a === "--no-chrome") args.chrome = false;
    else if (a.startsWith("--npc-type=")) args.npcType = a.slice(11);
    else if (a === "--npc-type") args.npcType = argv[++i];
    else if (a === "--formula") args.formulaMode = true;
    else if (a.startsWith("--state=")) args.state = a.slice(8);
    else if (a === "--state") args.state = argv[++i];
    else if (a.startsWith("--viewer=")) args.viewer = a.slice(9);
    else if (a === "--viewer") args.viewer = argv[++i];
    else if (a === "--no-gm") args.viewer = "owner";
    else if (a.startsWith("--width=")) args.width = Number(a.slice(8));
    else if (a === "--width") args.width = Number(argv[++i]);
    else if (a.startsWith("--height=")) args.height = Number(a.slice(9));
    else if (a === "--height") args.height = Number(argv[++i]);
    else if (a.startsWith("--filter=")) args.filter = a.slice(9);
    else if (a === "--filter") args.filter = argv[++i];
    else if (a === "--list") args.list = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function write(name, html, out) {
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${name}.html`);
  fs.writeFileSync(file, html);
  return file;
}

function snapshotMeta(out, jobs, preset) {
  const git = (cmd) => {
    try {
      return execFileSync("git", cmd, { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  };
  const fileStat = (file) => {
    try {
      const stat = fs.statSync(file);
      return { mtime: stat.mtime.toISOString(), size: stat.size };
    } catch {
      return null;
    }
  };
  return {
    generatedAt: new Date().toISOString(),
    node: process.version,
    git: {
      head: git(["rev-parse", "HEAD"]),
      branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
      dirty: git(["status", "--porcelain"]).length > 0,
    },
    assets: {
      css: MODULE_CSS.map((file) => ({ file, ...fileStat(file) })),
      templates: Object.values(SHEETS).map((meta) => ({ file: path.join(MODULE, meta.template), ...fileStat(path.join(MODULE, meta.template)) })),
    },
    matrix: preset ?? null,
    count: jobs.length,
    output: out,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(new URL("./README.md", import.meta.url), "utf8"));
    return;
  }
  const out = args.out;
  let jobs = [];
  let preset = null;

  if (args.matrix) {
    preset = args.matrix === true ? "standard" : args.matrix;
    if (!(preset in MATRIX_PRESETS)) throw new Error(`unknown matrix preset: ${preset} (quick | standard | full)`);
    const built = MATRIX_PRESETS[preset]().map((job) => ({ name: jobName(job), opts: job }));
    jobs = args.filter ? built.filter((job) => job.name.includes(args.filter)) : built;
  } else {
    const sheet = args.sheet ?? "investigator";
    const opts = {
      sheet,
      tab: args.tab,
      theme: args.theme ?? "light",
      editing: Boolean(args.editing),
      compact: Boolean(args.compact),
      empty: Boolean(args.empty),
      npcType: args.npcType ?? "creature",
      viewer: args.viewer ?? "gm",
      state: args.state ?? "normal",
      formulaMode: Boolean(args.formulaMode),
      chrome: args.chrome !== false,
      width: args.width,
      height: args.height,
    };
    jobs = [{ name: jobName(opts), opts }];
    if (args.filter) jobs = jobs.filter((job) => job.name.includes(args.filter));
  }

  if (args.list) {
    console.log(JSON.stringify({ preset, count: jobs.length, names: jobs.map((job) => job.name) }, null, 2));
    return;
  }

  const manifest = [];
  for (const job of jobs) {
    const rendered = await renderOne(job.opts);
    const file = write(job.name, rendered.html, out);
    manifest.push({
      name: job.name,
      file,
      width: rendered.width,
      height: rendered.height,
      chrome: rendered.chrome,
      sheet: rendered.sheet,
      tab: rendered.tab,
      theme: rendered.theme,
      viewer: rendered.viewer,
      state: rendered.state,
      npcType: rendered.npcType,
      editing: rendered.editing,
      compact: rendered.compact,
      formulaMode: rendered.formulaMode,
      empty: rendered.empty,
    });
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(snapshotMeta(out, jobs, preset), null, 2));
  console.log(JSON.stringify({ out, preset, count: manifest.length }, null, 2));
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
