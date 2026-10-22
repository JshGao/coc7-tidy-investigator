/**
 * 纯函数 view-model 层：把 CoC7 的 actor 数据整理成模板直接可用的结构。
 * 这里不持有文档对象，也不做任何写入。
 */

const CHARACTERISTICS = [
  ["str", "STR", "CHARAC.STR"],
  ["con", "CON", "CHARAC.CON"],
  ["siz", "SIZ", "CHARAC.SIZ"],
  ["dex", "DEX", "CHARAC.DEX"],
  ["app", "APP", "CHARAC.APP"],
  ["int", "INT", "CHARAC.INT"],
  ["pow", "POW", "CHARAC.POW"],
  ["edu", "EDU", "CHARAC.EDU"],
];

const CONDITIONS = [
  ["criticalWounds", "C7TIDY.Condition.CriticalWounds", "is-wound"],
  ["unconscious", "C7TIDY.Condition.Unconscious", ""],
  ["dying", "C7TIDY.Condition.Dying", ""],
  ["dead", "C7TIDY.Condition.Dead", ""],
  ["prone", "C7TIDY.Condition.Prone", ""],
  ["tempoInsane", "C7TIDY.Condition.TempoInsane", "is-mad"],
  ["indefInsane", "C7TIDY.Condition.IndefInsane", "is-mad"],
];

/** @param {*} value @returns {number} */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 字符串型数值兜底：null / undefined / "" 一律显示为 "0"。 */
function text(value) {
  if (value === null || value === undefined || value === "") return "0";
  return String(value);
}

/** @param {number} value */
function half(value) {
  return Math.floor(value / 2);
}

/** @param {number} value */
function fifth(value) {
  return Math.floor(value / 5);
}

/**
 * 身份信息。
 * @param {Actor} actor
 * @param {object} system
 */
export function prepareIdentity(actor, system) {
  const infos = system?.infos ?? {};
  return {
    name: actor.name,
    img: actor.img,
    occupation: infos.occupation || "",
    age: infos.age || "",
    sex: infos.sex || "",
    residence: infos.residence || "",
    birthplace: infos.birthplace || "",
    organization: infos.organization || "",
    archetype: infos.archetype || "",
    playername: infos.playername || "",
  };
}

/** 读取 actor.overrides 的扁平键（用于标记被 ActiveEffect 修正的字段）。 */
function flattenOverrides(actor) {
  try {
    return foundry.utils.flattenObject(actor?.overrides ?? {});
  } catch {
    return {};
  }
}

/**
 * 八项特性。
 * @param {object} system
 * @param {Actor} [actor] 传入时用于判断 AE 修正与空值
 */
export function prepareCharacteristics(system, actor = null) {
  const characteristics = system?.characteristics ?? {};
  const overrides = flattenOverrides(actor);
  return CHARACTERISTICS.map(([key, abbr, label]) => {
    const raw = characteristics[key] ?? {};
    const empty = raw.value === null || raw.value === undefined;
    const value = num(raw.value);
    return {
      key,
      abbr,
      label,
      value,
      formula: String(raw.formula ?? ""),
      empty,
      inputValue: empty ? "" : value,
      half: half(value),
      fifth: fifth(value),
      modified: Boolean(overrides[`system.characteristics.${key}.value`]),
    };
  });
}

/**
 * 四项资源（HP / MP / SAN / 幸运）。
 * @param {object} system
 */
export function prepareResources(system) {
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
    san: attribs.san?.value == null && attribs.san?.max == null,
    lck: attribs.lck?.value == null,
  };
  for (const row of rows) {
    row.empty = Boolean(emptyOf[row.key]);
    row.pct = row.max > 0 ? Math.max(0, Math.min(100, Math.round((row.value / row.max) * 100))) : 0;
    row.low = row.max > 0 && row.pct <= 25;
  }
  return rows;
}

/**
 * 派生值。
 * @param {object} system
 */
/** 资源卡顺序（按 flag 中的 key 顺序排列，未知项保持在后） */
export function orderResources(rows, order) {
  if (!Array.isArray(order) || !order.length) return rows;
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...rows].sort((a, b) => {
    const ra = rank.has(a.key) ? rank.get(a.key) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.key) ? rank.get(b.key) : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

export function prepareDerived(system) {
  const attribs = system?.attribs ?? {};
  return [
    { key: "db", label: "CoC7.DB", value: text(attribs.db?.value), editable: true, auto: Boolean(attribs.db?.auto) },
    { key: "build", label: "CoC7.Build", value: text(attribs.build?.value), editable: true, auto: Boolean(attribs.build?.auto) },
    { key: "mov", label: "CoC7.Mov", value: text(attribs.mov?.value), editable: true, auto: Boolean(attribs.mov?.auto) },
    { key: "armor", label: "CoC7.Armor", value: text(attribs.armor?.value), editable: true, auto: false },
  ];
}

/** 生物卡派生块：MOV 只在战斗页编辑，这里保持只读展示。 */
export function prepareNpcDerived(system) {
  return prepareDerived(system).map((row) => ({
    ...row,
    ...(row.key === "mov" ? { editable: false } : {}),
    autoCapable: ["db", "build", "mov"].includes(row.key),
  }));
}

/**
 * 七种状态。
 * @param {object} system
 */
export function prepareConditions(system) {
  const conditions = system?.conditions ?? {};
  return CONDITIONS.map(([key, label, cls]) => ({
    key,
    label,
    cls,
    active: Boolean(conditions[key]?.value),
  }));
}

/**
 * 每日 SAN 损失。
 * @param {object} system
 */
export function prepareDailySan(system) {
  const san = system?.attribs?.san ?? {};
  return {
    loss: num(san.dailyLoss),
    limit: num(san.dailyLimit),
  };
}

/**
 * 技能列表（M1：完整平铺；分组留待简表实现）。
 * @param {Actor} actor
 */
export function prepareSkills(actor) {
  const items = actor?.items?.filter?.((item) => item.type === "skill") ?? [];
  const rows = items.map((item) => {
    const system = item.system ?? {};
    const adjustments = system.adjustments ?? {};
    const invested =
      num(adjustments.personal) +
        num(adjustments.occupation) +
        num(adjustments.archetype) +
        num(adjustments.experiencePackage) +
        num(adjustments.experience) !==
      0;
    const value = num(system.value);
    return {
      id: item.id,
      name: item.name,
      img: item.img,
      value,
      base: num(adjustments.base),
      half: half(value),
      fifth: fifth(value),
      invested,
      development: Boolean(system.flags?.developement),
      special: Boolean(system.properties?.special),
    };
  });
  const lang = game.i18n?.lang ?? "en";
  return rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, lang));
}
