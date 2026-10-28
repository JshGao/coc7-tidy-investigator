[中文](CHANGELOG.md) | **English**

# Changelog

## 0.9.1 — 2026-10-28

Ammo column fix: the Investigator Summary and the NPC / Creature Combat weapon tables now share one "Bullets/Mag" design with a reload button.

- The "Ammo" column is now "Bullets/Mag" and shows **loaded bullets / magazine capacity** (CoC7 `system.ammo` / `system.bullets`); the column previously displayed the magazine capacity as if it were the ammo count
- A **reload button** now sits to the left of the count: click to fill the magazine, Shift+click to load one round. It only appears for ranged weapons (melee / no-magazine weapons still show "—"), is hidden without edit permission, and dims when the magazine is full
- The reload button uses a **hand-drawn revolver-cylinder icon** (six chambers around a central axis, tinted by `currentColor`), and the icon-to-number gap is tightened
- **Unloading**: double-click the ammo count to empty the magazine, Shift+double-click to unload one round; the count carries a hover tooltip, with identical behaviour on both sheets
- The reload icon **loses its box**: just the cylinder glyph, with a round highlight on hover
- The **NPC / Creature Combat weapon table** now uses the same design as the Investigator Summary (same data, button, tooltip and light/dark behaviour)
- Narrow layouts: the Investigator Summary hides "Rate / Malf" at a content width ≤500px and "Range" below 420px; the NPC Combat table hides "Alternate skill / Malf" at ≤720px — both keep "Bullets/Mag" and the reload button
- Rebalanced the weapon column widths so weapon names are no longer truncated (`.45 自动手枪`, `李-恩菲尔德步枪`, `韦伯利左轮手枪`, …)
- Fixed the NPC / Creature "Movement" type labels in dark mode, where the select's chevron background tiled over the label and made the text illegible (now solid pills with body-text colour)

## 0.9.0 — 2026-10-26

"Investigator Dossier" visual overhaul. All three sheets now share one 1920s dossier language; features and data structures are unchanged.

### Visual language

- New colour tokens: aged paper `#ece1c8`, brass `#a9863f`, oxblood `#6e1d26`; dark mode is ink leather with brass reflections (`#14151a` / `#c3a76f` / `#b45a63`) rather than an inverted light theme
- Three OFL typefaces bundled locally as woff2: Cinzel (names / tabs / headings), EB Garamond (background and Keeper rich text), Roboto Condensed (data and tables), replacing the old variable TTF files; Chinese falls back to Songti / PingFang and numbers use `tabular-nums`
- Dark lacquered banner: brass side-light, oxblood vignette, Art Deco corner ornaments and a dossier seal; the portrait gets a 3px brass gradient frame with a sepia grade
- Resource cards redrawn: icon badges plus 5px progress bars (10% ticks, low-value pulse); edit mode uses a two-column grid
- Eight hand-drawn SVG shield-shaped characteristic badges: brass outer frame, gilt inner field and diamond finials
- Tables: ink headers, brass hairlines, alternating brass tint and a brass bar on row hover; row icons became brass-outlined mini badges
- Panels / sections / groups: ink section headers, parchment group bands, line-cornered background cards and a ledger-style money strip
- Buttons / chips / inputs: oxblood lacquer primary buttons, brass-outlined ghost buttons, letterpress inputs with a brass focus glow
- Tabs: small-caps Cinzel, brass underglow and a 2px gradient underline, unified across all three sheets
- Empty states / scrollbars: brass dashed frames with a hand-drawn star, brass gradient scrollbar thumbs; texture noise reduced in dark mode
- All three sheets are checked at light / dark, locked / edit, compact mode and 700 / 780 / 1020 px widths

### Investigator sheet

- Banner and all seven tabs (Skills / Summary / Possessions / Background / Growth / Notes / Effects) rebuilt on the new materials
- Skill table, summary chips, background cards, growth records, notes and effects updated together

### NPC / Creature sheet

- The Keeper's combat panel in the same language: combat overview strip, weapon table, special abilities, movement modes, formula mode and Keeper macros
- Banner combat strip (attacks per round / SAN loss / armor) and condition chips redrawn

### Container sheet

- Compact banner (96px portrait / count chips) and contents sections refreshed; empty states and edit-mode buttons unified

### Docs / release materials

- New [docs/05-美术风格设计.md](docs/05-美术风格设计.md) (Chinese): visual tokens, typography, component specs and the render pipeline
- New `docs/promo/`: cover HTML / CSS sources plus the `build-cover.mjs` (cover) and `build-screenshots.mjs` (full screenshot set) build scripts
- Regenerated the cover `docs/screenshots/cover.png` (2400×1260) and the full promo screenshot set
- README / README.en / promo guide updated with the visual selling points and new screenshots; `module.json` bumped to 0.9.0
- Font licensing: Cinzel / EB Garamond / Roboto Condensed are all SIL OFL 1.1 and ship with the module at `module/assets/fonts/licenses/`

## 0.8.3 — 2026-10-22

- Fixed the edit-mode resource area (HP / MP / SAN / Luck) on the NPC / Creature sheet at 780px: labels stacked vertically and progress bars overlapped. It is now a two-column grid, with room left for the input fields and the auto-calculation toggles
- Docs: added NPC / Creature sheet screenshots (combat / edit mode / skills / dark theme) and Container sheet screenshots; README and the promo doc updated

