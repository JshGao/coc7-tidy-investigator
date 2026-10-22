import { MODULE_ID, TEMPLATES, NPC_ITEM_TYPES } from "../constants.js";
import {
  prepareMacros,
  prepareNpcIdentity,
  prepareNpcResources,
  prepareNpcSpecial,
  prepareNpcText,
  prepareTalents,
} from "../services/npc-data.js";
import {
  prepareEffects,
  preparePossessions,
  prepareSkillView,
  prepareWeapons,
} from "../services/tabs-data.js";
import { orderResources, prepareNpcDerived } from "../services/view-data.js";
import { Coc7TidyBaseSheet } from "./base-sheet.js";

/**
 * CoC7 Tidy 生物 / NPC 卡（types: npc + creature）。
 */
export class Coc7TidyNpcSheet extends Coc7TidyBaseSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["coc7-tidy", "sheet", "actor", "c7t-npc"],
    position: { width: 780, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      ...Coc7TidyBaseSheet.COMMON_ACTIONS,
      toggleFormulaMode: Coc7TidyNpcSheet._onToggleFormulaMode,
      rollCharacteristics: Coc7TidyNpcSheet._onRollCharacteristics,
      averageCharacteristics: Coc7TidyNpcSheet._onAverageCharacteristics,
      rollAttacksPerRound: Coc7TidyNpcSheet._onRollAttacksPerRound,
      sanLossLink: Coc7TidyNpcSheet._onSanLossLink,
      toggleAuto: Coc7TidyNpcSheet._onToggleAuto,
      toggleArmorNotes: Coc7TidyNpcSheet._onToggleArmorNotes,
      addMovement: Coc7TidyNpcSheet._onAddMovement,
      removeMovement: Coc7TidyNpcSheet._onRemoveMovement,
      executeMacro: Coc7TidyNpcSheet._onExecuteMacro,
      removeMacro: Coc7TidyNpcSheet._onRemoveMacro,
      createTalent: Coc7TidyNpcSheet._onCreateTalent,
    },
  };

  /** @override */
  static TABS = {
    primary: {
      initial: "combat",
      labelPrefix: "C7TIDY.Tabs",
      tabs: [
        { id: "combat", icon: "fa-solid fa-crosshairs" },
        { id: "skills", icon: "fa-solid fa-dice-d20" },
        { id: "inventory", icon: "fa-solid fa-suitcase" },
        { id: "description", icon: "fa-solid fa-book-open" },
        { id: "keeper", icon: "fa-solid fa-feather" },
        { id: "effects", icon: "fa-solid fa-bolt" },
      ],
    },
  };

  /** @override */
  static PARTS = {
    body: {
      template: TEMPLATES.npcSheet,
      scrollable: [".c7t-scroll"],
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system ?? {};

    this.skillSort ??= game.settings.get(MODULE_ID, "defaultSkillSort") ?? "value";
    context.skillSort = this.skillSort;
    context.sortByValue = this.skillSort === "value";
    context.sortByName = this.skillSort === "name";
    context.isCustomSort = this.skillSort === "custom";

    context.isCreature = actor.type === "creature";
    context.npc = prepareNpcIdentity(actor, system);
    context.resources = orderResources(
      prepareNpcResources(system, !this.isEditing),
      actor.getFlag?.(MODULE_ID, "resourceOrder"),
    );
    context.derived = prepareNpcDerived(system);
    context.special = prepareNpcSpecial(actor);
    context.talents = prepareTalents(actor);
    context.weapons = prepareWeapons(actor);
    context.skillView = prepareSkillView(actor, { sort: this.skillSort });
    context.inventory = preparePossessions(actor, { types: NPC_ITEM_TYPES, keepEmpty: this.isEditing });
    for (const group of context.inventory.groups) group.collapsed = this.collapsedGroups.has(group.type);
    context.effects = prepareEffects(actor);
    context.macros = await prepareMacros(actor);
    context.npcText = await prepareNpcText(actor);
    // 公式模式只在编辑态生效；锁定时仍按数值展示，避免盾徽空白
    context.formulaMode = this.isEditing && Boolean(system.flags?.displayFormula);

    // 「守秘」tab 仅 GM 可见
    if (!game.user.isGM && context.tabs) delete context.tabs.keeper;

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#installSkillValueEditing();
    this.#installMovementEditing();
    this.#installNumericInputGuard();
  }

  /** @override：接受 Macro 拖入（系统默认卡同款行为）。 */
  async _onDropDocument(event, document) {
    if (document?.documentName === "Macro" && ["npc", "creature"].includes(this.document.type)) {
      const macros = foundry.utils.duplicate(this.document.system?.special?.macros ?? []);
      macros.push({ uuid: document.uuid });
      await this.document.update({ "system.special.macros": macros });
      return;
    }
    return super._onDropDocument?.(event, document);
  }

  /** @override：关闭卡时复位公式模式（与系统默认卡一致）。 */
  async _onClose(options) {
    const result = await super._onClose(options);
    try {
      if (this.isEditable && this.document.system?.flags?.displayFormula) {
        await this.document.update({ "system.flags.displayFormula": false });
      }
    } catch {
      /* 忽略 */
    }
    return result;
  }

  /** 技能当前值内联编辑：写 adjustments.experience 差量（system.value 不是字段）。 */
  #installSkillValueEditing() {
    for (const input of this.element?.querySelectorAll(".c7t-skill-input") ?? []) {
      if (input.dataset.bound) continue;
      input.dataset.bound = "1";
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        const row = input.closest("[data-item-id]");
        const item = row ? this.document.items.get(row.dataset.itemId) : null;
        if (!item) return;
        const next = Number(input.value);
        if (!Number.isFinite(next)) {
          input.value = String(item.system?.value ?? 0);
          return;
        }
        const delta = next - Number(item.system?.value ?? 0);
        if (delta === 0) return;
        const adjustments = foundry.utils.duplicate(item.system?.adjustments ?? {});
        adjustments.experience = Number(adjustments.experience ?? 0) + delta;
        await item.update({ "system.adjustments": adjustments });
      });
    }
  }

  /** 移动方式内联编辑（主 MOV 用 attribs，额外移动整体写回数组）。 */
  #installMovementEditing() {
    const root = this.element;
    if (!root || root.dataset.movBound) return;
    root.dataset.movBound = "1";
    root.addEventListener("change", async (event) => {
      const input = event.target.closest?.("[data-mov-field]");
      if (!input) return;
      event.stopPropagation();
      const field = input.dataset.movField;
      const isPrimary = input.dataset.movPrimary === "1";
      if (isPrimary) {
        const value = field === "value" ? Number(input.value) : input.value;
        if (field === "value" && !Number.isFinite(value)) return;
        await this.document.update({ [`system.attribs.mov.${field}`]: value });
        return;
      }
      const index = Number(input.dataset.movIndex);
      const rows = foundry.utils.duplicate(this.document.system?.special?.movement ?? []);
      if (!Number.isInteger(index) || !rows[index]) return;
      rows[index][field] = field === "value" ? Number(input.value) : input.value;
      await this.document.update({ "system.special.movement": rows });
    });
  }

  /** 空数值输入不提交（避免 SAN/幸运等 nullable NumberField 收到空字符串）。 */
  #installNumericInputGuard() {
    for (const input of this.element?.querySelectorAll('input[type="number"][name]') ?? []) {
      if (input.dataset.numGuard) continue;
      input.dataset.numGuard = "1";
      const name = input.getAttribute("name");
      const sync = () => {
        if (input.value.trim() === "") input.removeAttribute("name");
        else input.setAttribute("name", name);
      };
      input.addEventListener("input", sync);
      sync();
    }
  }

  /* -------------------------------------------- */
  /* Actions                                       */
  /* -------------------------------------------- */

  static async _onToggleFormulaMode(event) {
    event.preventDefault();
    const next = !this.document.system?.flags?.displayFormula;
    await this.document.update({ "system.flags.displayFormula": next });
  }

  static async _onRollCharacteristics(event) {
    event.preventDefault();
    if (typeof this.document.rollCharacteristicsValue !== "function") {
      return ui.notifications.warn(game.i18n.localize("C7TIDY.Warn.CoC7ApiMissing"));
    }
    this.element?.dispatchEvent(new Event("change"));
    await this.document.rollCharacteristicsValue();
  }

  static async _onAverageCharacteristics(event) {
    event.preventDefault();
    if (typeof this.document.averageCharacteristicsValue !== "function") {
      return ui.notifications.warn(game.i18n.localize("C7TIDY.Warn.CoC7ApiMissing"));
    }
    this.element?.dispatchEvent(new Event("change"));
    await this.document.averageCharacteristicsValue();
  }

  static async _onRollAttacksPerRound(event) {
    event.preventDefault();
    const formula = String(this.document.system?.special?.attacksPerRound ?? "").trim();
    if (!formula) return;
    try {
      const roll = await new Roll(formula, this.document.parsedValues()).evaluate();
      await roll.toMessage({
        flavor: game.i18n.localize("CoC7.AttacksPerRound"),
        speaker: ChatMessage.getSpeaker({ actor: this.document }),
      });
    } catch (err) {
      console.error(`${MODULE_ID} | 每轮攻击公式无效：${formula}`, err);
      ui.notifications.error(game.i18n.format("C7TIDY.Weapon.DamageError", { formula }));
    }
  }

  /** 生成系统原生 SAN 损失链接卡（私有 CoC7SanCheckCard 不可调用）。 */
  static async _onSanLossLink(event) {
    event.preventDefault();
    const actor = this.document;
    const special = prepareNpcSpecial(actor);
    const data = {
      check: "sanloss",
      sanMax: special.sanFailed,
      sanMin: special.sanPassed,
      sanReason: special.sanReason,
    };
    try {
      const LinkClass = CONFIG.CoC7Link?.documentClass;
      if (LinkClass?.fromDropData) {
        const link = await LinkClass.fromDropData(data);
        await link.toChatMessage();
        return;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | 生成 SAN 损失链接卡失败，回退为提示消息`, err);
    }
    const content = game.i18n.format("C7TIDY.Npc.SanReminder", {
      name: actor.name,
      passed: special.sanPassed || "0",
      failed: special.sanFailed || "0",
    });
    const whisper = ChatMessage.getWhisperRecipients?.("GM") ?? [];
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${content}</p>`,
      whisper,
    });
  }

  static async _onToggleAuto(event, target) {
    event.preventDefault();
    const key = target.dataset.key;
    if (!key) return;
    const current = Boolean(this.document.system?.attribs?.[key]?.auto);
    await this.document.update({ [`system.attribs.${key}.auto`]: !current });
  }

  static async _onToggleArmorNotes(event) {
    event.preventDefault();
    const current = Boolean(this.document.system?.attribs?.armor?.notes);
    await this.document.update({ "system.attribs.armor.notes": !current });
  }

  static async _onAddMovement(event) {
    event.preventDefault();
    if (!this.isEditing) return;
    const rows = foundry.utils.duplicate(this.document.system?.special?.movement ?? []);
    rows.push({ value: 0, type: "walk" });
    await this.document.update({ "system.special.movement": rows });
  }

  static async _onRemoveMovement(event, target) {
    event.preventDefault();
    if (!this.isEditing) return;
    const index = Number(target.dataset.index);
    const rows = foundry.utils.duplicate(this.document.system?.special?.movement ?? []);
    if (!Number.isInteger(index) || !rows[index]) return;
    rows.splice(index, 1);
    await this.document.update({ "system.special.movement": rows });
  }

  static async _onExecuteMacro(event, target) {
    event.preventDefault();
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    try {
      const macro = await fromUuid(uuid);
      if (!macro) return ui.notifications.warn(game.i18n.localize("C7TIDY.Npc.MacroMissing"));
      await macro.execute({
        speaker: ChatMessage.getSpeaker({ actor: this.document, token: this.token }),
        actor: this.document,
        token: this.token,
        event,
      });
    } catch (err) {
      console.error(`${MODULE_ID} | 执行宏失败`, err);
    }
  }

  /** 新增「特殊能力」（talent）并直接打开其配置卡。 */
  static async _onCreateTalent(event) {
    event.preventDefault();
    if (!this.isEditing) return;
    const [item] = await this.document.createEmbeddedDocuments("Item", [
      {
        name: game.i18n.localize("C7TIDY.Npc.NewTalentName"),
        type: "talent",
        system: { description: { value: "" } },
      },
    ]);
    item?.sheet?.render(true);
  }

  static async _onRemoveMacro(event, target) {
    event.preventDefault();
    if (!this.isEditing) return;
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const rows = foundry.utils.duplicate(this.document.system?.special?.macros ?? []);
    const next = rows.filter((row) => String(row?.uuid ?? "") !== uuid);
    await this.document.update({ "system.special.macros": next });
  }
}
