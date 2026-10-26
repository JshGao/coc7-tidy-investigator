[English](#coc7-tidy-sheets) | [中文](#coc7-tidy-角色卡)

# CoC7 Tidy Sheets

Tidy 5e Sheets-style character sheets for **Call of Cthulhu 7e** on **Foundry VTT 14**:
**Investigator** + **NPC / Creature** + **Container** sheets.
Opt-in registration — the system's default sheets are never replaced. Pure Handlebars + CSS, no build dependencies.

**Current version: 0.9.0**

- Foundry VTT: `>= 14` (verified on 14.368)
- CoC7: `>= 8.16`

**Visual language (v0.9 "Investigator Dossier")**: dark lacquered banner, brass hairlines,
aged paper, ink table headers and oxblood accents; hand-drawn SVG shields / icons and
locally bundled OFL typefaces (Cinzel, EB Garamond, Roboto Condensed).

## Sheets

### Investigator (`character`)

- Banner: portrait, identity, resource bars (drag to reorder once unlocked), eight shield-shaped characteristic badges, condition chips, Daily SAN
- Seven tabs: Skills / Summary / Possessions / Background / Growth / Notes (GM) / Effects
- Skills: search, three-way sorting, specialization groups, favorites, inline occupation / interest / development points in edit mode, drag reordering
- Summary: weapon quick reference + attack / roll damage + six categories of invested skill chips
- Possessions: collapsible sections, drag reordering, item quantity editing, context menu
- Background: seven backstory cards + multi-select key connections + backstory + encounters
- Growth: Develop all, per-check records, editable module-name groups, manual value editing, undo
- Notes: Keeper notes, book progress, SAN events, Mythos flags, clear conditions
- Effects: create / open / enable-disable / delete

### NPC / Creature (`npc` + `creature`)

- Banner: type / occupation info, HP/MP/SAN/Luck (empty values hidden), DB / Build / MOV / Armor, eight shield badges (missing values show `—`), condition chips
- Six tabs: Combat (default) / Skills / Inventory / Description / Keeper (GM) / Effects
- Combat: attacks per round (rollable), SAN loss (native system link card), armor notes, weapon table (attack / roll damage / shotgun range bands), special abilities quick reference, movement modes (primary MOV plus extra movement add/remove)
- Skills: search, three-way sorting, specialization groups, inline current value; no growth / occupation / interest split
- Inventory: armor / books / spells / talents / items / statuses sections, collapsing, drag reordering, quantity editing; no money strip
- Description: type / occupation / age / organization + `personalDescription` rich text
- Keeper: GM notes, dice macros (drag to add / execute / delete), clear conditions
- Edit mode: formula mode (batch characteristic formulas + roll characteristics / average), auto-calculation toggles, inline resource and derived-value editing

### Container (`container`)

- Compact banner: portrait / name / item count / per-type count chips
- Four tabs: Contents (default) / Description / Keeper (GM) / Effects
- Contents: weapons / armor / books / spells / talents / items / statuses sections, collapsing, quantity editing, drag reordering in edit mode, group +
- Description / Keeper prose-mirror; uses AppV2 native drag and drop

### Common

- Settings: compact mode, remember window size, default skill sorting
- Eight-way window resizing, dark theme follows Foundry
- English / Chinese UI (follows Foundry's language setting)

## Installation

Extract this folder into `Data/modules/coc7-tidy-investigator/`, or install the module in Foundry with the Manifest URL.
After enabling the module, choose **CoC7 Tidy Investigator Sheet**, **CoC7 Tidy NPC / Creature Sheet** or **CoC7 Tidy Container Sheet** in the actor's *Configure Sheet* dialog.

## Development notes

- `scripts/sheets/base-sheet.js`: AppV2 base class (window size, eight-way resizing, common actions, search / context menu / drag)
- `scripts/sheets/investigator-sheet.js`: investigator-only actions and listeners
- `scripts/sheets/npc-sheet.js`: NPC / creature-only actions and listeners
- `scripts/sheets/container-sheet.js`: container sheet
- `scripts/services/view-data.js`: pure data preparation for banner / resources / characteristics
- `scripts/services/tabs-data.js`: view models for the tabs (shared by two sheets)
- `scripts/services/npc-data.js`: NPC-only view models (SAN loss / attacks per round / movement / macros / description)
- `scripts/services/container-data.js`: container view models (counts / description)
- `templates/`: `investigator/sheet.hbs` and `npc/sheet.hbs` are the single PART each; everything else is a partial / tab fragment
- `styles/`: `tokens.css` light and dark tokens, `sheet.css` shared components, `npc.css` NPC components, `container.css` container components

Notes:

1. Every AppV2 PART must have exactly one root element.
2. Array fields (such as `system.biography`, `system.books`, `system.special.movement`) cannot rely on form `name` submission — read the array, change the value and write the whole array back.
3. A development check must be passed `item.uuid` (the system uses `fromUuid()` internally).
4. The NPC sheet's SAN loss uses the public `CONFIG.CoC7Link` API to create a system link card and never references the private `CoC7SanCheckCard`.
5. The NPC / creature sheet window uses the `c7t-npc` class to avoid clashing with the system's `.npc` styles.

## Links

- Repository: <https://github.com/JshGao/coc7-tidy-investigator>
- The full README (English / Chinese), design documents and screenshots live in the repository root.

## License

MIT

Bundled fonts (Cinzel, EB Garamond, Roboto Condensed) are licensed under the SIL Open Font License 1.1;
see `assets/fonts/licenses/`.

---

[English](#coc7-tidy-sheets) | [中文](#coc7-tidy-角色卡)

# CoC7 Tidy 角色卡

*Tidy-style investigator, NPC/creature and container sheets for Call of Cthulhu 7e on Foundry VTT 14.*

**当前版本：0.9.0**

仿 **Tidy 5e Sheets** 风格的 CoC7 角色卡：**调查员卡** + **生物 / NPC 卡** + **容器卡**，可选注册、不替换系统默认卡。
纯 Handlebars + CSS，无构建依赖。

**视觉语言（v0.9「调查员档案」）**：深色漆面横幅、黄铜饰线、做旧纸张、墨色表头、牛血红强调；
盾徽 / 图标为自制 SVG；本地打包 Cinzel / EB Garamond / Roboto Condensed 三款 OFL 字体。

- Foundry VTT：`>= 14`（14.368 验证）
- CoC7：`>= 8.16`

## 功能

### 调查员卡（`character`）

- 横幅：头像、身份、资源条（解锁后可拖拽排序）、八枚盾形特性徽章、状态芯片、今日 SAN
- 七个标签页：技能 / 简表 / 物品 / 背景 / 成长 / 笔记（GM）/ 效果
- 技能：搜索、三态排序、专长分组、收藏、编辑态职业/兴趣/成长点内联编辑、拖拽排序
- 简表：武器速查 + 攻击/掷伤害 + 六类已投入技能芯片
- 物品：分节折叠、拖拽排序、道具数量编辑、右键菜单
- 背景：七要素卡片 + 关键链接多选 + 背景故事 + 遭遇记录
- 成长：一键成长、逐条记录、可编辑模组名分组、手动改值、撤销
- 笔记：守秘笔记、书籍进度、SAN 事件、神话标记、清除状态
- 效果：新增 / 打开 / 启停 / 删除

### 生物 / NPC 卡（`npc` + `creature`）

- 横幅：类型 / 职业信息、HP/MP/SAN/幸运（空值自动隐藏）、DB/体格/MOV/护甲、八枚盾形特性徽章（缺值显示 `—`）
- 六个标签页：战斗（默认）/ 技能 / 物品 / 描述 / 守秘（GM）/ 效果
- 战斗：每轮攻击次数（可掷）、SAN 损失（生成系统原生链接卡）、护甲备注、武器表（攻击/掷伤害/霰弹枪分档）、特殊能力速查、移动方式（主 MOV + 额外移动增删）
- 技能：搜索、三态排序、专长分组、当前值内联编辑；无成长/职业/兴趣拆分
- 物品：护甲/书籍/法术/天赋/道具/状态分节，折叠、拖拽、数量编辑；无货币条
- 描述：类型/职业/年龄/组织 + personalDescription 富文本
- 守秘：GM 笔记、骰子宏（拖入添加 / 执行 / 删除）、清除状态
- 编辑态：公式模式（批量特性公式 + 掷特性 / 取平均）、auto 齿轮、资源/派生内联编辑

### 容器卡（`container`）

- 紧凑横幅：头像 / 名称 / 容器件数 / 分类计数芯片
- 四个标签页：内容（默认）/ 描述 / 守秘（GM）/ 效果
- 内容页：武器/护具/书籍/法术/天赋/道具/状态分节，折叠、数量编辑、编辑态拖拽排序、分组 +
- 描述 / 守秘 prose-mirror；复用 AppV2 原生拖放

### 通用

- 设置：紧凑模式、记住窗口尺寸、技能默认排序
- 窗口八向缩放、暗色主题跟随 Foundry
- 英文 / 中文界面

## 安装

把本目录放到 `Data/modules/coc7-tidy-investigator/`，或在 Foundry 里用 Manifest URL 安装。
启用模块后，在角色「配置界面 → 角色卡」里选择 **CoC7 Tidy 调查员卡**、**CoC7 Tidy NPC / 生物卡** 或 **CoC7 Tidy 容器卡**。

## 开发说明

- `scripts/sheets/base-sheet.js`：AppV2 基类（窗口尺寸、八向缩放、通用 actions、搜索/右键/拖拽）
- `scripts/sheets/investigator-sheet.js`：调查员卡专属动作与监听
- `scripts/sheets/npc-sheet.js`：生物 / NPC 卡专属动作与监听
- `scripts/sheets/container-sheet.js`：容器卡
- `scripts/services/view-data.js`：横幅/资源/特性等纯数据整理
- `scripts/services/tabs-data.js`：各 tab 的视图模型（两卡共用）
- `scripts/services/npc-data.js`：生物卡专属视图模型（SAN 损失/每轮攻击/移动/宏/描述）
- `scripts/services/container-data.js`：容器卡视图模型（计数/描述）
- `templates/`：`investigator/sheet.hbs`、`npc/sheet.hbs` 各为唯一 PART，其余为 partial / tab 片段
- `styles/`：`tokens.css` 亮暗 token、`sheet.css` 共用组件、`npc.css` 生物卡组件、`container.css` 容器卡组件

注意：

1. AppV2 每个 PART 必须只有一个根元素；
2. 数组字段（如 `system.biography`、`system.books`、`system.special.movement`）不能依赖表单 `name` 提交，需读数组改值后整组写回；
3. 成长检定必须传 `item.uuid`（系统内部 `fromUuid()`）；
4. 生物卡的 SAN 损失通过公开的 `CONFIG.CoC7Link` 生成系统链接卡，不引用私有 `CoC7SanCheckCard`；
5. 生物 / NPC 卡的窗口类名使用 `c7t-npc`，避免与系统 `.npc` 样式冲突。

## 链接

- 仓库：<https://github.com/JshGao/coc7-tidy-investigator>

## 许可

MIT

随包字体（Cinzel / EB Garamond / Roboto Condensed）采用 SIL Open Font License 1.1，
授权文件见 `assets/fonts/licenses/`。
