# CoC7 Tidy 角色卡
### coc7-tidy-investigator · Foundry VTT 14 · Call of Cthulhu 7e

把 CoC7 的角色卡做成 **Tidy 5e Sheets** 那种干净、信息密度高的样子：
**调查员卡** + **生物 / NPC 卡** + **容器卡**。
可选注册，**不替换**系统默认卡；纯 Handlebars + CSS，无构建依赖。

**当前版本：0.8.2**（2026-10-22） · [Release Notes](https://github.com/JshGao/coc7-tidy-investigator/releases/latest)

![封面](docs/screenshots/cover.png)

---

## 特性

**顶部横幅**：头像、姓名、锁/解锁、职业/年龄/性别等身份信息；HP / MP / SAN / 幸运资源条（解锁后可拖拽调整顺序）；伤害加值 / 体格 / 移动力 / 护甲；八枚盾形特性徽章（编辑态内联输入）；七种状态芯片；今日 SAN 计数。
点击「理智」或「幸运」可直接发起对应检定。

**七个标签页**

| 标签 | 内容 |
|---|---|
| 技能 | 搜索、按数值/名称/自定义排序、专长分组、成长勾选、收藏、行首显示技能自身图标；编辑态拆出「基础 / 职业 / 兴趣 / 成长点 / 当前」并可内联编辑 |
| 简表 | 武器速查（技能% / 伤害 / 射程 / 每轮 / 弹药 / 故障）+ 攻击 / 掷伤害；六类「已投入」技能芯片 |
| 物品 | 货币条（信用评级由技能推导）、武器/护具/书籍/法术/天赋/道具/状态分节、分组折叠、道具数量内联编辑、编辑态拖拽排序 |
| 背景 | 七要素卡片（外貌形象 / 思想信念 / 宝贵之物 / 意义非凡之地 / 重要之人 / 特质 / 伤疤和恐惧症）、关键链接多选、背景故事、遭遇记录 |
| 成长 | 三类点数总览；「可以成长的技能」+ 一键成长 + 手动改值；按可编辑**模组名**分组的逐条成长记录，可改「成长后」数值、逐条撤销、新建模组 |
| 笔记（GM） | 守秘笔记（富文本）、书籍阅读进度、SAN 损失事件、神话标记、清除全部状态 |
| 效果 | 新增、点击打开配置、启用/禁用、删除 |

**其他**：可收起收藏侧栏（技能投骰 / 武器攻击 / 物品打开）、右键菜单（打开 / 加入或移除收藏 / 删除）、窗口八向缩放与尺寸记忆、紧凑模式、暗色主题跟随 Foundry。

**生物 / NPC 卡（`npc` + `creature`，v0.8 新增）**

- 横幅：类型 / 职业信息、HP/MP/SAN/幸运（空值自动隐藏）、DB/体格/MOV/护甲、八枚盾形特性徽章（缺值显示 `—`）、状态芯片、**每轮攻击 / SAN 损失 / 护甲**
- 六个标签页：**战斗（默认）** / 技能 / 物品 / 描述 / 守秘（GM）/ 效果
- 战斗：每轮攻击（可掷）、SAN 损失（生成系统原生链接卡）、武器表（攻击/掷伤害/霰弹枪分档）、特殊能力速查、移动方式增删
- 编辑态：公式模式（特性公式 + 掷特性 / 取平均）、auto 齿轮、资源/派生内联编辑；技能当前值内联、物品数量/拖拽排序
- 描述与守秘：personalDescription 富文本、GM 笔记、骰子宏（拖入添加 / 执行 / 删除）
- 静态样稿：[prototype/npc.html](prototype/npc.html) · 设计文档：[docs/04-生物卡设计文档.md](docs/04-生物卡设计文档.md)

| 简表 | 背景 |
|---|---|
| ![简表](docs/screenshots/summary.png) | ![背景](docs/screenshots/background.png) |

| 成长 | 编辑态技能 |
|---|---|
| ![成长](docs/screenshots/growth.png) | ![编辑态技能](docs/screenshots/skills-edit.png) |

---

## 安装

### 方式一：Manifest URL（推荐）

Foundry VTT → **附加组件 → 模块 → 安装模块** → 底部「Manifest URL」填入：

```
https://raw.githubusercontent.com/JshGao/coc7-tidy-investigator/main/module/module.json
```

### 方式二：手动安装

下载 [最新 Release](https://github.com/JshGao/coc7-tidy-investigator/releases/latest) 的 zip，
解压到 `Data/modules/coc7-tidy-investigator/`（确保该目录下直接就是 `module.json`）。

### 启用

1. 启动世界 →「管理模块」启用 **CoC7 Tidy 调查员卡**
2. 打开任意调查员（character）→ 标题栏齿轮 / 右键角色 →「配置界面」→ 角色卡选 **CoC7 Tidy 调查员卡**

---

## 使用提示

- **编辑态**：点横幅右上角的锁图标解锁后才能改数值；锁定态用于跑团时防误触
- **拖拽排序**：技能页切到「自定义」排序后、编辑态下拖动行；物品页编辑态直接拖
- **成长**：技能页勾选「标记」→ 成长页「一键成长」；手动改值（克苏鲁神话等）也在编辑态进行
- **收藏**：技能/武器/物品右键「加入收藏」，左侧收藏栏点击即用
- **资源卡排序**：解锁后拖动「血量 / 魔法值 / 理智 / 幸运」调整左右顺序，按角色保存
- **设置**：游戏设置 → 模组设置：紧凑模式 / 记住窗口尺寸 / 技能默认排序

---

## 兼容性

| 项目 | 版本 |
|---|---|
| Foundry VTT | 14（在 14.368 验证） |
| Call of Cthulhu 7e | ≥ 8.16 |

依赖：无。注册 `character`、`npc`、`creature`、`container` 四种类型，不改变系统默认卡，不影响载具。

---

**容器卡（`container`，v0.8 新增）**

- 紧凑横幅：96px 头像 / 名称 / 容器件数 / 分类计数芯片
- 四个标签页：内容（默认）/ 描述 / 守秘（GM）/ 效果
- 内容页：武器 / 护具 / 书籍 / 法术 / 天赋 / 道具 / 状态分节，折叠、数量编辑、编辑态拖拽排序、分组 `+`
- 描述 / 守秘富文本（prose-mirror），内容与系统容器卡完全互通

---

## 版本

- **0.8.2（2026-10-22）**：Tidy 生物 / NPC 卡 + 容器卡；调查员卡资源拖拽排序；三卡统一 Tab 样式与若干修复。
  - 设计文档：[docs/04-生物卡设计文档.md](docs/04-生物卡设计文档.md)
  - 静态预览：[prototype/npc.html](prototype/npc.html)
  - 更新日志：[CHANGELOG.md](CHANGELOG.md)
- 0.7.2：调查员卡稳定版。

## 开发

```
module/                 模组本体（发布 zip 的内容）
  module.json           清单
  scripts/
    module.js           入口：注册角色卡、设置、预加载模板
    constants.js        MODULE_ID / 模板路径 / tab / 背景要素 / 技能分类
    services/           纯数据层（view-data / tabs-data / npc-data / container-data）
    sheets/             AppV2 基类、调查员卡、生物 / NPC 卡、容器卡
  templates/            Handlebars（investigator / npc / container / tabs / parts）
  styles/               tokens.css + sheet.css + npc.css + container.css
  lang/                 中 / 英
docs/                   调研报告、设计文档、截图
prototype/              静态视觉样稿（浏览器可直接打开）
```

开发时可直接软链接到 Foundry：

```bash
ln -s "$PWD/module" \
  "/Users/<you>/Library/Application Support/FoundryVTT/Data/modules/coc7-tidy-investigator"
```

> 注意：AppV2 的每个 PART 模板必须只有一个根元素；数组字段（如 `system.biography`）不能用表单 `name` 提交，需显式读数组写回。

---

## 文档

- [调研报告](docs/01-调研报告.md)：CoC7 架构、Tidy 设计语言、Foundry 14 API、兼容红线（含 NPC / 生物数据模型附录）
- [设计文档](docs/02-设计文档.md)：布局方案、视觉 token、组件、交互、数据映射、技能分类
- [生物卡设计文档](docs/04-生物卡设计文档.md)：`npc` / `creature` / 容器卡设计（v0.8.2 已发布）
- [宣传稿 / 功能导览](docs/03-宣传稿.md)
- [更新日志](CHANGELOG.md)

---

## 许可

[MIT](LICENSE)
