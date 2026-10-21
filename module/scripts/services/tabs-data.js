import { MODULE_ID, SKILL_CATEGORIES, BACKGROUND_SLOTS } from "../constants.js";

/** CoC-ID → 类别 id */
const COCID_TO_CATEGORY = new Map();
for (const category of SKILL_CATEGORIES) {
  for (const cocid of category.cocids) COCID_TO_CATEGORY.set(cocid, category.id);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value, fallback = "0") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

/** 技能 item → 视图数据 */
export function buildSkillRow(item) {
  const system = item.system ?? {};
  const adjustments = system.adjustments ?? {};
  const cocid = item.flags?.CoC7?.cocidFlag?.id?.replace(/^i\.skill\./, "") ?? "";
  const value = num(system.value);
  const base = num(adjustments.base);
  const extra =
    num(adjustments.personal) +
    num(adjustments.occupation) +
    num(adjustments.archetype) +
    num(adjustments.experiencePackage) +
    num(adjustments.experience);
  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img,
    sort: Number(item.sort ?? 0),
    cocid,
    category: COCID_TO_CATEGORY.get(cocid) ?? "other",
    value,
    base,
    occupation: num(adjustments.occupation),
    personal: num(adjustments.personal),
    experience: num(adjustments.experience),
    half: Math.floor(value / 2),
    fifth: Math.floor(value / 5),
    invested: extra !== 0,
    development: Boolean(system.flags?.developement),
    special: Boolean(system.properties?.special),
    specialization: String(system.specialization ?? ""),
    skillName: String(system.skillName ?? ""),
  };
}

function sortSkills(rows, mode, lang) {
  const collator = new Intl.Collator(lang, { sensitivity: "base" });
  if (mode === "name") return rows.sort((a, b) => collator.compare(a.name, b.name));
  if (mode === "custom") return rows.sort((a, b) => a.sort - b.sort);
  return rows.sort((a, b) => b.value - a.value || collator.compare(a.name, b.name));
}

