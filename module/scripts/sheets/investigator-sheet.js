import { MODULE_ID, TEMPLATES, BACKGROUND_SLOTS } from "../constants.js";
import {
  prepareBackground,
  prepareEffects,
  prepareFavorites,
  prepareGrowth,
  prepareNotes,
  preparePossessions,
  prepareSkillView,
  prepareSummary,
  prepareWeapons,
} from "../services/tabs-data.js";
import { Coc7TidyBaseSheet, warnMissingApi } from "./base-sheet.js";

/**
 * CoC7 Tidy 调查员角色卡。
 */
export class Coc7TidyInvestigatorSheet extends Coc7TidyBaseSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["coc7-tidy", "sheet", "actor", "investigator"],
    position: { width: 780, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      ...Coc7TidyBaseSheet.COMMON_ACTIONS,
      rollDerived: Coc7TidyInvestigatorSheet._onRollDerived,
      resetDailySan: Coc7TidyInvestigatorSheet._onResetDailySan,
      toggleDevelopment: Coc7TidyInvestigatorSheet._onToggleDevelopment,
      toggleFavorite: Coc7TidyInvestigatorSheet._onToggleFavorite,
      createBackgroundSlot: Coc7TidyInvestigatorSheet._onCreateBackgroundSlot,
      toggleKeyConnection: Coc7TidyInvestigatorSheet._onToggleKeyConnection,
      toggleActorFlag: Coc7TidyInvestigatorSheet._onToggleActorFlag,
      developSkill: Coc7TidyInvestigatorSheet._onDevelopSkill,
      growthAll: Coc7TidyInvestigatorSheet._onGrowthAll,
      newGrowthModule: Coc7TidyInvestigatorSheet._onNewGrowthModule,
      undoGrowth: Coc7TidyInvestigatorSheet._onUndoGrowth,
    },
  };

  /** @override */
  static TABS = {
    primary: {
      initial: "skills",
      labelPrefix: "C7TIDY.Tabs",
      tabs: [
        { id: "skills", icon: "fa-solid fa-dice-d20" },
        { id: "summary", icon: "fa-solid fa-list-ul" },
        { id: "possessions", icon: "fa-solid fa-suitcase" },
        { id: "background", icon: "fa-solid fa-book-open" },
        { id: "growth", icon: "fa-solid fa-star" },
        { id: "notes", icon: "fa-solid fa-feather" },
        { id: "effects", icon: "fa-solid fa-bolt" },
      ],
    },
  };

  /** @override */
  static PARTS = {
    body: {
      template: TEMPLATES.sheet,
      scrollable: [".c7t-scroll"],
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;

    this.skillSort ??= game.settings.get(MODULE_ID, "defaultSkillSort") ?? "value";
    context.skillSort = this.skillSort;
    context.sortByValue = this.skillSort === "value";
    context.sortByName = this.skillSort === "name";
    context.isCustomSort = this.skillSort === "custom";
    context.skillView = prepareSkillView(actor, { sort: this.skillSort });
    context.summary = prepareSummary(actor);
    context.weapons = prepareWeapons(actor);
    context.possessions = preparePossessions(actor);
    for (const group of context.possessions.groups) group.collapsed = this.collapsedGroups.has(group.type);
    context.growth = prepareGrowth(actor);
    context.notes = prepareNotes(actor);
    context.notes.keeperHtml = await enrichHtml(actor, context.notes.keeper);
    context.effects = prepareEffects(actor);
    context.favorites = prepareFavorites(actor);
    context.background = await enrichBackground(actor);
    markFavorites(context, actor);

    // 「笔记」tab 仅 GM 可见
    if (!game.user.isGM && context.tabs) delete context.tabs.notes;

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#installBiographyEditing();
    this.#installDevelopmentToggles();
    this.#installGrowthLabelEditing();
    this.#installGrowthValueEditing();
    this.#installSkillAdjEditing();
    this.#installBookProgressEditing();
    this.#installResourceDragSorting();
  }

  /** 右键菜单：在基类（打开/删除）基础上加入收藏 */
  _itemContextEntries(item) {
    const entries = super._itemContextEntries(item);
    const current = this.document.getFlag(MODULE_ID, "favorites") ?? [];
    const list = Array.isArray(current) ? current : [];
    const isFavorite = list.some((entry) => entry.id === item.id);
    entries.splice(1, 0, {
      label: game.i18n.localize(isFavorite ? "C7TIDY.Action.RemoveFavorite" : "C7TIDY.Action.AddFavorite"),
      run: async () => {
        const now = this.document.getFlag(MODULE_ID, "favorites") ?? [];
        const rows = Array.isArray(now) ? now : [];
        const exists = rows.some((entry) => entry.id === item.id);
        const next = exists ? rows.filter((entry) => entry.id !== item.id) : [...rows, { id: item.id }];
        await this.document.setFlag(MODULE_ID, "favorites", next);
      },
    });
    return entries;
  }

  /** 资源卡（血量/魔法值/理智/幸运）拖拽排序 */
  #installResourceDragSorting() {
    if (!this.element || this.element.dataset.resDragBound) return;
    this.element.dataset.resDragBound = "1";

    const tileOf = (target) => target?.closest?.(".c7t-vital[draggable='true']");
    const clearDrop = () => {
      this.element.querySelectorAll(".c7t-vital.is-drop-before,.c7t-vital.is-drop-after")
        .forEach((el) => el.classList.remove("is-drop-before", "is-drop-after"));
    };
    const clearAll = () => {
      this.element.querySelectorAll(".c7t-vital.is-dragging,.c7t-vital.is-drop-before,.c7t-vital.is-drop-after")
        .forEach((el) => el.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
    };
    let dragKey = null;

    this.element.addEventListener("dragstart", (event) => {
      const tile = tileOf(event.target);
      if (!tile) return;
      dragKey = tile.dataset.resourceKey;
      tile.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        try {
          event.dataTransfer.setData("text/plain", dragKey ?? "");
        } catch {
          /* Safari */
        }
      }
    });

    this.element.addEventListener("dragover", (event) => {
      const tile = tileOf(event.target);
      if (!tile || !dragKey || tile.dataset.resourceKey === dragKey) return;
      event.preventDefault();
      clearDrop();
      const rect = tile.getBoundingClientRect();
      const dragged = this.element.querySelector(`.c7t-vital[data-resource-key="${dragKey}"]`);
      const dragRect = dragged?.getBoundingClientRect();
      const sameRow = dragRect ? Math.abs(dragRect.top - rect.top) < rect.height / 2 : true;
      const after = sameRow
        ? event.clientX >= rect.left + rect.width / 2
        : event.clientY >= rect.top + rect.height / 2;
      tile.classList.add(after ? "is-drop-after" : "is-drop-before");
    });

    this.element.addEventListener("drop", async (event) => {
      const tile = tileOf(event.target);
      if (!tile || !dragKey) return;
      event.preventDefault();
      const targetKey = tile.dataset.resourceKey;
      const parent = tile.parentElement;
      const keys = [...parent.querySelectorAll(".c7t-vital[data-resource-key]")]
        .map((el) => el.dataset.resourceKey);
      const rect = tile.getBoundingClientRect();
      const dragged = this.element.querySelector(`.c7t-vital[data-resource-key="${dragKey}"]`);
      const dragRect = dragged?.getBoundingClientRect();
      const sameRow = dragRect ? Math.abs(dragRect.top - rect.top) < rect.height / 2 : true;
      const after = sameRow
        ? event.clientX >= rect.left + rect.width / 2
        : event.clientY >= rect.top + rect.height / 2;

      const without = keys.filter((key) => key !== dragKey);
      const targetIndex = without.indexOf(targetKey);
      if (targetIndex < 0) return;
      without.splice(targetIndex + (after ? 1 : 0), 0, dragKey);
      dragKey = null;
      clearAll();
      await this.document.setFlag(MODULE_ID, "resourceOrder", without);
    });

    this.element.addEventListener("dragend", () => {
      dragKey = null;
      clearAll();
    });
  }

  /** 书籍阅读进度（数组字段，显式写回） */
  #installBookProgressEditing() {
    for (const input of this.element?.querySelectorAll(".c7t-book-progress") ?? []) {
      if (input.dataset.bound) continue;
      input.dataset.bound = "1";
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        const index = Number(input.dataset.index);
        const books = foundry.utils.duplicate(this.document.system?.books ?? []);
        if (!Number.isInteger(index) || !books[index]) return;
        const progress = Number(input.value);
        if (!Number.isFinite(progress)) return;
        books[index].progress = Math.max(0, Math.trunc(progress));
        await this.document.update({ "system.books": books });
      });
    }
  }

  /** 技能点数（职业/兴趣/成长）内联编辑 */
  #installSkillAdjEditing() {
    for (const input of this.element?.querySelectorAll(".c7t-adj-input") ?? []) {
      if (input.dataset.bound) continue;
      input.dataset.bound = "1";
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        const row = input.closest("[data-item-id]");
        const item = row ? this.document.items.get(row.dataset.itemId) : null;
        const field = input.dataset.field;
        if (!item || !field) return;
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        await item.update({ [`system.adjustments.${field}`]: value });
      });
    }
  }

  /** 成长记录：玩家可编辑模组名 */
  #installGrowthLabelEditing() {
    for (const input of this.element?.querySelectorAll(".c7t-growth-label") ?? []) {
      if (input.dataset.bound) continue;
      input.dataset.bound = "1";
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        const oldLabel = input.dataset.oldLabel ?? "";
        const fallback = game.i18n.localize("C7TIDY.Growth.DefaultModule");
        const newLabel = input.value.trim() || fallback;
        const history = foundry.utils.duplicate(this.document.getFlag(MODULE_ID, "growthHistory") ?? []);
        const labels = foundry.utils.duplicate(this.document.getFlag(MODULE_ID, "growthLabels") ?? []);
        let changed = false;
        for (const record of history) {
          if (String(record.label ?? fallback) === oldLabel) {
            record.label = newLabel;
            changed = true;
          }
        }
        if (Array.isArray(labels)) {
          const index = labels.indexOf(oldLabel);
          if (index >= 0) {
            labels[index] = newLabel;
            changed = true;
          }
        }
        if (changed) {
          await this.document.setFlag(MODULE_ID, "growthHistory", history);
          await this.document.setFlag(MODULE_ID, "growthLabels", labels);
        }
        input.dataset.oldLabel = newLabel;
      });
    }
  }

  /** 成长记录状态（历史 + 模组名列表 + 当前模组） */
  #growthState() {
    const historyRaw = foundry.utils.duplicate(this.document.getFlag(MODULE_ID, "growthHistory") ?? []);
    const labelsRaw = foundry.utils.duplicate(this.document.getFlag(MODULE_ID, "growthLabels") ?? []);
    const history = Array.isArray(historyRaw) ? historyRaw : [];
    const labels = Array.isArray(labelsRaw) ? labelsRaw.map(String) : [];
    const defaultLabel = game.i18n.localize("C7TIDY.Growth.DefaultModule");
    const activeLabel = labels[labels.length - 1] ?? defaultLabel;
    return { history, labels, activeLabel, defaultLabel };
  }

  /** 追加逐条成长记录 */
  async #appendGrowthChecks(checks) {
    if (!checks.length) return;
    const { history, labels, activeLabel } = this.#growthState();
    if (!labels.length) labels.push(activeLabel);
    for (const check of checks) {
      history.push({
        id: foundry.utils.randomID(),
        label: activeLabel,
        createdAt: Date.now(),
        skillId: check.skillId,
        name: check.name,
        before: check.before,
        after: check.after,
        adjustmentsBefore: check.adjustmentsBefore,
        sanBefore: check.sanBefore,
        sanAfter: check.sanAfter,
      });
    }
    await this.document.setFlag(MODULE_ID, "growthHistory", history);
    await this.document.setFlag(MODULE_ID, "growthLabels", labels);
  }

  /** 对单个技能执行系统成长检定，返回一条记录数据 */
  async #developOne(item, fastForward = true) {
    const before = Number(item.system?.value ?? 0);
    const adjustmentsBefore = foundry.utils.duplicate(item.system?.adjustments ?? {});
    const sanBefore = Number(this.document.system?.attribs?.san?.value ?? 0);
    try {
      await this.document.developSkill?.(item.uuid, fastForward);
    } catch (err) {
      console.warn(`${MODULE_ID} | 成长检定失败：${item.name}`, err);
    }
    const updated = this.document.items.get(item.id) ?? item;
    return {
      skillId: item.id,
      name: item.name,
      before,
      after: Number(updated.system?.value ?? before),
      adjustmentsBefore,
      sanBefore,
      sanAfter: Number(this.document.system?.attribs?.san?.value ?? sanBefore),
    };
  }

  /** 新建模组记录分组 */
  static async _onNewGrowthModule(event) {
    event.preventDefault();
    const fallback = game.i18n.localize("C7TIDY.Growth.DefaultModule");
    let label = "";
    try {
      label = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize("C7TIDY.Growth.NewModule") },
        content: `<input type="text" name="label" value="" placeholder="${fallback}" autofocus>`,
        ok: {
          label: game.i18n.localize("C7TIDY.Growth.Create"),
          callback: (dialogEvent, button, dialog) =>
            (dialog?.element?.querySelector("input[name=label]") ?? button?.form?.elements?.label)?.value,
        },
      });
    } catch {
      return;
    }
    const name = String(label ?? "").trim() || fallback;
    const labels = foundry.utils.duplicate(this.document.getFlag(MODULE_ID, "growthLabels") ?? []);
    const list = Array.isArray(labels) ? labels.map(String) : [];
    if (list[list.length - 1] !== name) list.push(name);
    await this.document.setFlag(MODULE_ID, "growthLabels", list);
    await this.render();
  }

  /** 一键成长：逐条记录每个技能的检定结果 */
  static async _onGrowthAll(event) {
    event.preventDefault();
    const actor = this.document;
    const marked = actor.items.filter((item) => item.type === "skill" && item.system?.flags?.developement);
    if (!marked.length) return ui.notifications.info(game.i18n.localize("C7TIDY.Growth.NoMarked"));

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("C7TIDY.Growth.GrowthAll") },
      content: game.i18n.format("C7TIDY.Growth.ConfirmContent", { count: marked.length }),
    });
    if (!confirmed) return;

    const checks = [];
    for (const item of marked) checks.push(await this.#developOne(item, true));

    const remaining = [];
    for (const check of checks) {
      const item = actor.items.get(check.skillId);
      if (item?.system?.flags?.developement) remaining.push({ _id: item.id, "system.flags.developement": false });
    }
    if (remaining.length) await actor.updateEmbeddedDocuments("Item", remaining);

    await this.#appendGrowthChecks(checks);
    await this.render();
  }

  /** 撤销一条成长记录：恢复数值与 SAN，并重新标记该技能 */
  static async _onUndoGrowth(event, target) {
    event.preventDefault();
    const recordId = target.dataset.recordId;
    if (!recordId) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("C7TIDY.Growth.Undo") },
      content: game.i18n.localize("C7TIDY.Growth.UndoContent"),
    });
    if (!confirmed) return;

    const history = foundry.utils.duplicate(this.document.getFlag(MODULE_ID, "growthHistory") ?? []);
    let targetRecord = null;
    let skillId = null;
    let adjustmentsBefore = null;
    let sanBefore = null;

    if (recordId.includes("::")) {
      // 兼容旧版批量记录
      const [legacyId, indexText] = recordId.split("::");
      const legacy = history.find((entry) => entry.id === legacyId);
      const entry = legacy?.entries?.[Number(indexText)];
      if (legacy && entry) {
        targetRecord = legacy;
        skillId = entry.id;
        adjustmentsBefore = entry.adjustmentsBefore;
        legacy.entries.splice(Number(indexText), 1);
        if (!legacy.entries.length) {
          const at = history.indexOf(legacy);
          if (at >= 0) history.splice(at, 1);
        }
      }
    } else {
      const index = history.findIndex((entry) => entry.id === recordId);
      if (index >= 0) {
        const [removed] = history.splice(index, 1);
        skillId = removed.skillId;
        adjustmentsBefore = removed.adjustmentsBefore;
        sanBefore = removed.sanBefore;
        targetRecord = removed;
      }
    }
    if (!skillId) return;

    const item = this.document.items.get(skillId);
    if (item) {
      await item.update({
        "system.adjustments": foundry.utils.duplicate(adjustmentsBefore ?? item.system.adjustments),
        "system.flags.developement": true,
      });
    }
    if (Number.isFinite(sanBefore)) {
      await this.document.update({ "system.attribs.san.value": sanBefore });
    }

    await this.document.setFlag(MODULE_ID, "growthHistory", history);
    await this.render();
  }

  /** 手动调整成长数值（记录中的“成长后”与标记列表中的当前值） */
  #installGrowthValueEditing() {
    for (const input of this.element?.querySelectorAll(".c7t-growth-after") ?? []) {
      if (input.dataset.bound) continue;
      input.dataset.bound = "1";
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        const recordId = input.dataset.recordId;
        const newAfter = Number(input.value);
        if (!recordId || !Number.isFinite(newAfter)) return;
        const history = foundry.utils.duplicate(this.document.getFlag(MODULE_ID, "growthHistory") ?? []);
        const applyDelta = async (skillId, oldAfter) => {
          const item = this.document.items.get(skillId);
          if (!item) return;
          const adjustments = foundry.utils.duplicate(item.system.adjustments ?? {});
          adjustments.experience = Number(adjustments.experience ?? 0) + (newAfter - oldAfter);
          await item.update({ "system.adjustments": adjustments });
        };
        if (recordId.includes("::")) {
          const [legacyId, indexText] = recordId.split("::");
          const legacy = history.find((entry) => entry.id === legacyId);
          const entry = legacy?.entries?.[Number(indexText)];
          if (!entry) return;
          const oldAfter = Number(entry.after);
          entry.after = newAfter;
          await applyDelta(entry.id, oldAfter);
        } else {
          const record = history.find((entry) => entry.id === recordId);
          if (!record) return;
          const oldAfter = Number(record.after);
          record.after = newAfter;
          await applyDelta(record.skillId, oldAfter);
        }
        await this.document.setFlag(MODULE_ID, "growthHistory", history);
        await this.render();
      });
    }

    for (const input of this.element?.querySelectorAll(".c7t-growth-manual") ?? []) {
      if (input.dataset.bound) continue;
      input.dataset.bound = "1";
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        const item = this.document.items.get(input.dataset.itemId);
        if (!item) return;
        const before = Number(input.dataset.current ?? item.system?.value ?? 0);
        const after = Number(input.value);
        if (!Number.isFinite(after) || after === before) {
          input.value = String(before);
          return;
        }
        const adjustments = foundry.utils.duplicate(item.system.adjustments ?? {});
        const adjustmentsBefore = foundry.utils.duplicate(adjustments);
        adjustments.experience = Number(adjustments.experience ?? 0) + (after - before);
        await item.update({ "system.adjustments": adjustments });
        await this.#appendGrowthChecks([
          { skillId: item.id, name: item.name, before, after, adjustmentsBefore },
        ]);
        await this.render();
      });
    }
  }

  /** 成长勾选：直接绑定，绕过 AppV2 的 data-action 委托 */
  #installDevelopmentToggles() {
    for (const button of this.element?.querySelectorAll(".c7t-dev-hit") ?? []) {
      if (button.dataset.bound) continue;
      button.dataset.bound = "1";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const row = button.closest("[data-item-id]");
        const item = row ? this.document.items.get(row.dataset.itemId) : null;
        if (!item) return;
        await item.update({ "system.flags.developement": !item.system?.flags?.developement });
      });
    }
  }

  /** 背景卡片文本：数组字段不能走表单提交，显式更新 */
  #installBiographyEditing() {
    for (const area of this.element?.querySelectorAll("textarea[data-bio-index]") ?? []) {
      if (area.dataset.bound) continue;
      area.dataset.bound = "1";
      area.addEventListener("change", async (event) => {
        event.stopPropagation();
        if (!this.isEditing) return;
        const index = Number(area.dataset.bioIndex);
        const biography = foundry.utils.duplicate(this.document.system.biography ?? []);
        if (!Number.isInteger(index) || !biography[index]) return;
        biography[index].value = area.value;
        await this.document.update({ "system.biography": biography });
      });
    }
  }

  /* -------------------------------------------- */
  /* 调查员专属 Actions                             */
  /* -------------------------------------------- */

  static async _onRollDerived(event, target) {
    event.preventDefault();
    const key = target.dataset.key;
    if (!key) return;
    const map = {
      idea: { characteristic: "int", cardType: "C/IC" },
      know: { characteristic: "edu", cardType: "C/KC" },
    };
    const entry = map[key];
    if (!entry) return;
    if (typeof this.document.characteristicCheck !== "function") return warnMissingApi();
    await this.document.characteristicCheck(entry.characteristic, event.shiftKey, { event, cardType: entry.cardType });
  }

  static async _onResetDailySan(event) {
    event.preventDefault();
    if (typeof this.document.resetDailySanity !== "function") return warnMissingApi();
    await this.document.resetDailySanity();
  }

  static async _onToggleDevelopment(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item) return;
    await item.update({ "system.flags.developement": !item.system?.flags?.developement });
  }

  static async _onToggleFavorite(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const current = this.document.getFlag(MODULE_ID, "favorites") ?? [];
    const exists = current.some((entry) => entry.id === itemId);
    const next = exists ? current.filter((entry) => entry.id !== itemId) : [...current, { id: itemId }];
    await this.document.setFlag(MODULE_ID, "favorites", next);
  }

  static async _onCreateBackgroundSlot(event, target) {
    event.preventDefault();
    if (!this.isEditing) return;
    const slotId = target.dataset.slot;
    const slot = BACKGROUND_SLOTS.find((entry) => entry.id === slotId);
    if (!slot) return;
    const biography = foundry.utils.duplicate(this.document.system.biography ?? []);
    biography.push({ title: game.i18n.localize(slot.label), value: "" });
    await this.document.update({ "system.biography": biography });
  }

  static async _onToggleKeyConnection(event, target) {
    event.preventDefault();
    const slotId = target.dataset.slot;
    if (!slotId) return;
    const current = this.document.getFlag(MODULE_ID, "keyConnections") ?? [];
    const next = current.includes(slotId) ? current.filter((id) => id !== slotId) : [...current, slotId];
    await this.document.setFlag(MODULE_ID, "keyConnections", next);
  }

  /** 守秘笔记里的系统标记开关 */
  static async _onToggleActorFlag(event, target) {
    event.preventDefault();
    const flag = target.dataset.flag;
    if (!flag) return;
    await this.document.update({ [`system.flags.${flag}`]: !this.document.system?.flags?.[flag] });
  }

  static async _onDevelopSkill(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item) return;
    if (typeof this.document.developSkill !== "function") return warnMissingApi();
    // 系统内部使用 fromUuid()，必须传完整 uuid；单项成长同样写入记录
    const check = await this.#developOne(item, event.shiftKey);
    await this.#appendGrowthChecks([check]);
    await this.render();
  }
}

