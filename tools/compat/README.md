# tools/compat · Foundry 13/14 + CoC7 7.24/8.16 兼容性 E2E

这套脚本只用于开发，不随模组发布。它用**真实 Foundry 服务端 + 真实 CoC7 系统 + Playwright 浏览器**跑同一套用例：

| lane | Foundry | CoC7 | 端口 |
|---|---|---|---|
| `v13` | 13.351（便携 Node 包） | 7.24 | 30133 |
| `v14` | 本机安装的 14.369 | 8.16 | 30143 |

所有测试数据都在 `tools/.compat/data/<lane>/`，**不会读写** `~/Library/Application Support/FoundryVTT` 里的正式世界。`tools/.compat/` 已加入 `.gitignore`。

## 一次性准备

1. **Foundry 13.351 Node 包**  
   从 foundryvtt.com 账号下载 `FoundryVTT-Node-13.351.zip`，解压到：

   ```
   tools/.compat/foundry/13.351/
   ```

   校验入口存在：`tools/.compat/foundry/13.351/main.mjs`。

2. **CoC7 系统**  
   已内置解压在 `tools/.compat/systems/CoC7-7.24` 与 `CoC7-8.16`。如果没有，从 GitHub Release 下载 `system.zip` 解压到这两个目录（目录里应有 `system.json`）。

3. **Foundry license**  
   默认从 `~/Library/Application Support/FoundryVTT/Config/license.json` 复制到测试 dataPath；也可用 `FOUNDRY_LICENSE_PATH` 指定。

4. **Playwright**  
   `tools` 目录已经依赖 `playwright-core`；浏览器使用本机 Chrome。可用 `CHROME_PATH` 指定路径。

## 运行

```bash
cd tools

npm run compat:v13   # Foundry 13.351 + CoC7 7.24
npm run compat:v14   # Foundry 14.369 + CoC7 8.16
npm run compat:all   # 两个 lane 依次跑
```

可选参数：

```bash
node compat/run.mjs --lane=v13 --headed          # 打开有头浏览器观察
node compat/run.mjs --lane=v13 --only=investigator # 只跑某个场景（investigator / weapon / npc / growth / legacy …）
node compat/run.mjs --lane=v13 --keep            # 跑完不关 Foundry，方便手动登录看
```

失败截图与 `results.json` 在 `tools/.compat/artifacts/`；服务端日志在 `tools/.compat/logs/`。

## 覆盖的用例

- **investigator**：7.24 形状的技能（`system.value` 为空，值在 adjustments）在 Tidy 卡上显示 55 / 40；7 个 tab；系统默认卡 ↔ Tidy 来回切换后数据不变
- **skill-edit**：解锁后改技能成长点，值从 55 → 60
- **weapon**：武器关联技能的百分比、`0/6` 弹药、装填按钮 → 6 发
- **npc / npc-edit**：NPC 卡加载、技能显示、内联改值
- **container**：容器卡与物品
- **conditions**：切换「倒地 / 临时疯狂」并清空
- **money**：信用评级技能值、现金 / 资产格式
- **books**：7.24 读 `book` Item `system.study.progress`；8.16 读 `system.books`
- **growth**：Shift + 单技能成长，校验 7.24 用 item id、8.16 用 uuid，成长后标记被清除
- **mythos**：秘法硬化 flag 在 7.24（Actor flag）与 8.16（system.flags）的读写
- **settings**：紧凑模式切换触发 `refreshSheets`（`foundry.applications.instances` 回退）
- **npc-rolls**：每轮攻击公式 `@STR`；7.24 走 `parseCharacteristics` 回退
- **san-link**：NPC 的 SAN 损失链接卡
- **import-st**：基础 `.st` 导入（特性 / HP/MP/SAN/幸运 / 技能专长 / `+` 增量）
- **import-st-full**：用户提供的整段海豹骰 `.st`（重复别名、无分隔符、英文简写）→ 去重后导入并逐项断言
- **import-st-conflict**：同一技能出现不同数值 → 提示“数值冲突”，不写入任何数据
- **legacy**：只有 v13 跑；模拟旧角色 `system.value = 55`，打开 Tidy 显示 55，编辑后 60，并验证迁移

## 说明

- 两个 lane 使用独立 `--dataPath` 与端口，可同时运行；如果端口已被占用，脚本会复用现有实例。
- `ensureLane()` 每次运行都会把仓库里的 `module/` 同步到测试 dataPath，所以改完代码直接重跑即可。
- Foundry 13 的 Node 包在 macOS arm64 上可直接用 Node 26 跑（本项目已验证）；如遇原生模块问题，用 Node 20/22 运行。
- 测试世界没有设置管理员密码，仅用于本地 / CI；不要把它暴露到公网。
