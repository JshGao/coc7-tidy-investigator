[中文](README.md) | **English**

# CoC7 Tidy Sheets
### coc7-tidy-investigator · Foundry VTT 14 · Call of Cthulhu 7e

A custom character sheet for CoC7. Its look borrows heavily from **Tidy 5e Sheets** and it ships an **Investigator** sheet, an **NPC / Creature** sheet and a **Container** sheet. It only registers new optional sheet templates inside the system and replaces none of the existing actor-sheet templates; implemented in pure Handlebars + CSS with no build step, it is lightweight and ships with English and Chinese localization.

**Current version: 0.9.0** (2026-10-26) · [Release notes](https://github.com/JshGao/coc7-tidy-investigator/releases/latest)

The latest 0.9 release is a complete visual overhaul: all three sheets now share a **1920s vintage dossier** visual language — dark lacquered banners, brass hairlines, aged paper, ink-black table headers and oxblood accents, typeset with locally bundled Cinzel / EB Garamond / Roboto Condensed. Features and data structures are unchanged.

![Cover](docs/screenshots/cover.png)

---

## Installation

### Option 1: Manifest URL (recommended)

Foundry VTT → **Add-on Modules** → **Install Module** → paste this into the **Manifest URL** field at the bottom:

```
https://raw.githubusercontent.com/JshGao/coc7-tidy-investigator/main/module/module.json
```

### Option 2: Manual installation

Download the zip from the [latest release](https://github.com/JshGao/coc7-tidy-investigator/releases/latest)
and extract it into `Data/modules/coc7-tidy-investigator/` (make sure `module.json` sits directly in that folder).

### Enabling the sheets

1. Launch your world → **Manage Modules** and enable the CoC7 Tidy module
2. Open any investigator (`character`) actor → gear icon in the title bar, or right-click the actor → **Configure Sheet** → select **CoC7 Tidy Investigator Sheet**

---

## Features

**Top banner**:
portrait, name, lock / edit-state toggle, identity info (occupation, age, gender, …);
HP / MP / SAN / Luck resource bars (drag to reorder once unlocked), and clicking **SAN** or **Luck** rolls the matching check directly;
Damage Bonus (DB) / Build / MOV / Armor;
eight shield-shaped characteristic badges (inline inputs in edit mode with formula support; on monsters / NPCs they can be randomized or averaged in one click); seven condition buttons; a daily SAN-loss counter.

**Seven tabs**

| Tab | Contents |
|---|---|
| Skills | Search; sort by value or name, or drag into a custom order; specialization groups; growth marking; add to the favorites sidebar. In edit mode, skill points are split into Base / Occupation / Interest / Development / Value, each inline-editable. |
| Summary | Weapon quick reference (skill %, damage, range, attacks per round, bullets / magazine, malfunction) plus attack / roll damage / reload; as well as other skills above their base value, grouped. |
| Possessions | Asset information (derived from the Credit Rating skill); sections for weapons / armor / books / spells / talents / items / statuses; collapsible groups; inline item quantities; drag to reorder in edit mode. |
| Background | Seven backstory cards (Personal Description / Ideology & Beliefs / Treasured Possessions / Meaningful Locations / Significant People / Traits / Injuries & Scars), key-connection checkboxes, backstory, encounters. |
| Growth | "Skills ready to grow" + one-click growth + manual value editing; per-check growth records grouped by an editable **module name** — change the post-growth value, undo a single record, create a new module. |
| Notes (GM) | Keeper notes (rich text), book reading progress, SAN-loss events, Mythos flags, clear all conditions. |
| Effects | Create, click to open configuration, enable / disable, delete. |

**Also**: collapsible favorites sidebar (roll skills / attack with weapons / open items); context menus (open / add to or remove from favorites / delete); eight-way window resizing with size memory; compact mode; dark theme.

**NPC / Creature sheet** (`npc` + `creature`)

- Banner: type / occupation info, HP / MP / SAN / Luck (empty values hidden), DB / Build / MOV / Armor, eight shield-shaped characteristic badges (missing values show `—`), condition buttons, **attacks per round / SAN loss**
- Six tabs: **Combat (default)** / Skills / Inventory / Description / Keeper (GM notes) / Effects
- Combat: attacks per round (rollable), SAN loss (creates the system's native link card), weapon table (attack / roll damage / reload / shotgun range bands, with bullets / magazine in the ammo column), special abilities quick reference, add or remove movement modes
- Edit mode: formula mode (characteristic formulas plus roll characteristics / average), auto gear (toggles inline editing of resources / derived values); inline skill values, item quantities and drag reordering
- Description and Keeper: rich-text description, GM notes, dice macros (drag to add / execute / delete)
- Static mock: [prototype/npc.html](prototype/npc.html) · design document (Chinese): [docs/04-生物卡设计文档.md](docs/04-生物卡设计文档.md)

**Container sheet** (`container`)

- Compact banner: 96px portrait / name / item count / per-type count buttons
- Four tabs: Contents (default) / Description / Keeper (GM) / Effects
- Contents: collapsible sections for weapons / armor / books / spells / talents / items / statuses; quantity editing, drag reordering in edit mode, and a group `+` button
- Description / Keeper notes as rich text

---

## Visual language

- **Banner (the cover)**: dark lacquer, brass side-light and oxblood vignette, with Art Deco ornaments on all four corners; the portrait gets a 3px brass gradient frame.
- **Content area (the paper)**: aged paper base with fibre texture; tables use ink-black headers and brass hairlines, with a brass row tint on hover.
- **Hand-drawn SVG**: eight shield-shaped characteristic badges, HP / MP / SAN / Luck icons, section diamonds, empty-state star, dossier seal — all drawn inside the project, no external image dependencies.
- **Three bundled typefaces**: Cinzel (names / tabs / headings), EB Garamond (background and Keeper notes rich text), Roboto Condensed (data and tables); Chinese falls back to Songti / PingFang so mixed Chinese/English text doesn't jump.
- **Light and dark themes**: "ink leather with brass reflections"; compact mode and edit mode keep the same hierarchy.
- Design details and tokens: [docs/05-美术风格设计.md](docs/05-美术风格设计.md) (Chinese).

All three typefaces are licensed under the SIL Open Font License 1.1; the license files ship inside the module at `module/assets/fonts/licenses/`.

---

## Screenshots

*The screenshots show the Chinese UI. Every label switches to English automatically when Foundry's language is set to English.*

| Skills tab | Dark theme |
|---|---|
| ![Skills tab](docs/screenshots/skills.png) | ![NPC / Creature dark theme](docs/screenshots/npc-dark.png) |

| Summary | Possessions |
|---|---|
| ![Summary](docs/screenshots/summary.png) | ![Possessions](docs/screenshots/possessions.png) |

| Background | Growth |
|---|---|
| ![Background](docs/screenshots/background.png) | ![Growth](docs/screenshots/growth.png) |

| Skills in edit mode | Compact mode |
|---|---|
| ![Skills in edit mode](docs/screenshots/skills-edit.png) | ![Compact mode](docs/screenshots/compact.png) |

| NPC / Creature · Combat | Container |
|---|---|
| ![NPC / Creature combat](docs/screenshots/npc-combat.png) | ![Container sheet](docs/screenshots/container.png) |

---

## Usage tips

- **Edit mode**: click the lock icon at the top-right of the banner to unlock before changing values; the locked state prevents accidental edits during play
- **Drag to reorder**: on the Skills tab, switch sorting to **Custom**, then drag rows in edit mode; on the Possessions tab just drag in edit mode
- **Growth**: check **Mark** on the Skills tab → **Develop all** on the Growth tab; manual value edits (Cthulhu Mythos and the like) also happen in edit mode
- **Favorites**: right-click a skill / weapon / item → **Add to favorites**, then click it in the favorites sidebar on the left
- **Resource order**: once you unlock edit mode, drag HP / MP / SAN / Luck to reorder them; the order is saved per actor
- **Settings**: Game Settings → Module Settings: Compact mode / Remember window size / Default skill sorting

---

## Compatibility

| Item | Version |
|---|---|
| Foundry VTT | 14 (verified on 14.368) |
| Call of Cthulhu 7e | ≥ 8.16 |

Dependencies: none. The module registers sheet templates for the `character`, `npc`, `creature` and `container` actor types, leaves the system's default sheets untouched and does not affect vehicles.

---

## Localization

- The sheet UI ships in **English** and **Chinese** and follows Foundry's language setting (Game Settings → Language Preference); no separate module or translation pack is needed
- Translations live in [`module/lang/en.json`](module/lang/en.json) and [`module/lang/cn.json`](module/lang/cn.json)
- Pull requests for additional languages are welcome

---

## Version history

- **0.9.0 (2026-10-26)**: "Investigator Dossier" visual overhaul. All three sheets now use dark lacquered banners / brass hairlines / aged paper / ink-black table headers / oxblood accents; Cinzel, EB Garamond and Roboto Condensed are bundled locally (OFL); shields, resource icons, corner ornaments and empty states redrawn; every promo screenshot and the cover regenerated. No feature or data changes.
  - Visual spec (Chinese): [docs/05-美术风格设计.md](docs/05-美术风格设计.md)
  - Changelog: [CHANGELOG.en.md](CHANGELOG.en.md)
- **0.8.3 (2026-10-22)**: Tidy NPC / Creature sheet + Container sheet; draggable resource cards on the investigator sheet; unified tab styling across the three sheets; edit-mode resource layout fix and assorted detail fixes.
  - Design document (Chinese): [docs/04-生物卡设计文档.md](docs/04-生物卡设计文档.md)
  - Static preview: [prototype/npc.html](prototype/npc.html)
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
  assets/fonts/         three OFL typefaces (woff2) and licenses/
  lang/                 Chinese / English
docs/                   research notes, design documents, visual spec, screenshots
docs/promo/             cover source files and build script (not shipped in the zip)
prototype/              static visual mock-ups (open directly in a browser)
tools/                  headless render / screenshot / visual audit pipeline (dev only)
```

During development you can symlink the module into Foundry:

```bash
ln -s "$PWD/module" \
  "/Users/<you>/Library/Application Support/FoundryVTT/Data/modules/coc7-tidy-investigator"
```

> Notes: every AppV2 PART template must have exactly one root element; array fields (such as `system.biography`) cannot be submitted through a form `name` and have to be read and written back explicitly.

---

## Documentation

- **Chinese**: [README](README.md) · [Feature guide](docs/03-宣传稿.md) · [Changelog](CHANGELOG.md)
- [Research report](docs/01-调研报告.md) (Chinese): CoC7 architecture, the Tidy design language, Foundry 14 API, hard compatibility limits, including the NPC / creature data model appendix
- [Design document](docs/02-设计文档.md) (Chinese): layout, design tokens, components, interactions, data mapping, skill categories
- [NPC / Creature sheet design document](docs/04-生物卡设计文档.md) (Chinese): `npc` / `creature` / container sheet design (released in v0.8.3)
- [Visual style spec](docs/05-美术风格设计.md) (Chinese): the v0.9 "Investigator Dossier" visual language, tokens, components and render pipeline
- [Feature guide / promo copy](docs/03-promo.en.md) (English)
- [Changelog](CHANGELOG.en.md) (English)

---

## License

- Code: [MIT](LICENSE)
- Fonts: Cinzel, EB Garamond and Roboto Condensed are all licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/); license files are bundled at `module/assets/fonts/licenses/`
- Shields / corner ornaments / icons: in-house SVG and CSS, no third-party artwork
