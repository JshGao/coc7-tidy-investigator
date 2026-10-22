/**
 * 生物 / NPC 卡专用 view-model（纯函数 + 只读异步富文本）。
 * 不持有文档对象，不做写入。
 */

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

/** 身份信息：creature 显示「类型」，npc 显示职业 / 年龄 / 组织。 */
export function prepareNpcIdentity(actor, system) {
  const infos = system?.infos ?? {};
  return {
    name: actor.name,
    img: actor.img,
    isCreature: actor.type === "creature",
    type: String(infos.type ?? ""),
    occupation: String(infos.occupation ?? ""),
    age: String(infos.age ?? ""),
    organization: String(infos.organization ?? ""),
  };
}

/** 资源块：锁定态隐藏空值（SAN / MP / 幸运常为 null）。 */
export function prepareNpcResources(system, hideEmpty = false) {
  const attribs = system?.attribs ?? {};
  const rows = [
    { key: "hp", label: "CoC7.HP", value: num(attribs.hp?.value), max: num(attribs.hp?.max), cls: "is-hp", hasMax: true, auto: Boolean(attribs.hp?.auto) },
    { key: "mp", label: "CoC7.MP", value: num(attribs.mp?.value), max: num(attribs.mp?.max), cls: "is-mp", hasMax: true, auto: Boolean(attribs.mp?.auto) },
    { key: "san", label: "CoC7.SAN", value: num(attribs.san?.value), max: num(attribs.san?.max), cls: "is-san", hasMax: true, auto: Boolean(attribs.san?.auto), rollable: true },
    { key: "lck", label: "CoC7.Lck", value: num(attribs.lck?.value), max: 99, cls: "is-luck", hasMax: false, auto: false, rollable: true },
  ];
  const emptyOf = {
    hp: attribs.hp?.value == null && attribs.hp?.max == null,
    mp: attribs.mp?.value == null && attribs.mp?.max == null,
    // SAN 上限默认 99，不能用 max 判断；系统卡锁定态也以 value === null 隐藏
    san: attribs.san?.value == null,
    lck: attribs.lck?.value == null,
  };
  for (const row of rows) {
    row.empty = Boolean(emptyOf[row.key]);
    row.inputValue = row.empty ? "" : row.value;
    row.autoCapable = ["hp", "mp", "san"].includes(row.key);
    row.pct = row.max > 0 ? Math.max(0, Math.min(100, Math.round((row.value / row.max) * 100))) : 0;
    row.low = row.max > 0 && row.pct <= 25;
  }
  return hideEmpty ? rows.filter((row) => !row.empty) : rows;
}

/** 战斗速览：每轮攻击、SAN 损失、护甲备注、移动方式。 */
export function prepareNpcSpecial(actor) {
  const system = actor.system ?? {};
  const special = system.special ?? {};
  const apr = text(special.attacksPerRound, "1");
  const sanLoss = special.sanLoss ?? {};
  const movement = Array.isArray(special.movement) ? special.movement : [];
  const movementTypes = prepareMovementTypes();
  const typeLabel = (type) => {
    const found = movementTypes.find((entry) => entry.id === type);
    if (!found) return type;
    return game.i18n.has(found.label) ? game.i18n.localize(found.label) : String(found.label ?? type);
  };
  return {
    attacksPerRound: apr,
    attacksRollable: /[d@]/i.test(apr),
    sanPassed: text(sanLoss.checkPassed, ""),
    sanFailed: text(sanLoss.checkFailled, ""),
    sanPassedDisplay: text(sanLoss.checkPassed, "—"),
    sanFailedDisplay: text(sanLoss.checkFailled, "—"),
    hasSanLoss: Boolean(text(sanLoss.checkPassed, "") || text(sanLoss.checkFailled, "")),
    sanReason: text(system.infos?.type, "") || actor.name,
    armorValue: text(system.attribs?.armor?.value, "0"),
    armorNotes: Boolean(system.attribs?.armor?.notes),
    movementRows: movement.map((row, index) => ({
      index,
      value: num(row.value),
      type: String(row.type ?? "walk"),
      typeLabel: typeLabel(String(row.type ?? "walk")),
    })),
    movTypeLabel: typeLabel(String(system.attribs?.mov?.type ?? "walk")),
    movementTypes,
  };
}

/** 移动方式选项（Foundry 核心 CONFIG） */
export function prepareMovementTypes() {
  try {
    const actions = CONFIG.Token?.movement?.actions ?? {};
    return Object.entries(actions)
      .map(([id, value]) => ({ id, label: value?.label ?? id, order: Number(value?.order ?? 0) }))
      .sort((a, b) => a.order - b.order);
  } catch {
    return [{ id: "walk", label: "TOKEN.MOVEMENT.ACTIONS.walk.label", order: 0 }];
  }
}

/** 特殊能力：天赋（talent）名称 + 纯文本简述。 */
export function prepareTalents(actor) {
  return actor.items
    .filter((item) => item.type === "talent")
    .map((item) => {
      const raw = String(item.system?.description?.value ?? "");
      const plain = raw
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        id: item.id,
        name: item.name,
        img: item.img,
        excerpt: plain.length > 160 ? `${plain.slice(0, 160)}…` : plain,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang ?? "en"));
}

/** 骰子宏：解析 uuid → { name, img }，失效项也保留以便删除。 */
export async function prepareMacros(actor) {
  const rows = Array.isArray(actor.system?.special?.macros) ? actor.system.special.macros : [];
  const out = [];
  for (const row of rows) {
    const uuid = String(row?.uuid ?? "");
    if (!uuid) continue;
    try {
      const macro = await fromUuid(uuid);
      out.push({ uuid, name: macro?.name ?? game.i18n.localize("C7TIDY.Npc.MacroMissing"), img: macro?.img ?? "", missing: !macro });
    } catch {
      out.push({ uuid, name: game.i18n.localize("C7TIDY.Npc.MacroMissing"), img: "", missing: true });
    }
  }
  return out;
}

/** 描述与守秘笔记：富文本（锁定态渲染）+ 原文（编辑态 prose-mirror）。 */
export async function prepareNpcText(actor) {
  const personal = String(actor.system?.biography?.personalDescription?.value ?? "");
  const keeper = String(actor.system?.description?.keeper ?? "");
  return {
    personal,
    personalHtml: await enrich(actor, personal),
    keeper,
    keeperHtml: await enrich(actor, keeper),
  };
}

async function enrich(actor, html, secrets = false) {
  const TextEditor = foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  if (!TextEditor?.enrichHTML) return html ?? "";
  try {
    return await TextEditor.enrichHTML(html || "", { async: true, relativeTo: actor, secrets });
  } catch {
    return html ?? "";
  }
}
