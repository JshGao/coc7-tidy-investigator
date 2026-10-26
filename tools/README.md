# tools/ · CoC7 Tidy 角色卡渲染与视觉审计（开发工具，不随模组发布）

这套工具用**真实 Handlebars 模板 + 真实 CSS**（Foundry 14 核心 CSS + Font Awesome + CoC7 system.css + 模组 tokens/sheet/npc/container，全部内联进 HTML）在无头 Chrome 里渲染三张卡，产出 2x 截图、联系表与自动审计报告。

```
tools/
├── fixtures.mjs     mock actor + 模板上下文（状态 / 视角 / 公式模式等夹具维度）
├── render.mjs       HTML 渲染 + 评审矩阵
├── shot.mjs         无头 Chrome 2x 截图 + 联系表
├── audit.mjs        对比度 / 溢出 / 破图 / 控件污染 / 字体 / tab / 布局审计
├── audit-page.js    注入页面的只读探针（由 audit.mjs 通过 CDP 注入）
└── node_modules/    handlebars（已安装）
```

依赖：Node ≥ 22（用到内置 `WebSocket` / `fetch`）、Google Chrome、Foundry VTT 14 与 CoC7 系统、macOS `sips`（仅裁图用）。

本机路径默认按 macOS 约定推导，可用环境变量覆盖（CI / 非默认安装位置）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `FOUNDRY_DATA` | `~/Library/Application Support/FoundryVTT/Data` | Foundry 用户数据目录 |
| `COC7_SYSTEM` | `$FOUNDRY_DATA/systems/CoC7` | CoC7 系统目录 |
| `FOUNDRY_APP` | `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/public` | Foundry 程序 public 目录（核心 CSS / 图标） |

---

## 1. 一键评审矩阵

```bash
# 标准评审矩阵（77 页：三卡全 tab × 亮/暗 + 状态/视角/宽度/紧凑/编辑/NPC 变体 + 容器空态/780 编辑）
node tools/render.mjs --matrix --out /tmp/c7t-art/html

# 快速冒烟（6 页：每卡默认 tab × 亮/暗）
node tools/render.mjs --matrix=quick --out /tmp/c7t-art/html

# 完整矩阵（114 页：额外覆盖全部 tab 的编辑态 / 窄窗 / 非 GM 视角；非 GM 跳过 notes/keeper）
node tools/render.mjs --matrix=full --out /tmp/c7t-art/html

# 只渲染匹配名字的子集（--matrix 与单页模式都支持）
node tools/render.mjs --matrix --filter=investigator --out /tmp/c7t-art/html
node tools/render.mjs --matrix --list          # 只列页面名，不渲染
```

渲染输出：

- `<out>/<name>.html`：自包含页面（CSS 内联，字体/图片走 `file://` 绝对路径）
- `<out>/manifest.json`：页面清单（宽高、sheet、tab、theme、viewer、state、npcType…）
- `<out>/meta.json`：生成时间、git HEAD/branch、CSS/模板 mtime，便于复现

## 2. 单页渲染

```bash
node tools/render.mjs --sheet investigator --tab summary --theme dark --out /tmp/x
node tools/render.mjs --sheet investigator --tab skills --state wounded,low-res,san-hit --out /tmp/x
node tools/render.mjs --sheet npc --tab combat --edit --formula --theme light --out /tmp/x
node tools/render.mjs --sheet npc --tab combat --npc-type=npc --out /tmp/x
node tools/render.mjs --sheet container --tab items --viewer=observer --out /tmp/x
node tools/render.mjs --sheet container --tab items --empty --out /tmp/x
node tools/render.mjs --sheet investigator --tab skills --width 700 --height 780 --out /tmp/x
```

参数：

| 参数 | 说明 |
|---|---|
| `--sheet investigator\|npc\|container` | 卡片类型，默认 `investigator` |
| `--tab <id>` | 激活 tab，默认取该卡首个 tab |
| `--theme light\|dark` | 主题，默认 `light` |
| `--edit` / `--compact` / `--empty` | 编辑态 / 紧凑模式 / 空容器（容器卡：空物品、空描述、空守秘） |
| `--state <list>` | 逗号分隔状态：`wounded`（重伤）、`temp-insane`（临时疯狂）、`indef-insane`（长期疯狂）、`low-res`（HP ≤25%）、`san-hit`（SAN 受伤）、`all-active`（上述全开）；传 `normal` 复位 |
| `--viewer gm\|owner\|observer` | 视角：GM / 非 GM 所有者 / 只读观察者（非 GM 会隐藏「守秘」「笔记」tab，与 sheet 脚本一致） |
| `--no-gm` | `--viewer=owner` 的简写 |
| `--formula` | NPC 公式模式（需要 `--edit`，对应 `system.flags.displayFormula=true`） |
| `--npc-type creature\|npc` | 生物 / 人类 NPC（人类 NPC 有 APP/EDU/SAN/幸运，副标题走职业分支） |
| `--width` / `--height` | 覆盖窗口尺寸；矩阵默认 780×780（容器 660×720） |
| `--no-chrome` | 不渲染窗口外壳（无内边距与窗口投影） |
| `--out` | 输出目录，默认 `/tmp/c7t-art/html` |

