import { MODULE_ID, TEMPLATES } from "./constants.js";
import { Coc7TidyInvestigatorSheet } from "./sheets/investigator-sheet.js";

Hooks.once("init", async () => {
  registerSettings();
  registerSheets();
  await preloadTemplates();
});

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
    if (app?.constructor?.name === "Coc7TidyInvestigatorSheet") app.render({ force: false });
  }
}

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
});

/** 注册为「可选的」调查员角色卡，不抢占系统默认卡。 */
function registerSheets() {
  try {
    const Actors = foundry.documents.collections?.Actors ?? globalThis.Actors;
    if (!Actors?.registerSheet) throw new Error("Actors.registerSheet API is unavailable");

    Actors.registerSheet(MODULE_ID, Coc7TidyInvestigatorSheet, {
      types: ["character"],
      makeDefault: false,
      label: "C7TIDY.SheetTitle",
      themes: {
        dark: "SETTINGS.UI.FIELDS.colorScheme.choices.dark",
        light: "SETTINGS.UI.FIELDS.colorScheme.choices.light",
      },
    });
  } catch (err) {
    console.error(`${MODULE_ID} | 注册角色卡失败`, err);
  }
}

/** 预加载 partial，供主模板 include。 */
async function preloadTemplates() {
  try {
    const loadTemplates = foundry.applications.handlebars?.loadTemplates;
    if (!loadTemplates) return;
    await loadTemplates([
      TEMPLATES.icons,
      TEMPLATES.skillRow,
      TEMPLATES.skillRowEdit,
      TEMPLATES.skills,
      TEMPLATES.summary,
      TEMPLATES.possessions,
      TEMPLATES.background,
      TEMPLATES.growth,
      TEMPLATES.notes,
      TEMPLATES.effects,
    ]);
  } catch (err) {
    console.error(`${MODULE_ID} | 模板预加载失败`, err);
  }
}
