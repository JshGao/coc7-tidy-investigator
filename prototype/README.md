# 视觉样稿（Prototype）

纯静态 HTML/CSS 视觉样稿，**不含任何 Foundry 逻辑**，用于在正式开发前确认观感。

## 如何查看

直接双击 `index.html`，或在浏览器打开：

```bash
open prototype/index.html
```

支持 URL 参数（便于截图/评审）：

| 参数 | 取值 | 说明 |
|---|---|---|
| `theme` | `dark` | 预览暗色主题 |
| `tab` | `skills` / `summary` / `possessions` / `background` / `growth` / `notes` / `effects` | 打开指定 tab |
| `sidebar` | `collapsed` | 收起收藏侧栏 |

例：`index.html?theme=dark&tab=summary`

页面顶部工具条上的两个按钮可以实时切换主题与侧栏，仅用于演示。

## 截图

| 文件 | 内容 |
|---|---|
| `screenshots/01-light-skills.png` | 亮色 · 技能 tab |
| `screenshots/02-dark-skills.png` | 暗色 · 技能 tab |
| `screenshots/03-light-summary.png` | 亮色 · **简表**：武器速查 + 分类技能芯片 |
| `screenshots/04-light-items.png` | 亮色 · 物品 tab |
| `screenshots/05-light-background.png` | 亮色 · **背景五要素 + 关键链接** |
| `screenshots/06-dark-summary.png` | 暗色 · 简表 |
| `screenshots/07-dark-background.png` | 暗色 · 背景 |

## 设计要点（与 docs/02-设计文档.md 对应）

- 顶部深色横幅：头像 + 姓名/副信息 + 4 个资源胶囊（HP/MP/SAN/幸运）+ 派生值胶囊；
- 8 个特性**盾形 SVG 徽章**横排，含半值/五分之一值；
- 状态芯片行 + 今日 SAN；
- 7 个主 tab（技能/战斗/物品/背景/发展/守秘/效果）；
- 可收起的「收藏」侧栏；
- 数据表：金色渐变表头、悬停高亮、悬停换图标（骰子）、行内操作按钮悬停显现；
- 专长技能折叠分组；
- 成长标记为方形勾选；
- **简表页**：武器速查（含每轮/故障）+ 战斗/调查/社交/生存/技艺/医疗与精神 六类「已投入技能」芯片；
- **背景页 = 规则书七要素卡片**（外貌形象 / 思想信念 / 宝贵之物 / 意义非凡之地 / 重要之人 / 特质 / 伤疤和恐惧症），每项可勾选「关键链接」（**可多选**）；伤疤卡内以纯文本记录伤疤/恐惧症/狂热症（人物背景设定，不联动状态物品）；
- 原「发展 / 守秘」tab 已更名为「成长 / 笔记」；
- 亮/暗双主题（暗色只是 token 覆盖）。

## 注意

- 字体 `fonts/` 内为 Roboto Condensed（Apache-2.0）与 Signika Negative（OFL）的变量字体，取自 tidy5e-sheet 模块目录，仅用于样稿；正式模组将按原始授权重新打包。
- 徽章、图标、纹理全部为本项目自制 SVG/CSS，**未复制 Tidy 5e Sheets 的图片素材或代码**。