文件命名规则：`<sheet>-<tab>-<theme>[-formula][-edit][-compact][-<state>][-playerview|-observer][-npctype][-w<width>]`，
例如 `npc-combat-light-formula-edit`、`investigator-skills-light-wounded`。

## 3. 截图与联系表

```bash
node tools/shot.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/png
node tools/shot.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/png --only investigator
node tools/shot.mjs --contact /tmp/c7t-art/png --cols 4
```

- 默认 `--budget=20000`（`--virtual-time-budget`）。**不要随意调小**：Foundry + CoC7 CSS 体积大，预算不足会在样式应用前截图，出现「白底原生按钮 / 黑框行图标」等假象。
- 截图固定 `--force-device-scale-factor=2`（联系表 1x）；随机 profile + 禁缓存，避免旧样式命中。
- 联系表按 PNG IHDR 真实宽高等比缩放（方图不会再被裁掉底部），caption 与图像之间有固定间距。
- 若仍怀疑旧样式：删掉 `/tmp/c7t-art/png` 与 `/tmp/c7t-art/profiles` 后重跑。

## 4. 自动审计

```bash
node tools/audit.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/audit
node tools/audit.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/audit --only investigator --strict
node tools/audit.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/audit --crops --png-dir /tmp/c7t-art/png
```

| 参数 | 说明 |
|---|---|
| `--dir` | render.mjs 的输出目录（读取 `manifest.json`） |
| `--out` | 报告目录，默认 `/tmp/c7t-art/audit` |
| `--png-dir` | 正式截图目录，用于在报告里引用截图并检查是否过期 |
| `--only` | 只审计名字包含该子串的页面 |
| `--limit` | 只审计前 N 页（调试用） |
| `--shots` | 额外保存「文字透明」背景截图到 `<out>/shots/` |
| `--crops` | 用 `sips` 从正式截图裁出 P0/P1 局部图到 `<out>/crops/` |
| `--no-sample` | 跳过背景像素采样（对比度退化为 computed-style 近似值） |
| `--strict` | 存在 P0/P1 时以退出码 1 结束（可接 CI） |

输出：

- `report.json`：每页指标、问题明细与证据（前景/背景色、对比度、选择器、矩形）
- `issues.json`：扁平问题清单，按 P0 → P1 → P2 排序，含截图路径与责任文件提示
- `summary.txt`：中文可读摘要（问题列表 + 截图是否过期）
- `shots/`、`crops/`：可选截图产物

检查项：

1. **文字对比度**：先采集文本节点矩形与 computed color，再把文字临时透明化后截图，取矩形内背景像素中位数，按 WCAG 计算对比度。正文要求 4.5:1，次要文字（`em`/`small`/mute/dim/hint 等）与大字要求 3:1；`< 3:1` 记为 P1，边缘值（如 4.2~4.5）记为 P2。同一选择器 + 同色的重复文本会合并计数。
2. **横向溢出 / 裁切**：页面横向滚动（P0）、元素横向探出窗口、被 `overflow:hidden` 祖先裁切、关键标签被 `text-overflow: ellipsis` 截断。纵向内容超出窗口属于内容区正常滚动，不误报。
3. **空 / 破图**：`img.naturalWidth === 0`、`<use href="#symbol">` 找不到对应 `<symbol>`。
4. **控件核心样式污染（启发式）**：`appearance` 未复位、字体栈命中 Foundry 核心字体等；CSS 已内联，之前由截图竞态造成的「白底按钮」假象不再作为规则。
5. **字体**：`document.fonts.check()`、可见元素自定义字体加载状态；隐藏 tab 不参与（不触发加载）。
6. **tab 一致性**：导航与内容区 id 对应、激活 tab 与渲染参数一致、非 GM 页面不得出现 `notes`/`keeper`。
7. **状态 / 视角 / 模式**：`low-res` 是否出现 `.is-low`、激活状态是否有 `.c7t-chip.is-active`、`--formula` 是否有 `.is-formula`、`--compact` 是否有 `.is-compact`、observer 是否无编辑控件。
8. **布局**：同级关键元素重叠、横幅占比过高、激活 tab 尺寸为 0、调查员收藏侧栏缺失等。

## 5. 建议的验收流程

```bash
# 1) 定稿后重新渲染 + 截图
node tools/render.mjs --matrix --out /tmp/c7t-art/html
node tools/shot.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/png --budget 20000
node tools/shot.mjs --contact /tmp/c7t-art/png --cols 4

# 2) 审计 + 局部裁图
node tools/audit.mjs --dir /tmp/c7t-art/html --out /tmp/c7t-art/audit --crops

# 3) 看摘要
open /tmp/c7t-art/audit/summary.txt
```

验收记录写入 `docs/06-视觉验收报告.md`；`docs/05-美术风格设计.md` 第 9 节若引用本文件，可直接链接本文。

## 6. 已知限制

- 对比度采样依赖无头 Chrome 渲染的真实像素；渐变、纹理、背景图都已被包含在内，但半透明叠加的极端情况仍可能与肉眼略有差异。
- 控件污染是启发式规则，可能误报，报告里标为 P2 供人工复核。
- 只读探针只读取 DOM / computed style，不修改页面数据；文字透明化仅用于截图采样，不改变布局。
- 审计在 CDP 中按 manifest 顺序逐页执行，77 页约 25–60 秒。
