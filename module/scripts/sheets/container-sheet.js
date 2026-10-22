import { MODULE_ID, TEMPLATES, CONTAINER_ITEM_TYPES } from "../constants.js";
import { prepareContainerText, prepareContainerView } from "../services/container-data.js";
import { prepareEffects, preparePossessions } from "../services/tabs-data.js";
import { Coc7TidyBaseSheet } from "./base-sheet.js";

/**
 * CoC7 Tidy 容器卡（actor type: container）。
 * 容器只有描述 + 物品，因此使用紧凑横幅（头像 / 名称 / 物品计数），不做特性与资源块。
 */
export class Coc7TidyContainerSheet extends Coc7TidyBaseSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["coc7-tidy", "sheet", "actor", "c7t-container"],
    position: { width: 660, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      ...Coc7TidyBaseSheet.COMMON_ACTIONS,
    },
  };

  /** @override */
  static TABS = {
    primary: {
      initial: "items",
      labelPrefix: "C7TIDY.Tabs",
      tabs: [
        { id: "items", icon: "fa-solid fa-suitcase" },
        { id: "description", icon: "fa-solid fa-book-open" },
        { id: "keeper", icon: "fa-solid fa-feather" },
        { id: "effects", icon: "fa-solid fa-bolt" },
      ],
    },
  };

  /** @override */
  static PARTS = {
    body: {
      template: TEMPLATES.containerSheet,
      scrollable: [".c7t-scroll"],
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;

    context.container = prepareContainerView(actor);
    context.inventory = preparePossessions(actor, {
      types: CONTAINER_ITEM_TYPES,
      keepEmpty: this.isEditing,
    });
    for (const group of context.inventory.groups) group.collapsed = this.collapsedGroups.has(group.type);
    context.effects = prepareEffects(actor);
    context.containerText = await prepareContainerText(actor);

    if (!game.user.isGM && context.tabs) delete context.tabs.keeper;

    return context;
  }
}