/** 给技能/武器/物品行标记收藏状态 */
function markFavorites(context, actor) {
  const raw = actor.getFlag(MODULE_ID, "favorites") ?? [];
  const ids = new Set((Array.isArray(raw) ? raw : []).map((entry) => entry.id));
  context.favoriteIds = [...ids];
  for (const row of context.skillView?.rows ?? []) row.isFavorite = ids.has(row.id);
  for (const group of context.skillView?.groups ?? []) {
    for (const row of group.skills ?? []) row.isFavorite = ids.has(row.id);
  }
  for (const weapon of context.weapons ?? []) weapon.isFavorite = ids.has(weapon.id);
  for (const group of context.possessions?.groups ?? []) {
    for (const item of group.items ?? []) item.isFavorite = ids.has(item.id);
  }
}

/** 富文本渲染（找不到 TextEditor 时原样返回） */
async function enrichHtml(actor, html) {
  const TextEditor = foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  if (!TextEditor?.enrichHTML) return html ?? "";
  try {
    return await TextEditor.enrichHTML(html || "", { async: true, relativeTo: actor });
  } catch {
    return html ?? "";
  }
}

/** 背景富文本：锁定时渲染 HTML，编辑时保留原文 */
async function enrichBackground(actor) {
  const data = prepareBackground(actor);
  data.slots = await Promise.all(
    data.slots.map(async (slot) => ({ ...slot, valueHtml: await enrichHtml(actor, slot.value) })),
  );
  data.backstoryHtml = await enrichHtml(actor, data.backstory);
  data.notesHtml = await enrichHtml(actor, data.notes);
  data.keeperHtml = await enrichHtml(actor, actor.system?.description?.keeper ?? "");
  return data;
}
