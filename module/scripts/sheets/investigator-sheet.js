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
import { Coc7TidyBaseSheet } from "./base-sheet.js";

/**
 * CoC7 Tidy 调查员角色卡。
 */
export class Coc7TidyInvestigatorSheet extends Coc7TidyBaseSheet {
  /** 技能排序方式：value | name | custom（null 时读取模块设置） */
  skillSort = null;

  /** 物品分组的折叠状态（当前窗口会话内） */
  #collapsedGroups = new Set();

  /** 拖拽状态 */
  #dragState = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["coc7-tidy", "sheet", "actor", "investigator"],
    position: { width: 780, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      toggleLock: Coc7TidyInvestigatorSheet._onToggleLock,
      rollCharacteristic: Coc7TidyInvestigatorSheet._onRollCharacteristic,
      rollSkill: Coc7TidyInvestigatorSheet._onRollSkill,
      rollDerived: Coc7TidyInvestigatorSheet._onRollDerived,
      rollAttribute: Coc7TidyInvestigatorSheet._onRollAttribute,
      toggleCondition: Coc7TidyInvestigatorSheet._onToggleCondition,
      resetDailySan: Coc7TidyInvestigatorSheet._onResetDailySan,
      toggleDevelopment: Coc7TidyInvestigatorSheet._onToggleDevelopment,
      openItem: Coc7TidyInvestigatorSheet._onOpenItem,
      deleteItem: Coc7TidyInvestigatorSheet._onDeleteItem,
      createItem: Coc7TidyInvestigatorSheet._onCreateItem,
      toggleSkillSort: Coc7TidyInvestigatorSheet._onToggleSkillSort,
      toggleFavorite: Coc7TidyInvestigatorSheet._onToggleFavorite,
      createBackgroundSlot: Coc7TidyInvestigatorSheet._onCreateBackgroundSlot,
      toggleKeyConnection: Coc7TidyInvestigatorSheet._onToggleKeyConnection,
      weaponAttack: Coc7TidyInvestigatorSheet._onWeaponAttack,
      weaponDamage: Coc7TidyInvestigatorSheet._onWeaponDamage,
      toggleActorFlag: Coc7TidyInvestigatorSheet._onToggleActorFlag,
      clearConditions: Coc7TidyInvestigatorSheet._onClearConditions,
      toggleEffect: Coc7TidyInvestigatorSheet._onToggleEffect,
      createEffect: Coc7TidyInvestigatorSheet._onCreateEffect,
      openEffect: Coc7TidyInvestigatorSheet._onOpenEffect,
      deleteEffect: Coc7TidyInvestigatorSheet._onDeleteEffect,
      developSkill: Coc7TidyInvestigatorSheet._onDevelopSkill,
      growthAll: Coc7TidyInvestigatorSheet._onGrowthAll,
      newGrowthModule: Coc7TidyInvestigatorSheet._onNewGrowthModule,
      toggleGroup: Coc7TidyInvestigatorSheet._onToggleGroup,
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
    for (const group of context.possessions.groups) group.collapsed = this.#collapsedGroups.has(group.type);
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
    this.#installSkillSearch();
    this.#installBiographyEditing();
    this.#installItemContextMenu();
    this.#installDevelopmentToggles();
    this.#installGrowthLabelEditing();
    this.#installGrowthValueEditing();
    this.#installSkillAdjEditing();
    this.#installDragSorting();
    this.#installItemQuantityEditing();
    this.#installBookProgressEditing();
  }