/** 技能页：扁平列表 + 专长分组 */
export function prepareSkillView(actor, { sort = "value" } = {}) {
  const lang = game.i18n?.lang ?? "en";
  const rows = actor.items.filter((item) => item.type === "skill").map(buildSkillRow);
  const plain = sortSkills(rows.filter((row) => !row.special), sort, lang);
  const specials = rows.filter((row) => row.special);

  const groups = new Map();
  for (const row of specials) {
    const key = row.specialization || row.skillName || game.i18n.localize("C7TIDY.Skills.Specialization");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const groupList = [...groups.entries()]
    .sort((a, b) => new Intl.Collator(lang).compare(a[0], b[0]))
    .map(([name, skills]) => ({ name, skills: sortSkills(skills, sort, lang) }));

  return {
    rows: plain,
    groups: groupList,
    total: rows.length,
    invested: rows.filter((row) => row.invested).length,
    marked: rows.filter((row) => row.development).length,
  };
}

/** 简表：六类「已投入技能」（战斗类显示全部） */
export function prepareSummary(actor) {
  const rows = actor.items.filter((item) => item.type === "skill").map(buildSkillRow);
  const categories = SKILL_CATEGORIES.map((category) => {
    const skills = rows
      .filter((row) => row.category === category.id)
      .filter((row) => category.id === "combat" || row.invested)
      .sort((a, b) => b.value - a.value);
    return { id: category.id, label: category.label, skills, count: skills.length };
  });
  const other = rows.filter((row) => row.category === "other" && row.invested).sort((a, b) => b.value - a.value);
  if (other.length) {
    categories.push({ id: "other", label: "C7TIDY.Category.Other", skills: other, count: other.length });
  }
  return categories;
}

/** 简表：武器速查 */
export function prepareWeapons(actor) {
  return actor.items
    .filter((item) => item.type === "weapon")
    .map((item) => {
      const system = item.system ?? {};
      const range = system.range?.normal ?? {};
      const skillName = String(system.skill?.main?.name ?? "");
      const skill = skillName ? actor.getSkillByName?.(skillName) : null;
      return {
        id: item.id,
        name: item.name,
        img: item.img,
        skillName,
        skillValue: num(skill?.system?.value),
        damage: text(range.damage, "—"),
        range: text(range.value, "—"),
        rate: text(system.usesPerRound?.normal, "—"),
        bullets: text(system.bullets, "—"),
        ammo: text(system.ammo, "—"),
        malfunction: text(system.malfunction, "—"),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang ?? "en"));
}

const POSSESSION_TYPES = ["weapon", "armor", "book", "spell", "talent", "item", "status"];

/** 物品页：货币 + 分节物品 */
export function preparePossessions(actor) {
  const money = actor.system?.monetary ?? {};
  const creditSkill =
    (typeof actor.getFirstItemByCoCID === "function" ? actor.getFirstItemByCoCID("i.skill.credit-rating") : null) ??
    (typeof actor.creditRatingSkill === "object" ? actor.creditRatingSkill : null);
  const creditValue = creditSkill?.system?.value;
  const formatMoney = (key) => {
    try {
      return actor.system?.formattedMonetaryValue?.(key) ?? text(money?.[key], "—");
    } catch {
      return text(money?.[key], "—");
    }
  };
  const groups = POSSESSION_TYPES.map((type) => {
    const items = actor.items
      .filter((item) => item.type === type)
      .map((item) => ({
        id: item.id,
        name: item.name,
        img: item.img,
        type: item.type,
        isStackable: type === "item",
        quantity: num(item.system?.quantity ?? 1),
        sort: Number(item.sort ?? 0),
        note: [
          type === "item" && num(item.system?.quantity) !== 1 ? `×${num(item.system?.quantity)}` : "",
          type === "armor" ? game.i18n.localize("CoC7.Armor") : "",
          type === "book" ? text(item.system?.mythosRating, "") : "",
        ]
          .filter(Boolean)
          .join(" · "),
      }))
      .sort((a, b) => a.sort - b.sort);
    return { type, label: `TYPES.Item.${type}`, items, count: items.length };
  }).filter((group) => group.count > 0);

  return {
    money: {
      credit: creditValue != null ? num(creditValue) : text(money?.credit, "—"),
      cash: formatMoney("cash"),
      assets: formatMoney("assets"),
      spending: formatMoney("spendingLevel"),
    },
    groups,
  };
}

/** 背景：七要素 + 关键链接 + 背景故事/遭遇 */
export function prepareBackground(actor) {
  const system = actor.system ?? {};
  const biography = Array.isArray(system.biography) ? system.biography : [];
  const normalize = (value) => String(value ?? "").trim().toLowerCase();

  const flags = actor.flags?.[MODULE_ID] ?? {};
  const keyConnections = Array.isArray(flags.keyConnections) ? flags.keyConnections : [];
  const wideSlots = new Set(["appearance", "traits", "scars"]);

  const slots = BACKGROUND_SLOTS.map((slot) => {
    const titles = slot.aliases.map(normalize);
    const index = biography.findIndex((entry) => titles.includes(normalize(entry?.title)));
    return {
      id: slot.id,
      label: slot.label,
      wide: wideSlots.has(slot.id),
      isKey: keyConnections.includes(slot.id),
      index,
      exists: index >= 0,
      value: index >= 0 ? String(biography[index]?.value ?? "") : "",
    };
  });

  const keyLabels = slots
    .filter((slot) => slot.isKey)
    .map((slot) => game.i18n.localize(slot.label))
    .join("、");

  return {
    slots,
    keyConnections,
    keyLabels,
    backstory: String(system.backstory ?? ""),
    notes: String(system.notes ?? ""),
    encounters: Array.isArray(system.sanityLossEvents) ? system.sanityLossEvents : [],
  };
}

/** 成长页 */
export function prepareGrowth(actor) {
  const development = actor.system?.development ?? {};
  const spentOf = (key) => {
    try {
      return num(actor[`${key}PointsSpent`]);
    } catch {
      return 0;
    }
  };
  const skills = actor.items
    .filter((item) => item.type === "skill")
    .map(buildSkillRow);

  // 成长历史：逐次检定记录，按「模组名」分组
  const flags = actor.flags?.[MODULE_ID] ?? {};
  const rawHistory = Array.isArray(flags.growthHistory) ? flags.growthHistory : [];
  const labels = (Array.isArray(flags.growthLabels) ? flags.growthLabels : []).map(String);
  const defaultLabel = game.i18n.localize("C7TIDY.Growth.DefaultModule");
  const activeLabel = labels[labels.length - 1] ?? defaultLabel;
  const lang = game.i18n?.lang ?? "en";
  const locale = lang === "cn" ? "zh-CN" : lang === "zh-tw" ? "zh-TW" : lang;
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

  // 兼容 0.5.x 的批量记录（entries 数组）
  const flat = [];
  for (const record of rawHistory) {
    if (Array.isArray(record.entries)) {
      record.entries.forEach((entry, index) => {
        flat.push({
          id: `${record.id}::${index}`,
          legacyId: record.id,
          entryIndex: index,
          label: String(record.label || defaultLabel),
          createdAt: Number(record.createdAt ?? 0),
          skillId: entry.id,
          name: entry.name,
          before: num(entry.before),
          after: num(entry.after),
          adjustmentsBefore: entry.adjustmentsBefore,
        });
      });
    } else if (record.skillId) {
      flat.push({ ...record, label: String(record.label || defaultLabel), createdAt: Number(record.createdAt ?? 0) });
    }
  }

  const groups = new Map();
  for (const record of flat.sort((a, b) => b.createdAt - a.createdAt)) {
    const label = record.label;
    if (!groups.has(label)) groups.set(label, []);
    const item = actor.items.get(record.skillId);
    groups.get(label).push({
      id: record.id,
      legacyId: record.legacyId ?? null,
      entryIndex: record.entryIndex ?? null,
      img: item?.img ?? "",
      name: record.name,
      before: num(record.before),
      after: num(record.after),
      gain: num(record.after) - num(record.before),
      date: record.createdAt ? formatter.format(new Date(record.createdAt)) : "",
    });
  }

  return {
    pools: [
      { key: "personal", label: "CoC7.SkillPersonal", total: num(development.personal), spent: spentOf("personal") },
      { key: "occupation", label: "CoC7.SkillOccupation", total: num(development.occupation), spent: spentOf("occupation") },
      { key: "archetype", label: "CoC7.SkillArchetype", total: num(development.archetype), spent: spentOf("archetype") },
      {
        key: "experiencePackage",
        label: "CoC7.SkillExperiencePackage",
        total: num(development.experiencePackage),
        spent: spentOf("experiencePackage"),
      },
    ],
    marked: skills.filter((skill) => skill.development).sort((a, b) => b.value - a.value),
    historyGroups: [...groups.entries()].map(([label, records]) => ({ label, records })),
    labels,
    activeLabel,
  };
}

/** 笔记页（GM） */
export function prepareNotes(actor) {
  const system = actor.system ?? {};
  return {
    keeper: String(system.description?.keeper ?? ""),
    books: (Array.isArray(system.books) ? system.books : []).map((book, index) => ({
      index,
      name: book.name,
      progress: num(book.progress),
      necessary: num(book.necessary),
    })),
    sanEvents: (Array.isArray(system.sanityLossEvents) ? system.sanityLossEvents : []).map((event) => ({
      type: String(event.type ?? ""),
      totalLoss: num(event.totalLoss),
      immunity: Boolean(event.immunity),
    })),
    mythosHardened: Boolean(system.flags?.mythosHardened),
    mythosExperienced: Boolean(system.flags?.mythosInsanityExperienced),
  };
}

/** 效果页 */
export function prepareEffects(actor) {
  return (actor.effects?.contents ?? []).map((effect) => ({
    id: effect.id,
    name: effect.name,
    img: effect.img,
    disabled: Boolean(effect.disabled),
  }));
}

/** 收藏侧栏（技能/武器） */
export function prepareFavorites(actor) {
  const raw = actor.flags?.[MODULE_ID]?.favorites;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const item = actor.items.get(entry.id);
      if (!item) return null;
      if (item.type === "skill") {
        const row = buildSkillRow(item);
        return { id: item.id, name: row.name, img: item.img, value: row.value, kind: "skill", action: "rollSkill" };
      }
      if (item.type === "weapon") {
        return { id: item.id, name: item.name, img: item.img, value: null, kind: "weapon", action: "weaponAttack" };
      }
      return { id: item.id, name: item.name, img: item.img, value: null, kind: item.type, action: "openItem" };
    })
    .filter(Boolean);
}
