# CoC7 Tidy 调查员卡

*Tidy-style investigator sheet for Call of Cthulhu 7e on Foundry VTT 14.*

仿 **Tidy 5e Sheets** 风格的 CoC7 调查员角色卡，可选注册、不替换系统默认卡。
纯 Handlebars + CSS，无构建依赖。

- Foundry VTT：`>= 14`（14.368 验证）
- CoC7：`>= 8.16`

## 功能

- 横幅：头像、身份、资源条（解锁后可拖拽排序）、八枚盾形特性徽章、状态芯片、今日 SAN
- 七个标签页：技能 / 简表 / 物品 / 背景 / 成长 / 笔记（GM）/ 效果
- 技能：搜索、三态排序、专长分组、收藏、编辑态职业/兴趣/成长点内联编辑、拖拽排序
- 简表：武器速查 + 攻击/掷伤害 + 六类已投入技能芯片
- 物品：分节折叠、拖拽排序、道具数量编辑、右键菜单
- 背景：七要素卡片 + 关键链接多选 + 背景故事 + 遭遇记录
- 成长：一键成长、逐条记录、可编辑模组名分组、手动改值、撤销
- 笔记：守秘笔记、书籍进度、SAN 事件、神话标记、清除状态
- 效果：新增 / 打开 / 启停 / 删除
- 设置：紧凑模式、记住窗口尺寸、技能默认排序
- 窗口八向缩放、暗色主题跟随 Foundry

## 安装

把本目录放到 `Data/modules/coc7-tidy-investigator/`，或在 Foundry 里用 Manifest URL 安装。
启用模块后，在角色「配置界面 → 角色卡」里选择 **CoC7 Tidy 调查员卡**。

## 开发说明

- `scripts/sheets/base-sheet.js`：AppV2 基类（窗口尺寸、八向缩放、上下文注入）
- `scripts/sheets/investigator-sheet.js`：调查员卡（动作、监听、编辑逻辑）
- `scripts/services/view-data.js`：横幅/资源/技能等纯数据整理
- `scripts/services/tabs-data.js`：各 tab 的视图模型
- `templates/`：`investigator/sheet.hbs` 为唯一 PART，其余为 partial / tab 片段
- `styles/`：`tokens.css` 定义亮/暗 token，`sheet.css` 为组件样式

注意：
1. AppV2 每个 PART 必须只有一个根元素；
2. 数组字段（如 `system.biography`、`system.books`）不能依赖表单 `name` 提交，需读数组改值后整组写回；
3. 成长检定必须传 `item.uuid`（系统内部 `fromUuid()`）。

## 许可

MIT