  /** 物品数量内联编辑 */
  #installItemQuantityEditing() {
    for (const input of this.element?.querySelectorAll(".c7t-qty-input") ?? []) {
      if (input.dataset.bound) continue;
      input.dataset.bound = "1";
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        const row = input.closest("[data-item-id]");
        const item = row ? this.document.items.get(row.dataset.itemId) : null;
        const quantity = Number(input.value);
        if (!item || !Number.isFinite(quantity)) return;
        await item.update({ "system.quantity": Math.max(0, Math.trunc(quantity)) });
      });
    }
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

  /** 物品分组折叠 */
  static async _onToggleGroup(event, target) {
    event.preventDefault();
    const type = target.dataset.type;
    if (!type) return;
    if (this.#collapsedGroups.has(type)) this.#collapsedGroups.delete(type);
    else this.#collapsedGroups.add(type);
    await this.render();
  }

  /** 技能 / 物品拖拽排序（写入 item.sort） */
  #installDragSorting() {
    if (!this.element || this.element.dataset.dragBound) return;
    this.element.dataset.dragBound = "1";

    const rowOf = (target) => target?.closest?.(".c7t-row[draggable='true']");
    const clear = () => {
      this.element.querySelectorAll(".is-dragging,.is-drop-before,.is-drop-after")
        .forEach((el) => el.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
    };

    this.element.addEventListener("dragstart", (event) => {
      const row = rowOf(event.target);
      if (!row) return;
      this.#dragState = { id: row.dataset.itemId, parent: row.parentElement };
      row.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        try {
          event.dataTransfer.setData("text/plain", row.dataset.itemId ?? "");
        } catch {
          /* Safari */
        }
      }
    });

    this.element.addEventListener("dragover", (event) => {
      const row = rowOf(event.target);
      const state = this.#dragState;
      if (!row || !state || row.parentElement !== state.parent || row.dataset.itemId === state.id) return;
      event.preventDefault();
      clear();
      const rect = row.getBoundingClientRect();
      row.classList.add(event.clientY < rect.top + rect.height / 2 ? "is-drop-before" : "is-drop-after");
    });

    this.element.addEventListener("drop", async (event) => {
      const row = rowOf(event.target);
      const state = this.#dragState;
      if (!row || !state || row.parentElement !== state.parent || row.dataset.itemId === state.id) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      const after = event.clientY >= rect.top + rect.height / 2;
      const dragged = this.document.items.get(state.id);
      const target = this.document.items.get(row.dataset.itemId);
      if (!dragged || !target) return;
      const siblings = [...row.parentElement.querySelectorAll(".c7t-row[data-item-id]")]
        .map((el) => this.document.items.get(el.dataset.itemId))
        .filter(Boolean);
      const without = siblings.filter((item) => item.id !== dragged.id);
      const targetIndex = without.findIndex((item) => item.id === target.id);
      if (targetIndex < 0) return;
      const insertIndex = after ? targetIndex + 1 : targetIndex;

      // 统一重排为 10/20/30…，避免初始 sort 全为 0 时中点插入无效；
      // 被拖动项插入到 (insertIndex*10+5)，落在相邻两项之间。
      const updates = without.map((item, index) => ({ _id: item.id, sort: (index + 1) * 10 }));
      updates.push({ _id: dragged.id, sort: insertIndex * 10 + 5 });
      await this.document.updateEmbeddedDocuments("Item", updates);
    });

    this.element.addEventListener("dragend", () => {
      this.#dragState = null;
      clear();
    });
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
        const applyDelta = async (skillId, oldAfter, adjustmentsBefore) => {
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
          await applyDelta(entry.id, oldAfter, entry.adjustmentsBefore);
        } else {
          const record = history.find((entry) => entry.id === recordId);
          if (!record) return;
          const oldAfter = Number(record.after);
          record.after = newAfter;
          await applyDelta(record.skillId, oldAfter, record.adjustmentsBefore);
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

  /** 物品行右键菜单：打开物品卡 / 删除 */
  #installItemContextMenu() {
    if (!this.element || this.element.dataset.ctxBound) return;
    this.element.dataset.ctxBound = "1";
    this.element.addEventListener("contextmenu", (event) => {
      const row = event.target.closest("[data-item-id]");
      if (!row) return;
      const item = this.document.items.get(row.dataset.itemId);
      if (!item) return;
      event.preventDefault();
      this.#openItemMenu(event, item);
    });
  }

  #openItemMenu(event, item) {
    document.querySelector(".c7t-context-menu")?.remove();
    const menu = document.createElement("div");
    menu.className = "c7t-context-menu";

    const favorites = this.document.getFlag(MODULE_ID, "favorites") ?? [];
    const isFavorite = Array.isArray(favorites) && favorites.some((entry) => entry.id === item.id);
    const entries = [
      { label: game.i18n.localize("C7TIDY.Context.Open"), run: () => item.sheet?.render(true) },
      {
        label: game.i18n.localize(isFavorite ? "C7TIDY.Action.RemoveFavorite" : "C7TIDY.Action.AddFavorite"),
        run: async () => {
          const current = this.document.getFlag(MODULE_ID, "favorites") ?? [];
          const list = Array.isArray(current) ? current : [];
          const exists = list.some((entry) => entry.id === item.id);
          const next = exists ? list.filter((entry) => entry.id !== item.id) : [...list, { id: item.id }];
          await this.document.setFlag(MODULE_ID, "favorites", next);
        },
      },
    ];
    if (this.isEditable) {
      entries.push({
        label: game.i18n.localize("C7TIDY.Action.DeleteItem"),
        run: async () => {
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("C7TIDY.Context.DeleteTitle") },
            content: game.i18n.format("C7TIDY.Context.DeleteContent", { name: item.name }),
          });
          if (confirmed) await item.delete();
        },
      });
    }

    for (const entry of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.label;
      button.addEventListener("click", async () => {
        menu.remove();
        await entry.run();
      });
      menu.append(button);
    }

    document.body.append(menu);
    const { innerWidth, innerHeight } = window;
    const width = menu.offsetWidth || 120;
    const height = menu.offsetHeight || 60;
    menu.style.left = `${Math.min(event.clientX, innerWidth - width - 8)}px`;
    menu.style.top = `${Math.min(event.clientY, innerHeight - height - 8)}px`;

    const close = (closeEvent) => {
      if (menu.contains(closeEvent.target)) return;
      menu.remove();
      document.removeEventListener("pointerdown", close);
    };
    setTimeout(() => document.addEventListener("pointerdown", close), 0);
  }

  /** 技能搜索：纯前端过滤，不触发重渲染 */
  #installSkillSearch() {
    const input = this.element?.querySelector(".c7t-skills-search");
    if (!input || input.dataset.bound) return;
    input.dataset.bound = "1";
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      for (const row of this.element.querySelectorAll(".c7t-table.skills .c7t-row")) {
        const name = row.querySelector(".c7t-row-name")?.textContent?.toLowerCase() ?? "";
        row.hidden = query.length > 0 && !name.includes(query);
      }
      for (const group of this.element.querySelectorAll(".c7t-skill-group")) {
        const rows = [...group.querySelectorAll(".c7t-row")];
        group.hidden = query.length > 0 && rows.every((row) => row.hidden);
      }
    });
  }

  /* -------------------------------------------- */
  /* Actions                                      */
  /* -------------------------------------------- */

  static async _onToggleLock() {
    await this.document.update({ "system.flags.locked": !this.isLocked });
  }

  static async _onRollCharacteristic(event, target) {
    event.preventDefault();
    const key = target.dataset.key;
    if (!key) return;
    if (typeof this.document.characteristicCheck !== "function") return warnMissingApi();
    await this.document.characteristicCheck(key, event.shiftKey, { event });
  }

  static async _onRollSkill(event, target) {
    event.preventDefault();
    // 行内其它按钮（成长勾选/收藏/编辑/删除）不应触发整行投骰
    const actionEl = event.target.closest?.("[data-action]");
    if (actionEl && actionEl !== target && actionEl.dataset.action !== "rollSkill") return;
    const itemId = target.dataset.itemId ?? target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item) return;
    if (typeof this.document.skillCheck !== "function") return warnMissingApi();
    await this.document.skillCheck(item.name, event.shiftKey, { event });
  }

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

  static async _onRollAttribute(event, target) {
    event.preventDefault();
    const key = target.dataset.key;
    if (!key) return;
    if (typeof this.document.attributeCheck !== "function") return warnMissingApi();
    await this.document.attributeCheck(key, event.shiftKey, { event });
  }

  static async _onToggleCondition(event, target) {
    event.preventDefault();
    const key = target.dataset.key;
    if (!key) return;
    const actor = this.document;
    const before = Boolean(actor.system?.conditions?.[key]?.value);

    if (typeof actor.toggleCondition === "function") {
      try {
        await actor.toggleCondition(key);
      } catch (err) {
        console.warn(`${MODULE_ID} | toggleCondition(${key}) 失败，改用数据字段兜底`, err);
      }
    }

    // 某些状态在系统里走 ActiveEffect 图标路径，不一定回写 system.conditions，
    // 此时强制写一次数据字段，保证卡片上的状态可切换。
    const after = Boolean(this.document.system?.conditions?.[key]?.value);
    if (after === before) {
      const desired = !before;
      try {
        if (desired && typeof actor.conditionsSet === "function") {
          await actor.conditionsSet([key], { forceValue: true });
        } else if (!desired && typeof actor.conditionsUnset === "function") {
          await actor.conditionsUnset([key], { forceValue: true });
        } else {
          await actor.update({ [`system.conditions.${key}.value`]: desired });
        }
      } catch (err) {
        console.error(`${MODULE_ID} | 状态 ${key} 切换失败`, err);
        return;
      }
    }

    await this.render();
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

  static _onOpenItem(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    this.document.items.get(itemId)?.sheet?.render(true);
  }

  static async _onDeleteItem(event, target) {
    event.preventDefault();
    if (!this.isEditing) return;
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    await this.document.items.get(itemId)?.delete();
  }

  static async _onCreateItem(event, target) {
    event.preventDefault();
    if (!this.isEditing) return;
    const type = target.dataset.type ?? "item";
    const actor = this.document;
    const creators = {
      weapon: "createEmptyWeapon",
      armor: "createEmptyArmor",
      book: "createEmptyBook",
      spell: "createEmptySpell",
      item: "createEmptyItem",
      skill: "createEmptySkill",
    };
    const fn = actor[creators[type]];
    if (typeof fn === "function") {
      await fn.call(actor, event);
      return;
    }
    await actor.createEmbeddedDocuments("Item", [{ name: game.i18n.localize(`TYPES.Item.${type}`), type }]);
  }

  static async _onToggleSkillSort(event) {
    event.preventDefault();
    this.skillSort = this.skillSort === "value" ? "name" : this.skillSort === "name" ? "custom" : "value";
    await this.render();
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

  static async _onWeaponAttack(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item) return;
    if (typeof this.document.weaponCheck !== "function") return warnMissingApi();
    await this.document.weaponCheck({ uuid: item.uuid }, event.shiftKey);
  }

  /** 直接掷武器伤害（含伤害加值处理） */
  static async _onWeaponDamage(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item) return;
    const formula = buildWeaponDamage(item, this.document);
    try {
      const roll = await new Roll(formula).evaluate();
      await roll.toMessage({
        flavor: game.i18n.format("C7TIDY.Weapon.DamageFlavor", { name: item.name }),
        speaker: ChatMessage.getSpeaker({ actor: this.document }),
      });
    } catch (err) {
      console.error(`${MODULE_ID} | 伤害公式无效：${formula}`, err);
      ui.notifications.error(game.i18n.format("C7TIDY.Weapon.DamageError", { formula }));
    }
  }

  /** 守秘笔记里的系统标记开关 */
  static async _onToggleActorFlag(event, target) {
    event.preventDefault();
    const flag = target.dataset.flag;
    if (!flag) return;
    await this.document.update({ [`system.flags.${flag}`]: !this.document.system?.flags?.[flag] });
  }

  /** 清除全部状态 */
  static async _onClearConditions(event) {
    event.preventDefault();
    const actor = this.document;
    const keys = ["criticalWounds", "unconscious", "dying", "dead", "prone", "tempoInsane", "indefInsane"];
    try {
      if (typeof actor.conditionsUnset === "function") await actor.conditionsUnset(keys);
    } catch (err) {
      console.warn(`${MODULE_ID} | conditionsUnset 失败`, err);
    }
    const updates = Object.fromEntries(keys.map((key) => [`system.conditions.${key}.value`, false]));
    await actor.update(updates);
    await this.render();
  }

  /** 新增效果 */
  static async _onCreateEffect(event) {
    event.preventDefault();
    if (!this.isEditing) return;
    const [effect] = await this.document.createEmbeddedDocuments("ActiveEffect", [
      { name: game.i18n.localize("C7TIDY.Effects.New"), img: "icons/svg/aura.svg" },
    ]);
    effect?.sheet?.render(true);
  }

  /** 打开效果配置 */
  static _onOpenEffect(event, target) {
    event.preventDefault();
    const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
    this.document.effects.get(effectId)?.sheet?.render(true);
  }

  static async _onToggleEffect(event, target) {
    event.preventDefault();
    const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
    const effect = effectId ? this.document.effects.get(effectId) : null;
    if (!effect) return;
    await effect.update({ disabled: !effect.disabled });
  }

  static async _onDeleteEffect(event, target) {
    event.preventDefault();
    if (!this.isEditing) return;
    const effectId = target.closest("[data-effect-id]")?.dataset.effectId;
    await this.document.effects.get(effectId)?.delete();
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

/** 计算武器伤害公式，处理 DB / 半 DB */
function buildWeaponDamage(item, actor) {
  const damage = String(item.system?.range?.normal?.damage ?? "").trim();
  const properties = item.system?.properties ?? {};
  const rawDb = String(actor.system?.attribs?.db?.value ?? "0").trim() || "0";
  const addDb = Boolean(properties.addb);
  const addHalfDb = Boolean(properties.ahdb);

  let formula = damage;
  const hasDbToken = /(^|[^a-z])db([^a-z]|$)/i.test(formula);

  let dbExpr = null;
  if (addHalfDb) dbExpr = halfDamageBonus(rawDb);
  else if (addDb) dbExpr = rawDb;

  if (hasDbToken) {
    formula = formula.replace(/\bdb\b/gi, `(${dbExpr ?? rawDb})`);
  } else if (dbExpr && dbExpr !== "0") {
    formula = formula ? `${formula}+(${dbExpr})` : `(${dbExpr})`;
  }

  formula = formula.replace(/\s+/g, " ").trim();
  return formula || "0";
}

/** 伤害加值减半：1D4→1D2、2D6→1D6、固定值向下取半 */
function halfDamageBonus(db) {
  const dice = db.match(/^(\d*)D(\d+)$/i);
  if (dice) {
    const count = Math.max(1, Math.floor((Number(dice[1] || 1)) / 2));
    const base = Number(dice[1] || 1);
    const sides = base > 1 ? Number(dice[2]) : Math.max(2, Math.floor(Number(dice[2]) / 2));
    return `${count}D${sides}`;
  }
  const fixed = Number(db);
  return Number.isFinite(fixed) ? String(Math.trunc(fixed / 2)) : db;
}

function warnMissingApi() {
  ui.notifications.warn(game.i18n.localize("C7TIDY.Warn.CoC7ApiMissing"));
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
