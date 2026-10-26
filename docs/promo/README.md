# docs/promo · 发布物料源文件（不随模组发布）

本目录存放对外宣传物料的**可复现源文件**。截图与封面都走真实模板 + 真实 CSS 的无头渲染管线（`tools/`），不手绘、不使用外部版权图片。

```
docs/promo/
├── cover.html                 封面版式（1200×630，黄铜双线框 / Art Deco 角饰 / 相册护角）
├── cover.css                  封面样式（颜色、字体、装饰全部自制；字体走 module/assets/fonts）
├── build-cover.mjs            一键构建：渲染主视觉 → sips 裁切 → Chrome 2x 截图
├── build-screenshots.mjs      重出 README/宣传稿引用的全套 15 张截图（2x）
├── assets/
│   └── hero-investigator.png  由构建脚本生成（调查员卡 · 技能页，裁掉窗口留白）；勿手改
└── README.md                  本文件
```

## 重出全套截图

```bash
node docs/promo/build-screenshots.mjs            # 全部 14 张卡片截图 → docs/screenshots/
node docs/promo/build-screenshots.mjs --only npc # 只重出名字含 npc 的
node docs/promo/build-screenshots.mjs --contact  # 额外拼一张联系表便于抽查
```

会把 `skills / summary / possessions / background / growth / notes / effects / skills-edit / compact`
（调查员 780×800）、`npc-combat / npc-combat-edit / npc-skills / npc-dark`（NPC 780×900）、
`container`（660×780）以 2x 写回 `docs/screenshots/`，并校验真实像素尺寸。
封面用的是 `skills.png`，截图定稿后再跑一次下面的封面构建，才能保证卡面一致。

## 生成封面

```bash
# 推荐：现场重新渲染调查员卡主视觉（skills · 780×800 · 2x），再出封面
node docs/promo/build-cover.mjs --refresh

# 复用现有 docs/screenshots/skills.png 作为主视觉
node docs/promo/build-cover.mjs

# 指定其他卡片截图 / 输出路径
node docs/promo/build-cover.mjs --src /tmp/hero.png --out /tmp/cover.png
```

产物：`docs/screenshots/cover.png`，**2400×1260**（1200×630 @2x）。

构建脚本做了三件事，保证结果可复现：

1. `tools/render.mjs` + `tools/shot.mjs` 生成 2x 卡片截图（`--refresh`）；
2. `sips` 居中裁掉无头截图四周 30px（@2x 为 60px）的窗口留白，得到 `assets/hero-investigator.png`；
3. Chrome + CDP 打开 `cover.html`，等待 `document.fonts.ready` 且 Cinzel / EB Garamond / Roboto Condensed 均加载成功后再截图 —— 避免偶发的「系统衬线回落」假象。

字体加载失败、图片 404、尺寸不是 2400×1260 时脚本会直接报错，不会产出坏封面。

## 视觉约定（与 `docs/05-美术风格设计.md` 一致）

| 元素 | 取值 |
|---|---|
| 底色 | 深色漆面皮革：`#211b14 → #271e16 → #17110c` + SVG 噪声 + 斜向细纹 |
| 黄铜 | `#a9863f` / 高光 `#ddc68f` / 暗部 `#785b28`，双线框 + Art Deco 角饰 + 中央菱形 |
| 牛血红 | `#6e1d26` / `#8d2c37`，用于版本芯片、光晕、火漆印 |
| 做旧纸张 | 照片衬纸 `#e9ddc0 → #d2c19c` + 噪声，轻微旋转，模拟档案相册 |
| 标题 | Cinzel（`module/assets/fonts/Cinzel-latin*.woff2`） |
| 中文 | 宋体（`Songti SC` / `STSong` / `Noto Serif SC` 回落） |
| 引文 | EB Garamond Italic |
| 徽记 / 角饰 | 内联 SVG（`cover.html` 中的 `#deco-corner` 与 CSS 菱形），无位图素材 |

## 维护提示

- 改版后顺序：**先重出卡片截图**（`tools/render.mjs` / `tools/shot.mjs`），再 `node docs/promo/build-cover.mjs`；如果直接跑 `--refresh` 会以当前工作区是否已定稿为准。
- 封面文案里的版本号（`v0.9.0`）与仓库 URL 和 `module/module.json`、`README.md` 保持一致；发版时三处一起改。
- 封面里的主视觉来自卡片截图；如果 `docs/screenshots/skills.png` 更新，务必重跑构建。
- 本目录只放宣传物料，不进入 `dist/*.zip`。
