import { MODULE_ID, TEMPLATES } from "./constants.js";
import { Coc7TidyInvestigatorSheet } from "./sheets/investigator-sheet.js";
import { Coc7TidyNpcSheet } from "./sheets/npc-sheet.js";
import { Coc7TidyContainerSheet } from "./sheets/container-sheet.js";

Hooks.once("init", async () => {
  registerHelpers();
  registerSettings();
  registerSheets();
  await preloadTemplates();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
});

/** 模板辅助函数（以 c7t- 前缀避免与其它模块冲突） */
function registerHelpers() {
  try {
    globalThis.Handlebars?.registerHelper?.("c7t-eq", (a, b) => a === b);
  } catch (err) {
    console.warn(`${MODULE_ID} | 注册 Handlebars 助手失败`, err);
  }
}

/** 模块设置 */
function registerSettings() {
  game.settings.register(MODULE_ID, "compactMode", {
    name: "C7TIDY.Settings.Compact",
    hint: "C7TIDY.Settings.CompactHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => refreshSheets(),
  });

  game.settings.register(MODULE_ID, "rememberWindowSize", {
    name: "C7TIDY.Settings.RememberSize",
    hint: "C7TIDY.Settings.RememberSizeHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "sheetSize", {
    scope: "client",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, "defaultSkillSort", {
    name: "C7TIDY.Settings.DefaultSort",
    hint: "C7TIDY.Settings.DefaultSortHint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      value: "C7TIDY.Skills.SortValue",
      name: "C7TIDY.Skills.SortName",
    },
    default: "value",
  });
}

/** 重新渲染已打开的本模组角色卡 */
function refreshSheets() {
  for (const app of foundry.applications.instances.values?.() ?? []) {
    if (app instanceof Coc7TidyInvestigatorSheet || app instanceof Coc7TidyNpcSheet || app instanceof Coc7TidyContainerSheet) app.render({ force: false });
  }
}

/** 注册为可选角色卡，不抢占系统默认卡。 */
function registerSheets() {
  const Actors = foundry.documents.collections?.Actors ?? globalThis.Actors;
  if (!Actors?.registerSheet) {
    console.error(`${MODULE_ID} | Actors.registerSheet API is unavailable`);
    return;
  }

  const themes = {
    dark: "SETTINGS.UI.FIELDS.colorScheme.choices.dark",
    light: "SETTINGS.UI.FIELDS.colorScheme.choices.light",
  };

  try {
    Actors.registerSheet(MODULE_ID, Coc7TidyInvestigatorSheet, {
      types: ["character"],
      makeDefault: false,
      label: "C7TIDY.SheetTitle",
      themes,
    });
  } catch (err) {
    console.error(`${MODULE_ID} | 注册调查员卡失败`, err);
  }

  try {
    Actors.registerSheet(MODULE_ID, Coc7TidyNpcSheet, {
      types: ["npc", "creature"],
      makeDefault: false,
      label: "C7TIDY.NpcSheetTitle",
      themes,
    });
  } catch (err) {
    console.error(`${MODULE_ID} | 注册生物卡失败`, err);
  }

  try {
    Actors.registerSheet(MODULE_ID, Coc7TidyContainerSheet, {
      types: ["container"],
      makeDefault: false,
      label: "C7TIDY.ContainerSheetTitle",
      themes,
    });
  } catch (err) {
    console.error(`${MODULE_ID} | 注册容器卡失败`, err);
  }
}

/** 预加载 partial，供主模板 include。 */
async function preloadTemplates() {
  try {
    const loadTemplates = foundry.applications.handlebars?.loadTemplates;
    if (!loadTemplates) return;
    await loadTemplates([
      TEMPLATES.icons,
      TEMPLATES.bannerArt,
      TEMPLATES.tabsNav,
      TEMPLATES.skillRow,
      TEMPLATES.skillRowEdit,
      TEMPLATES.skills,
      TEMPLATES.summary,
      TEMPLATES.possessions,
      TEMPLATES.background,
      TEMPLATES.growth,
      TEMPLATES.notes,
      TEMPLATES.effects,
      TEMPLATES.npcSheet,
      TEMPLATES.npcSkillRow,
      TEMPLATES.npcSkillRowEdit,
      TEMPLATES.npcCombat,
      TEMPLATES.npcSkills,
      TEMPLATES.npcInventory,
      TEMPLATES.npcDescription,
      TEMPLATES.npcKeeper,
      TEMPLATES.containerSheet,
      TEMPLATES.containerItems,
      TEMPLATES.containerDescription,
      TEMPLATES.containerKeeper,
    ]);
  } catch (err) {
    console.error(`${MODULE_ID} | 模板预加载失败`, err);
  }
}
