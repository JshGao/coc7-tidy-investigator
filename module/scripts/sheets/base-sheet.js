import { MODULE_ID } from "../constants.js";
import {
  orderResources,
  prepareCharacteristics,
  prepareConditions,
  prepareDailySan,
  prepareDerived,
  prepareIdentity,
  prepareResources,
} from "../services/view-data.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * CoC7 Tidy 卡片基类：调查员卡与生物卡共用。
 * - 窗口尺寸记忆 / 八向缩放 / 紧凑模式 / 锁定态
 * - 通用 actions（锁、检定、物品、效果、状态、排序、分组）
 * - 通用监听（技能搜索、右键菜单、行拖拽排序、道具数量）
 * 子类只处理自己特有的数据与交互。
 */
export class Coc7TidyBaseSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** 技能排序方式：value | name | custom（null 时读取模块设置） */
  skillSort = null;

  /** 分组折叠状态（会话内） */
  collapsedGroups = new Set();

  /** 拖拽排序状态 */
  dragState = null;

  /** 子类可覆盖的通用 actions，配合 `...Coc7TidyBaseSheet.COMMON_ACTIONS` 使用 */
  static COMMON_ACTIONS = {
    toggleLock: Coc7TidyBaseSheet._onToggleLock,
    rollCharacteristic: Coc7TidyBaseSheet._onRollCharacteristic,
    rollSkill: Coc7TidyBaseSheet._onRollSkill,
    rollAttribute: Coc7TidyBaseSheet._onRollAttribute,
    toggleCondition: Coc7TidyBaseSheet._onToggleCondition,
    clearConditions: Coc7TidyBaseSheet._onClearConditions,
    openItem: Coc7TidyBaseSheet._onOpenItem,
    deleteItem: Coc7TidyBaseSheet._onDeleteItem,
    createItem: Coc7TidyBaseSheet._onCreateItem,
    weaponAttack: Coc7TidyBaseSheet._onWeaponAttack,
    weaponDamage: Coc7TidyBaseSheet._onWeaponDamage,
    toggleEffect: Coc7TidyBaseSheet._onToggleEffect,
    createEffect: Coc7TidyBaseSheet._onCreateEffect,
    openEffect: Coc7TidyBaseSheet._onOpenEffect,
    deleteEffect: Coc7TidyBaseSheet._onDeleteEffect,
    toggleSkillSort: Coc7TidyBaseSheet._onToggleSkillSort,
    toggleGroup: Coc7TidyBaseSheet._onToggleGroup,
  };

  /** @returns {Actor} */
  get actor() {
    return this.document;
  }

  /** 系统原生「锁定」标志：锁定时为只读展示。 */
  get isLocked() {
    return Boolean(this.document.system?.flags?.locked);
  }

  /** 是否处于可编辑态（有 owner 权限且未锁定）。 */
  get isEditing() {
    return Boolean(this.isEditable && !this.isLocked);
  }

  /** @override */
  _initializeApplicationOptions(options) {
    const opts = super._initializeApplicationOptions(options);
    opts.window.resizable = true;

    try {
      if (game.settings.get(MODULE_ID, "rememberWindowSize")) {
        const saved = (game.settings.get(MODULE_ID, "sheetSize") ?? {})[this.constructor.name];
        if (saved?.width && saved?.height) {
          opts.position = { ...opts.position, width: saved.width, height: saved.height };
        }
      }
    } catch {
      /* 设置尚未注册时忽略 */
    }
    return opts;
  }

  /** 保存当前窗口尺寸（供下次打开使用） */
  #saveWindowSize() {
    try {
      if (!game.settings.get(MODULE_ID, "rememberWindowSize")) return;
      const sizes = foundry.utils.duplicate(game.settings.get(MODULE_ID, "sheetSize") ?? {});
      sizes[this.constructor.name] = { width: Math.round(this.position.width), height: Math.round(this.position.height) };
      game.settings.set(MODULE_ID, "sheetSize", sizes);
    } catch {
      /* 忽略 */
    }
  }

  /** @override */
  async _onClose(options) {
    this.#saveWindowSize();
    return super._onClose(options);
  }

  /** 缩放手柄挂载的最小尺寸 */
  static MIN_WIDTH = 700;
  static MIN_HEIGHT = 500;
  static RESIZE_DIRECTIONS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#installResizeHandles();
    this.#installSkillSearch();
    this.#installItemContextMenu();
    this.#installDragSorting();
    this.#installItemQuantityEditing();
  }

  /** 在窗口四周安装 8 个缩放手柄（Foundry 原生只有右下角一个）。 */
  #installResizeHandles() {
    const win = this.element;
    if (!win || win.querySelector(".c7t-resize-handle")) return;
    for (const dir of Coc7TidyBaseSheet.RESIZE_DIRECTIONS) {
      const handle = document.createElement("div");
      handle.className = `c7t-resize-handle c7t-resize-${dir}`;
      handle.dataset.dir = dir;
      handle.addEventListener("pointerdown", (event) => this.#onResizeStart(event, dir));
      win.append(handle);
    }
  }

  /** @param {PointerEvent} event @param {string} dir */
  #onResizeStart(event, dir) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const start = {
      x: event.clientX,
      y: event.clientY,
      left: this.position.left,
      top: this.position.top,
      width: this.position.width,
      height: this.position.height,
    };
    const minWidth = this.constructor.MIN_WIDTH ?? 700;
    const minHeight = this.constructor.MIN_HEIGHT ?? 500;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      let { left, top, width, height } = start;

      if (dir.includes("e")) width = Math.max(minWidth, start.width + dx);
      if (dir.includes("s")) height = Math.max(minHeight, start.height + dy);
      if (dir.includes("w")) {
        width = Math.max(minWidth, start.width - dx);
        left = start.left + (start.width - width);
      }
      if (dir.includes("n")) {
        height = Math.max(minHeight, start.height - dy);
        top = start.top + (start.height - height);
      }

      this.setPosition({
        left: Math.max(0, left),
        top: Math.max(0, top),
        width,
        height,
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      this.#saveWindowSize();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  #isCompact() {
    try {
      return Boolean(game.settings.get(MODULE_ID, "compactMode"));
    } catch {
      return false;
    }
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system ?? {};

    return Object.assign(context, {
      actor,
      document: actor,
      system,
      canEdit: this.isEditable,
      isCompact: this.#isCompact(),
      isLocked: this.isLocked,
      isEditing: this.isEditing,
      isGM: game.user.isGM,
      identity: prepareIdentity(actor, system),
      characteristics: prepareCharacteristics(system, actor),
      resources: orderResources(
        prepareResources(system),
        this.document.getFlag?.(MODULE_ID, "resourceOrder"),
      ),
      derived: prepareDerived(system),
      conditions: prepareConditions(system),
      dailySan: prepareDailySan(system),
    });
  }

  /* -------------------------------------------- */
  /* 通用 Actions                                  */
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
    // 行内其它按钮不应触发整行投骰
    const actionEl = event.target.closest?.("[data-action]");
    if (actionEl && actionEl !== target && actionEl.dataset.action !== "rollSkill") return;
    const itemId = target.dataset.itemId ?? target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item) return;
    if (typeof this.document.skillCheck !== "function") return warnMissingApi();
    await this.document.skillCheck(item.name, event.shiftKey, { event });
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

  static async _onWeaponAttack(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item) return;
    if (typeof this.document.weaponCheck !== "function") return warnMissingApi();
    await this.document.weaponCheck({ uuid: item.uuid }, event.shiftKey);
  }

  /** 直接掷武器伤害（含伤害加值处理；支持霰弹枪指定射程档） */
  static async _onWeaponDamage(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    if (!item) return;
    const formula = buildWeaponDamage(item, this.document, target.dataset.range);
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

  static async _onToggleSkillSort(event) {
    event.preventDefault();
    this.skillSort = this.skillSort === "value" ? "name" : this.skillSort === "name" ? "custom" : "value";
    await this.render();
  }

  /** 物品分组折叠 */
  static async _onToggleGroup(event, target) {
    event.preventDefault();
    const type = target.dataset.type;
    if (!type) return;
    if (this.collapsedGroups.has(type)) this.collapsedGroups.delete(type);
    else this.collapsedGroups.add(type);
    await this.render();
  }

  /* -------------------------------------------- */
  /* 通用监听                                       */
  /* -------------------------------------------- */

  /** 技能搜索：纯前端过滤，不触发重渲染 */
  #installSkillSearch() {
    const input = this.element?.querySelector(".c7t-skills-search");
    if (!input || input.dataset.bound) return;
    input.dataset.bound = "1";
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      for (const row of this.element.querySelectorAll(".c7t-table .c7t-row")) {
        const name = row.querySelector(".c7t-row-name")?.textContent?.toLowerCase() ?? "";
        row.hidden = query.length > 0 && !name.includes(query);
      }
      for (const group of this.element.querySelectorAll(".c7t-skill-group, .c7t-group")) {
        const rows = [...group.querySelectorAll(".c7t-row")];
        group.hidden = query.length > 0 && rows.every((row) => row.hidden);
      }
    });
  }

  /** 物品行右键菜单（子类可扩展条目） */
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

  /**
   * 右键菜单条目。子类可覆盖并调用 `super._itemContextEntries(item)` 后增删。
   * @returns {{label:string, run:Function}[]}
   */
  _itemContextEntries(item) {
    const entries = [{ label: game.i18n.localize("C7TIDY.Context.Open"), run: () => item.sheet?.render(true) }];
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
    return entries;
  }

  #openItemMenu(event, item) {
    document.querySelector(".c7t-context-menu")?.remove();
    const menu = document.createElement("div");
    menu.className = "c7t-context-menu";

    const entries = this._itemContextEntries(item) ?? [];

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
      this.dragState = { id: row.dataset.itemId, parent: row.parentElement };
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
      const state = this.dragState;
      if (!row || !state || row.parentElement !== state.parent || row.dataset.itemId === state.id) return;
      event.preventDefault();
      clear();
      const rect = row.getBoundingClientRect();
      row.classList.add(event.clientY < rect.top + rect.height / 2 ? "is-drop-before" : "is-drop-after");
    });

    this.element.addEventListener("drop", async (event) => {
      const row = rowOf(event.target);
      const state = this.dragState;
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

      // 统一重排为 10/20/30…，避免初始 sort 全为 0 时中点插入无效
      const updates = without.map((item, index) => ({ _id: item.id, sort: (index + 1) * 10 }));
      updates.push({ _id: dragged.id, sort: insertIndex * 10 + 5 });
      await this.document.updateEmbeddedDocuments("Item", updates);
    });

    this.element.addEventListener("dragend", () => {
      this.dragState = null;
      clear();
    });
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
}

/* -------------------------------------------- */
/* 公共工具                                      */
/* -------------------------------------------- */

/** 计算武器伤害公式，处理 DB / 半 DB 与指定射程档 */
export function buildWeaponDamage(item, actor, rangeKey = "normal") {
  const key = ["normal", "long", "extreme"].includes(rangeKey) ? rangeKey : "normal";
  const damage = String(item.system?.range?.[key]?.damage ?? item.system?.range?.normal?.damage ?? "").trim();
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

export function warnMissingApi() {
  ui.notifications.warn(game.i18n.localize("C7TIDY.Warn.CoC7ApiMissing"));
}
