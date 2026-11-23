/**
 * Foundry 13/14 + CoC7 7.24/8.16 兼容层。
 *
 * 设计原则：
 * - 优先做能力探测（某个 getter / 方法在不在），而不是写死版本号；
 * - 只在“数据字段位置不同”处保留最少量的版本分支；
 * - 所有函数都允许传入普通对象，方便无 Foundry 的单元测试。
 */

/** 把值转成有限数字；null / undefined / "" / 非法值返回 null。 */
function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 安全读取可能抛错的 getter（例如 Item#value / Item#base）。 */
function readNumber(source, key) {
  try {
    return finiteNumber(source?.[key]);
  } catch {
    return null;
  }
}

/** 当前 CoC7 系统主版本号；无法判断时返回 0。 */
export function systemMajorVersion() {
  const version = globalThis.game?.system?.version ?? "";
  return Number(String(version).split(".")[0]) || 0;
}

/** 当前 Foundry 主版本号；无法判断时返回 0。 */
export function coreMajorVersion() {
  const generation = globalThis.game?.release?.generation;
  if (generation) return Number(generation) || 0;
  const version = globalThis.game?.version ?? "";
  return Number(String(version).split(".")[0]) || 0;
}

/**
 * CoC7 8.16 起技能值由 system 数据模型 getter 计算（valueUnmodified 一定存在）；
 * 7.24 的 valueUnmodified 在 Item 文档上（rawValue），system 上没有。
 */
function hasSystemSkillValue(item) {
  try {
    return item?.system?.valueUnmodified !== undefined;
  } catch {
    return false;
  }
}

/** 技能 adjustments 各项之和（最后兜底用，不处理 pulp 规则的分支）。 */
export function skillAdjustmentSum(item) {
  const adjustments = item?.system?.adjustments ?? {};
  return (
    (finiteNumber(adjustments.base) ?? 0) +
    (finiteNumber(adjustments.personal) ?? 0) +
    (finiteNumber(adjustments.occupation) ?? 0) +
    (finiteNumber(adjustments.archetype) ?? 0) +
    (finiteNumber(adjustments.experiencePackage) ?? 0) +
    (finiteNumber(adjustments.experience) ?? 0)
  );
}

/**
 * 技能当前值（兼容 7.24 / 8.16）。
 *
 * - 8.16：system.value 是 getter，直接可用；
 * - 7.24 角色：system.value 为 null（历史数据也可能保留旧值），真实值在 Item#value / rawValue；
 * - 7.24 NPC/生物：system.value 是存储字段；
 * - -1 是 7.24 角色技能创建时的哨兵值，不能当真实值。
 */
export function skillValue(item) {
  if (!item) return 0;
  const system = item.system ?? {};
  const actor = item.actor ?? item.parent ?? null;
  const actorType = actor?.type ?? "";
  const sysValue = finiteNumber(system.value);

  if (hasSystemSkillValue(item)) return sysValue ?? 0;

  // 7.24：非角色直接用存储值；角色只在旧数据里保留正数时才用它
  if (sysValue !== null && (actorType !== "character" || sysValue > 0)) return sysValue;

  const docValue = readNumber(item, "value");
  if (docValue !== null) return docValue;

  const rawValue = readNumber(item, "rawValue");
  if (rawValue !== null) return rawValue;

  return skillAdjustmentSum(item);
}

/** 技能基础值（7.24 / 8.16 都存在 adjustments.base）。 */
export function skillBase(item) {
  const adjustments = item?.system?.adjustments ?? {};
  const value = finiteNumber(adjustments.base);
  if (value !== null) return value;
  const systemBase = finiteNumber(item?.system?.base);
  if (systemBase !== null) return systemBase;
  return readNumber(item, "base") ?? 0;
}

/** 未被 ActiveEffect 修正的技能值（用于成长/回退显示）。 */
export function skillValueUnmodified(item) {
  const systemValue = finiteNumber(item?.system?.valueUnmodified);
  if (systemValue !== null) return systemValue;
  const rawValue = readNumber(item, "rawValue");
  if (rawValue !== null) return rawValue;
  return skillValue(item);
}

/**
 * 7.24 角色旧数据迁移：把遗留的 system.value 转成 adjustments.experience 差量。
 *
 * 系统自己的 v3 卡在 getData 里做同一件事；如果用户直接打开 Tidy 卡，
 * 不迁移会导致“显示的是旧值、编辑却写进 adjustments”的割裂。
 * 只对 7.24 角色生效（8.16 的 system.value 是 getter，NPC 的 system.value 是真实字段）。
 *
 * @returns {Promise<boolean>} 是否发生了迁移
 */
export async function migrateLegacySkillValue(item) {
  const system = item?.system;
  const actor = item?.actor ?? item?.parent ?? null;
  if (!system || !actor || actor.type !== "character") return false;
  if (system.valueUnmodified !== undefined) return false;

  const legacy = finiteNumber(system.value);
  if (legacy === null || legacy <= 0) return false;

  const adjustments = { ...(system.adjustments ?? {}) };
  const current = readNumber(item, "rawValue") ?? readNumber(item, "value") ?? skillAdjustmentSum(item);
  const delta = legacy - current;
  if (!delta) return false;

  adjustments.experience = (finiteNumber(adjustments.experience) ?? 0) + delta;
  await item.update({ "system.adjustments": adjustments, "system.value": null });
  return true;
}