## 0.8.2 — 2026-10-22

The first release to include the Investigator sheet, the NPC / Creature sheet and the Container sheet together.

### New sheet: CoC7 Tidy NPC / Creature Sheet (`npc` + `creature`)

- Opt-in registration that does not replace the system's default sheet; the data model is fully interoperable with the system sheet
- Banner: type / occupation info, HP / MP / SAN / Luck (blank values hidden while locked), DB / Build / MOV / Armor, eight shield-shaped characteristic badges (missing values show `—`), condition chips
- Banner footer: attacks per round (rollable), SAN loss (creates a native system link card via `CONFIG.CoC7Link`), armor notes
- Six tabs: Combat (default) / Skills / Inventory / Description / Keeper (GM) / Effects
- Combat tab: weapon table (attack / roll damage / shotgun range bands), special abilities (talents) quick reference, with the ability to add new ones, and add or remove movement modes
- Edit mode: formula mode (characteristic formulas plus roll characteristics / average), auto-calculation toggles for HP / MP / SAN / DB / Build / MOV, inline editing of resources and derived values
- Skills tab: search / three-way sorting / specialization groups / inline editing of the current value (writes an `adjustments.experience` delta)
- Inventory tab: armor / books / spells / talents / items / statuses sections; collapsing, dragging and quantity editing; no money strip
- Description / Keeper: rich text for `personalDescription` and GM notes (prose-mirror); drag in, execute and delete dice macros
- Formula mode resets when the sheet is closed; the `c7t-npc` class name avoids conflicts with the system's `.npc` styles

### New sheet: CoC7 Tidy Container Sheet (`container`)

- Compact banner: 96px portrait / name / item count / count chips summarized by type
- Four tabs: Contents (default) / Description / Keeper (GM) / Effects
- Contents tab: weapons / armor / books / spells / talents / items / statuses sections; collapsing, quantity editing, drag-to-reorder in edit mode, group `+` buttons; empty groups only appear in edit mode
- Description / Keeper use prose-mirror; containers have no condition data, so no clear-conditions control is shown
- Opt-in registration via `types: ["container"]`; new `styles/container.css`

### Investigator sheet

- Resource cards (HP / MP / SAN / Luck) support drag-to-reorder (unlocked only, saved per actor)

### Refactor

- The base class now holds shared actions (lock / checks / items / effects / conditions / sorting / grouping) and shared listeners (skill search / context menu / row drag sorting / quantity)
- Extracted `parts/tabs-nav.hbs` as shared tab navigation used by all three sheets; unified the override of Foundry core's expanded `nav.tabs` layout
- `view-data` characteristics gained formula / blank fields, and resources gained blank markers; `tabs-data` weapons now read live values through skill getters, and item sections accept type subsets
- Module title changed to "CoC7 Tidy 角色卡" (CoC7 Tidy Sheets) and the manifest lists all three sheets; added `styles/npc.css` and `styles/container.css`

### Fixes

- In edit mode, "Special abilities" entries were squashed to a fixed height and centered by Foundry core button styles, causing text overflow / overlap
- Container sheet portrait had a double border and overflowed into the title area
- The "Special abilities" + button now matches the red "Add movement" button

## 0.7.2 — 2026-10-21

- Effects tab: create effects (unlocked); click a name to open the effect configuration
- Possessions tab: inline editing of item quantities (unlocked)
- Notes tab: inline editing of book reading progress (unlocked)
- Fixed Credit Rating showing as "—": it is now read from the `i.skill.credit-rating` skill
- Fixed drag sorting only taking effect when a row was dropped at the very top: `sort` is normalized to 10/20/30… while dragging
- Layout regression pass at 700 / 780 / 1000 px widths

## 0.7.0 — 2026-10-21

- Three-way skill sorting (value / name / custom), with drag-to-reorder under custom
- Collapsible item groups and drag-to-reorder in edit mode
- In edit mode the skill table splits into Occupation / Personal / Development points, all inline-editable

## 0.6.1 — 2026-10-21

- Growth values can only be changed in edit mode
- Growth tab: per-record growth history, applying a single growth result, manual value edits, creating a module, per-record undo

## 0.5.0 — 2026-10-21

- Settings: compact mode / remember window size / default skill sorting
- Weapon "Roll damage" (handles DB / half DB)
- Notes tab: Mythos flag toggles and clear all conditions; fixed Keeper notes rich text in the locked state

## 0.4.0 — 2026-10-21

- Growth tab: Develop all, growth records grouped by module name, undo
- Context menus and favorites for item / skill rows

## 0.3.0 — 2026-10-21

- Summary tab (weapon quick reference + chips for the six invested-skill categories)
- Possessions / the seven background elements / Growth / Notes / Effects
- Multi-select key connections in Background; background edits save

## 0.2.0 — 2026-10-21

- Skill search, sorting, specialization groups, favorites and development marks
- Banner resources and shield-shaped characteristics in edit mode

## 0.1.0 — 2026-10-21

- Project skeleton: opt-in registration, AppV2 base class, seven-tab framework, banner, dark theme
