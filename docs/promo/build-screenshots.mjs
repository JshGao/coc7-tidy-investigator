#!/usr/bin/env node
/**
 * 重出 README / 宣传稿引用的全套截图（2x）到 docs/screenshots/。
 *
 * 渲染走 tools/ 的真实模板 + 真实 CSS + Foundry / CoC7 核心 CSS 管线，
 * 不修改 tools/**：本脚本只 import `tools/render.mjs` 的 `renderOne` 生成 HTML，
 * 再调用 `tools/shot.mjs` 统一截图（默认 2x、--budget 20000）。
 *
 * 用法：
 *   node docs/promo/build-screenshots.mjs                 # 全部重出
 *   node docs/promo/build-screenshots.mjs --only npc      # 只重出名字含 npc 的
 *   node docs/promo/build-screenshots.mjs --only investigator
 *   node docs/promo/build-screenshots.mjs --contact       # 额外拼联系表
 *
 * 尺寸约定（与旧截图一致，@2x 含 shot.mjs 的 30px 窗口留白）：
 *   调查员 780×800 → 1680×1720 · NPC 780×900 → 1680×1920 · 容器 660×780 → 1440×1680
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderOne } from "../../tools/render.mjs";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const DEFAULT_OUT = path.join(ROOT, "docs/screenshots");
const WORK = "/tmp/c7t-promo/screens";
const PAD = 30;
const SCALE = 2;

/** 要出的截图：name = docs/screenshots 下的文件名（不含 .png）。 */
const SHOTS = [
  // 调查员 · 780×800
  { name: "skills", sheet: "investigator", tab: "skills", height: 800 },
  { name: "summary", sheet: "investigator", tab: "summary", height: 800 },
  { name: "possessions", sheet: "investigator", tab: "possessions", height: 800 },
  { name: "background", sheet: "investigator", tab: "background", height: 800 },
  { name: "growth", sheet: "investigator", tab: "growth", height: 800 },
  { name: "notes", sheet: "investigator", tab: "notes", height: 800 },
  { name: "effects", sheet: "investigator", tab: "effects", height: 800 },
  { name: "skills-edit", sheet: "investigator", tab: "skills", height: 800, editing: true },
  { name: "compact", sheet: "investigator", tab: "skills", height: 800, compact: true },
  // 生物 / NPC · 780×900
  { name: "npc-combat", sheet: "npc", tab: "combat", height: 900 },
  { name: "npc-combat-edit", sheet: "npc", tab: "combat", height: 900, editing: true },
  { name: "npc-skills", sheet: "npc", tab: "skills", height: 900 },
  { name: "npc-dark", sheet: "npc", tab: "combat", height: 900, theme: "dark" },
  // 容器 · 660×780
  { name: "container", sheet: "container", tab: "items", height: 780 },
];

function parseArgs(argv) {
  const args = { only: "", contact: false, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--contact") args.contact = true;
    else if (a.startsWith("--only=")) args.only = a.slice(7);
    else if (a === "--only") args.only = argv[++i];
    else if (a.startsWith("--out=")) args.out = a.slice(6);
    else if (a === "--out") args.out = argv[++i];
  }
  return args;
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

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(" ")} 退出码 ${res.status}`);
}

const args = parseArgs(process.argv.slice(2));
const jobs = SHOTS.filter((shot) => !args.only || shot.name.includes(args.only));
if (!jobs.length) throw new Error(`没有匹配 --only=${args.only} 的截图`);

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, "html"), { recursive: true });
fs.mkdirSync(path.join(WORK, "png"), { recursive: true });
const OUT = path.resolve(args.out);
fs.mkdirSync(OUT, { recursive: true });

const manifest = [];
for (const job of jobs) {
  const rendered = await renderOne({
    sheet: job.sheet,
    tab: job.tab,
    theme: job.theme ?? "light",
    editing: Boolean(job.editing),
    compact: Boolean(job.compact),
    height: job.height,
  });
  const name = `shot-${job.name}`;
  const file = path.join(WORK, "html", `${name}.html`);
  fs.writeFileSync(file, rendered.html);
  manifest.push({
    name,
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
  });
  console.log(`· 渲染 ${job.name}  ${rendered.width}×${rendered.height}`);
}
fs.writeFileSync(path.join(WORK, "html", "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`· 无头 Chrome 截图 ${jobs.length} 张（2x）…`);
run("node", ["tools/shot.mjs", "--dir", path.join(WORK, "html"), "--out", path.join(WORK, "png"), "--budget", "20000"]);

const rows = [];
for (const job of jobs) {
  const src = path.join(WORK, "png", `shot-${job.name}.png`);
  const dest = path.join(OUT, `${job.name}.png`);
  if (!fs.existsSync(src)) throw new Error(`截图缺失：${src}`);
  fs.copyFileSync(src, dest);
  const size = pngSize(dest);
  const expectedW = (manifest.find((entry) => entry.name === `shot-${job.name}`).width + PAD * 2) * SCALE;
  const expectedH = (manifest.find((entry) => entry.name === `shot-${job.name}`).height + PAD * 2) * SCALE;
  if (size.width !== expectedW || size.height !== expectedH) {
    throw new Error(`${job.name}.png 尺寸 ${size.width}×${size.height}，预期 ${expectedW}×${expectedH}`);
  }
  rows.push({ file: path.relative(ROOT, dest), size: `${size.width}×${size.height}`, bytes: fs.statSync(dest).size });
}

if (args.contact) {
  // 联系表由 tools/shot.mjs 拼到 /tmp/c7t-art/contact-png.png，便于整组抽查
  console.log("· 拼接联系表 …");
  run("node", ["tools/shot.mjs", "--contact", path.join(WORK, "png"), "--cols", "4", "--budget", "20000"]);
}

console.log(JSON.stringify({ count: rows.length, out: path.relative(ROOT, OUT), files: rows }, null, 2));