/** 按 id / name 找技能（7.24 没有 getSkillByName，只有 getSkillsByName）。 */export function findSkillByName(actor, name) {
  if (!actor || !name) return null;
  if (typeof actor.getSkillByName === "function") {
    const skill = actor.getSkillByName(name);
    if (skill) return skill;
  }
  if (typeof actor.getSkillsByName === "function") {
    const list = actor.getSkillsByName(name);
    if (Array.isArray(list) && list.length) return list[0];
  }
  const needle = String(name).toLowerCase();
  const byName = actor.items?.find?.(
    (item) => item.type === "skill" && String(item.name ?? "").toLowerCase() === needle,
  );
  if (byName) return byName;
  // 7.24 武器上的 skill.main.name 有时存的是 CoCID
  return (
    actor.items?.find?.(
      (item) =>
        item.type === "skill" &&
        String(item.flags?.CoC7?.cocidFlag?.id ?? "").toLowerCase() === needle,
    ) ?? null
  );
}

/**
 * 武器关联技能。
 * 8.16 有 system.skillMain / skillAlternative getter；
 * 7.24 只有 system.skill.main.{id,name}，需要自己解析。
 */
export function weaponSkill(actor, weapon, { alternative = false } = {}) {
  const system = weapon?.system ?? weapon ?? {};
  const refKey = alternative ? "alternativ" : "main";
  const ref = system.skill?.[refKey] ?? {};

  let skill = ref.id && actor?.items ? actor.items.get(ref.id) : null;

  if (!skill) {
    try {
      skill = (alternative ? system.skillAlternative : system.skillMain) ?? null;
    } catch {
      skill = null;
    }
  }
  if (!skill && ref.name) skill = findSkillByName(actor, ref.name);
  return skill ?? null;
}

/** 兼容 7.24 的 parsedValues：7.24 叫 parseCharacteristics。 */
export function actorParsedValues(actor) {
  if (typeof actor?.parsedValues === "function") return actor.parsedValues();
  const parsed = typeof actor?.parseCharacteristics === "function" ? actor.parseCharacteristics() : {};
  // 7.24 的 parseCharacteristics 只有八项特性；补上 attribs，供 @hp / @lck 之类公式使用
  for (const [key, value] of Object.entries(actor?.system?.attribs ?? {})) {
    const current = finiteNumber(value?.value);
    if (current === null) continue;
    parsed[key] = current;
    parsed[key.toUpperCase()] = current;
    const max = finiteNumber(value?.max);
    if (max !== null) parsed[`${key}Max`] = max;
  }
  return parsed;
}

/**
 * 成长检定。
 * 8.16 的 developSkills 只接受 uuid；7.24 的 developSkill 只接受 item id。
 */
export async function developSkill(actor, item, fastForward = false) {
  if (!actor || !item || typeof actor.developSkill !== "function") return;
  if (typeof actor.developSkills === "function") {
    return actor.developSkill(item.uuid, fastForward);
  }
  return actor.developSkill(item.id, fastForward);
}

/** 读取“系统 flag”（8.16 system.flags.*）或“Actor flag”（7.24 flags.CoC7.*）。 */
export function actorFlagValue(actor, flag) {
  const flags = actor?.system?.flags;
  if (flags && typeof flags[flag] !== "undefined") return Boolean(flags[flag]);
  if (typeof actor?.getFlag === "function") return Boolean(actor.getFlag("CoC7", flag));
  return false;
}

/** 切换上面那种跨版本位置不同的 flag。 */
export async function toggleActorFlag(actor, flag) {
  if (!actor) return;
  const next = !actorFlagValue(actor, flag);
  const flags = actor.system?.flags;
  const isSystemFlag = Boolean(flags) && typeof flags[flag] !== "undefined";
  if (isSystemFlag) {
    await actor.update({ [`system.flags.${flag}`]: next });
    return;
  }
  if (typeof actor.setFlag === "function") {
    await actor.setFlag("CoC7", flag, next);
    return;
  }
  await actor.update({ [`system.flags.${flag}`]: next });
}

/** 武器弹容量：7.24 可能是字符串 / 公式，用 parseInt 兜底。 */
export function weaponCapacity(weapon) {
  return parseInt(weapon?.system?.bullets, 10) || 0;
}

/** 当前已装填子弹数。 */
export function weaponAmmo(weapon) {
  return parseInt(weapon?.system?.ammo, 10) || 0;
}

/** 装填：8.16 在 system 上，7.24 在 Item 文档上。 */
export async function reloadWeapon(weapon, oneShot = false) {
  const system = weapon?.system ?? {};
  if (oneShot) {
    if (typeof system.addAmmunition === "function") return system.addAmmunition();
    if (typeof weapon.addBullet === "function") return weapon.addBullet();
    return weapon.update({
      "system.ammo": Math.min(weaponAmmo(weapon) + 1, weaponCapacity(weapon)),
    });
  }
  if (typeof system.reload === "function") return system.reload();
  if (typeof weapon.reload === "function") return weapon.reload();
  return weapon.update({ "system.ammo": weaponCapacity(weapon) });
}

/** 卸弹：8.16 在 system 上，7.24 在 Item 文档上。 */
export async function unloadWeapon(weapon, oneShot = false) {
  const system = weapon?.system ?? {};
  if (oneShot) {
    if (typeof system.shootAmmunition === "function") return system.shootAmmunition(1);
    if (typeof weapon.shootBullets === "function") return weapon.shootBullets(1);
    return weapon.update({ "system.ammo": Math.max(0, weaponAmmo(weapon) - 1) });
  }
  if (typeof system.setBullets === "function") return system.setBullets(0);
  if (typeof weapon.setBullets === "function") return weapon.setBullets(0);
  return weapon.update({ "system.ammo": 0 });
}
