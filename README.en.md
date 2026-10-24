[中文](README.md) | **English**

# CoC7 Tidy Sheets
### coc7-tidy-investigator · Foundry VTT 14 · Call of Cthulhu 7e

Tidy 5e Sheets-style character sheets for **Call of Cthulhu 7e**:
an **Investigator** sheet, an **NPC / Creature** sheet and a **Container** sheet.
Opt-in registration — the system's default sheets are **never replaced**; pure Handlebars + CSS, no build step, no dependencies.

**Current version: 0.8.3** (2026-10-22) · [Release notes](https://github.com/JshGao/coc7-tidy-investigator/releases/latest)

![Cover](docs/screenshots/cover.png)

---

## Features

### Investigator sheet (`character`)

**Top banner**: portrait, name, lock / unlock, identity info (occupation, age, gender, …); HP / MP / SAN / Luck resource bars (drag to reorder once unlocked); Damage Bonus (DB) / Build / MOV / Armor; eight shield-shaped characteristic badges (inline inputs in edit mode); seven condition chips; a Daily SAN counter.
Click **SAN** or **Luck** to roll the matching check directly.

**Seven tabs**

| Tab | Contents |
|---|---|
| Skills | Search; sort by value / name / custom; specialization groups; growth marking; favorites; every skill keeps its own icon. In edit mode the columns split into Base / Occupation (Occ) / Personal (Int) / Development (Exp) / Value, all inline-editable. |
| Summary | Weapon quick reference (skill %, damage, range, attacks per round, ammo, malfunction) plus attack / roll damage; six categories of "invested" skill chips. |
| Possessions | Money strip (Credit Rating derived from the skill); sections for weapons / armor / books / spells / talents / items / statuses; collapsible groups; inline item quantities; drag to reorder in edit mode. |
| Background | Seven backstory cards (Personal Description / Ideology & Beliefs / Treasured Possessions / Meaningful Locations / Significant People / Traits / Injuries & Scars); multi-select key connections; backstory; encounters. |
| Growth | Three development point pools at a glance; "skills ready to grow" plus **Develop all** and manual value editing; per-check growth history grouped by an editable **module name** — change the post-growth value, undo a single record, create a new module. |
| Notes (GM) | Keeper notes (rich text), book reading progress, SAN loss events, Mythos Hardened / Mythos Insanity Experience flags, clear all conditions. |
| Effects | Create, click to configure, enable / disable, delete. |

**Also**: collapsible favorites sidebar (roll skills / attack with weapons / open items); context menus (open / add to or remove from favorites / delete); eight-way window resizing with size memory; compact mode; dark theme that follows Foundry.

### NPC / Creature sheet (`npc` + `creature`, new in v0.8)

- Banner: type / occupation info, HP / MP / SAN / Luck (empty values hidden), DB / Build / MOV / Armor, eight shield-shaped characteristic badges (missing values show `—`), condition chips, **attacks per round / SAN loss / armor**
- Six tabs: **Combat (default)** / Skills / Inventory / Description / Keeper (GM) / Effects
- Combat: attacks per round (rollable), SAN loss (creates the system's native link card), weapon table (attack / roll damage / shotgun range bands), special abilities quick reference, add or remove movement modes
- Edit mode: formula mode (characteristic formulas plus roll characteristics / average), auto-calculation toggles, inline resource and derived-value editing; inline skill values, item quantities and drag reordering
- Description and Keeper: `personalDescription` rich text, GM notes, dice macros (drag to add / execute / delete)
- Static mock: [prototype/npc.html](prototype/npc.html) · design document (Chinese): [docs/04-生物卡设计文档.md](docs/04-生物卡设计文档.md)

### Container sheet (`container`, new in v0.8)

- Compact banner: 96px portrait / name / item count / per-type count chips
- Four tabs: Contents (default) / Description / Keeper (GM) / Effects
- Contents: collapsible weapons / armor / books / spells / talents / items / statuses sections; quantity editing, drag reordering in edit mode, and a group `+` button
- Description / Keeper rich text (prose-mirror); fully data-compatible with the system's container sheet

![Container sheet](docs/screenshots/container.png)

---

## Screenshots

*The screenshots show the Chinese UI. Every label switches to English automatically when Foundry's language is set to English.*

| NPC / Creature · Combat | Edit mode |
|---|---|
| ![NPC / Creature combat](docs/screenshots/npc-combat.png) | ![NPC / Creature edit mode](docs/screenshots/npc-combat-edit.png) |

| Skills tab | Dark theme |
|---|---|
| ![NPC / Creature skills](docs/screenshots/npc-skills.png) | ![NPC / Creature dark theme](docs/screenshots/npc-dark.png) |

| Summary | Background |
|---|---|
| ![Summary](docs/screenshots/summary.png) | ![Background](docs/screenshots/background.png) |

| Growth | Skills in edit mode |
|---|---|
| ![Growth](docs/screenshots/growth.png) | ![Skills in edit mode](docs/screenshots/skills-edit.png) |

---

## Installation

### Option 1: Manifest URL (recommended)

Foundry VTT → **Add-on Modules** → **Install Module** → paste this into the **Manifest URL** field at the bottom:

```
https://raw.githubusercontent.com/JshGao/coc7-tidy-investigator/main/module/module.json
```

### Option 2: Manual installation

Download the zip from the [latest release](https://github.com/JshGao/coc7-tidy-investigator/releases/latest)
and extract it into `Data/modules/coc7-tidy-investigator/` (so that `module.json` sits directly in that folder).

### Enabling the sheets

1. Launch your world → **Module Management** → enable the CoC7 Tidy module
2. Open any investigator (`character`) actor → gear icon in the title bar, or right-click the actor → **Configure Sheet** → pick **CoC7 Tidy Investigator Sheet**
   (the NPC / Creature and Container sheets are selected the same way on their actors)

---

## Usage tips

- **Edit mode**: click the lock icon at the top-right of the banner to unlock before changing values; the locked state prevents accidental edits during play
- **Drag to reorder**: on the Skills tab switch sorting to **Custom**, then drag rows in edit mode; on the Possessions tab just drag in edit mode
- **Growth**: check **Mark** on the Skills tab → **Develop all** on the Growth tab; manual value edits (Cthulhu Mythos and the like) also happen in edit mode
- **Favorites**: right-click a skill / weapon / item → **Add to favorites**, then click it in the favorites sidebar on the left
- **Resource order**: unlock, then drag HP / MP / SAN / Luck to reorder them; the order is saved per actor
- **Settings**: Game Settings → Module Settings: Compact mode / Remember window size / Default skill sorting

---

## Compatibility

| Item | Version |
|---|---|
| Foundry VTT | 14 (verified on 14.368) |
| Call of Cthulhu 7e | ≥ 8.16 |

Dependencies: none. The module registers the `character`, `npc`, `creature` and `container` actor types, leaves the system's default sheets untouched and does not affect vehicles.

---

## Localization

- The sheet UI ships in **English** and **Chinese** and follows Foundry's language setting (Game Settings → Language Preference); no separate module or translation pack is needed
- Translations live in [`module/lang/en.json`](module/lang/en.json) and [`module/lang/cn.json`](module/lang/cn.json)
- Pull requests for additional languages are welcome

---

## Version history

- **0.8.3 (2026-10-22)**: Tidy NPC / Creature sheet + Container sheet; draggable resource cards on the investigator sheet; unified tab styling across the three sheets; edit-mode resource layout fix and assorted detail fixes.
  - Design document (Chinese): [docs/04-生物卡设计文档.md](docs/04-生物卡设计文档.md)
  - Static preview: [prototype/npc.html](prototype/npc.html)
  - Changelog: [CHANGELOG.en.md](CHANGELOG.en.md)
- 0.7.2: stable investigator sheet.

---

## Development

```
module/                 module itself (contents of the release zip)
  module.json           manifest
  scripts/
    module.js           entry point: sheet registration, settings, template preloading
    constants.js        MODULE_ID / template paths / tabs / background slots / skill categories
    services/           pure data layer (view-data / tabs-data / npc-data / container-data)
    sheets/             AppV2 base class, investigator, NPC / creature, container
  templates/            Handlebars (investigator / npc / container / tabs / parts)
  styles/               tokens.css + sheet.css + npc.css + container.css
  lang/                 Chinese / English
docs/                   research notes, design documents, screenshots
prototype/              static visual mock-ups (open directly in a browser)
```

During development you can symlink the module into Foundry:

```bash
ln -s "$PWD/module" \
  "/Users/<you>/Library/Application Support/FoundryVTT/Data/modules/coc7-tidy-investigator"
```

> Notes: every AppV2 PART template must have exactly one root element; array fields (such as `system.biography`) cannot be submitted through a form `name` and have to be read and written back explicitly; development checks must be given the full `item.uuid`.

---

## Documentation

- [English feature guide](docs/03-promo.en.md): the tour of what the sheets do and why
- [Changelog (English)](CHANGELOG.en.md) · [更新日志](CHANGELOG.md)
- [Research report](docs/01-调研报告.md) (Chinese): CoC7 architecture, the Tidy design language, Foundry 14 API, compatibility red lines, including the NPC / creature data model appendix
- [Design document](docs/02-设计文档.md) (Chinese): layout, design tokens, components, interactions, data mapping, skill categories
- [NPC / Creature sheet design document](docs/04-生物卡设计文档.md) (Chinese): `npc` / `creature` / container sheet design (released in v0.8.3)
- [宣传稿 / 功能导览](docs/03-宣传稿.md) (Chinese)

---

## License

[MIT](LICENSE)
