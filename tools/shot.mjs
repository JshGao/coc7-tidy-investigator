/**
 * 用无头 Chrome 把 render.mjs 生成的 HTML 截图为 PNG（开发工具，不随模组发布）。
 *
 * 用法：
 *   node tools/shot.mjs --all
 *   node tools/shot.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/png --only summary
 *   node tools/shot.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/png --budget 20000
 *   node tools/shot.mjs --contact /tmp/c7t-art/png --cols 4
 *
 * 注意：
 * - 默认 `--virtual-time-budget=20000`。Foundry 核心 CSS + CoC7 system.css + 卡片 CSS 体积大，
 *   预算太小时 Chrome 会在部分 CSS 应用前截图，出现「白底原生 button」之类的假污染。
 *   如遇疑似旧样式，先用更大的 --budget 复测，再删 /tmp/c7t-art/profiles 重跑。
 * - 联系表按 PNG 实际像素尺寸等比缩放，不再裁掉方图的底部。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAD = 30;
const CONTACT_CELL_W = 520;
const CONTACT_GAP = 18;
const CAPTION_H = 24;

function parseArgs(argv) {
  const args = {
    dir: "/tmp/c7t-art/html",
    out: "/tmp/c7t-art/png",
    scale: 2,
    chrome: true,
    budget: 20000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--dir=")) args.dir = a.slice(6);
    else if (a === "--dir") args.dir = argv[++i];
    else if (a.startsWith("--out=")) args.out = a.slice(6);
    else if (a === "--out") args.out = argv[++i];
    else if (a.startsWith("--only=")) args.only = a.slice(7);
    else if (a === "--only") args.only = argv[++i];
    else if (a.startsWith("--scale=")) args.scale = Number(a.slice(8));
    else if (a === "--scale") args.scale = Number(argv[++i]);
    else if (a.startsWith("--budget=")) args.budget = Number(a.slice(9));
    else if (a === "--budget") args.budget = Number(argv[++i]);
    else if (a.startsWith("--contact=")) args.contact = a.slice(10);
    else if (a === "--contact") args.contact = argv[++i];
    else if (a.startsWith("--cols=")) args.cols = Number(a.slice(7));
    else if (a === "--cols") args.cols = Number(argv[++i]);
    else if (a === "--all") args.all = true;
  }
  return args;
}

/** 读取 PNG 的 IHDR，拿到真实像素宽高（用于联系表等比布局）。 */
function pngSize(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(24);
    fs.readSync(fd, buffer, 0, 24, 0);
    if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}

const RUN_ID = `${Date.now()}-${process.pid}`;
let profileSeq = 0;
function screenshot(htmlFile, pngFile, width, height, scale, budget) {
  fs.mkdirSync(path.dirname(pngFile), { recursive: true });
  const profile = `/tmp/c7t-art/profiles/${RUN_ID}-p${profileSeq++}`;
  fs.mkdirSync(profile, { recursive: true });
  execFileSync(
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
      `--user-data-dir=${profile}`,
      `--force-device-scale-factor=${Math.max(1, Number(scale) || 2)}`,
      `--window-size=${Math.round(width)},${Math.round(height)}`,
      `--virtual-time-budget=${Math.max(1000, Number(budget) || 20000)}`,
      "--incognito",
      "--disk-cache-size=1",
      "--run-all-compositor-stages-before-draw",
      `--screenshot=${pngFile}`,
      `file://${htmlFile}`,
    ],
    { stdio: "ignore", timeout: 180000 },
  );
}

function contactSheet(dir, cols, budget) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort();
  const rows = [];
  for (let i = 0; i < files.length; i += cols) rows.push(files.slice(i, i + cols));
  const cellW = CONTACT_CELL_W;
  const rowInfo = rows.map((row) => {
    const items = row.map((file) => {
      const size = pngSize(path.join(dir, file)) ?? { width: cellW, height: Math.round(cellW * 0.86) };
      const scaledH = Math.max(1, Math.round((size.height / size.width) * cellW));
      return { file, scaledH };
    });
    const imgH = Math.max(...items.map((item) => item.scaledH));
    return { items, imgH, figureH: imgH + CAPTION_H };
  });
  const totalH = rowInfo.reduce((sum, row) => sum + row.figureH, 0) + CONTACT_GAP * Math.max(0, rowInfo.length - 1) + 48;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#111;font:12px/1.4 -apple-system,sans-serif;color:#ccc}
    .grid{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:${CONTACT_GAP}px}
    figure{margin:0;display:flex;flex-direction:column}
    .frame{width:${cellW}px;display:flex;align-items:flex-start;justify-content:center}
    img{max-width:${cellW}px;width:100%;height:auto;display:block;border-radius:4px;box-shadow:0 4px 18px #000a;background:#222}
    figcaption{padding:4px 2px;color:#999;font-size:11px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:${CAPTION_H}px;box-sizing:border-box}
  </style></head><body><div class="grid">
  ${rowInfo
    .flatMap((row) => row.items.map((item) => `<figure><div class="frame" style="height:${row.imgH}px"><img style="max-height:${row.imgH}px" src="file://${path.join(dir, item.file)}"></div><figcaption>${item.file.replace(/\.png$/, "")}</figcaption></figure>`))
    .join("\n")}
  </div></body></html>`;
  const file = path.join("/tmp/c7t-art", `contact-${path.basename(dir)}.html`);
  fs.writeFileSync(file, html);
  const png = path.join("/tmp/c7t-art", `contact-${path.basename(dir)}.png`);
  screenshot(file, png, cols * (cellW + CONTACT_GAP) + 48, totalH, 1, budget);
  return png;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const budget = args.budget;
  if (args.contact) {
    const png = contactSheet(args.contact, args.cols ?? 4, budget);
    console.log(png);
    return;
  }
  const manifestPath = path.join(args.dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`manifest not found: ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const jobs = manifest.filter((job) => !args.only || job.name.includes(args.only));
  fs.mkdirSync(args.out, { recursive: true });
  const pngs = [];
  for (const job of jobs) {
    const png = path.join(args.out, `${job.name}.png`);
    screenshot(job.file, png, job.width + PAD * 2, job.height + PAD * 2, args.scale, budget);
    pngs.push(png);
    console.log(`${job.name}  ${png}`);
  }
  console.log(JSON.stringify({ count: pngs.length, out: args.out, budget }));
}

main();
