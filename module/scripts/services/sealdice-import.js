/**
 * 海豹骰（SealDice）`.st` 指令导入。
 *
 * 支持常见格式：
 *   .st 力量60 敏捷70 侦查80 图书馆使用60
 *   .st 力量+5 侦查-10
 *   .st 射击(手枪)70
 *   .st 力量:60 幸运:50
 *   .st 力量50+10
 *
 * 只导入数值；骰点表达式（如 3d6*5）会跳过并给出警告。
 * 缺失的技能会按 CoC7 技能命名规则创建。
 */
import { findSkillByName, skillValue } from "../compat.js";
import {
  SEALDICE_ATTRIBUTE_ALIASES,
  SEALDICE_CHARACTERISTIC_ALIASES,
  SEALDICE_GROUP_ALIASES,
  SEALDICE_IGNORED_ALIASES,
  SEALDICE_SKILL_ALIASES,
  SEALDICE_SPEC_ALIASES,
} from "../data/sealdice-skill-aliases.js";

const CHARACTERISTICS = {
  str: ["str", "力量", "strength"],
  con: ["con", "体质", "constitution"],
  siz: ["siz", "体型", "size"],
  dex: ["dex", "敏捷", "dexterity"],
  app: ["app", "外貌", "appearance"],
  int: ["int", "智力", "灵感", "intelligence", "idea"],
  pow: ["pow", "意志", "power"],
  edu: ["edu", "教育", "知识", "education", "know"],
};

const ATTRIBUTES = {
  lck: ["lck", "luck", "幸运", "运气"],
  san: ["san", "sanity", "理智", "理智值", "san值"],
  hp: ["hp", "体力", "生命", "生命值"],
  mp: ["mp", "魔法", "魔法值"],
};

const EXTRA_SKILL_ALIASES = {
  拉丁文: "Language (Latin)",
};

const SKILL_GROUP_ALIASES = {
  射击: "Firearms",
  枪械: "Firearms",
  火器: "Firearms",
  格斗: "Fighting",
  战斗: "Fighting",
  艺术与手艺: "Art/Craft",
  技艺: "Art/Craft",
  ...SEALDICE_GROUP_ALIASES,
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function tokenize(line) {
  const tokens = [];
  const re = /"([^"]+)"\s*([^\s"]*)|'([^']+)'\s*([^\s']*)|(\S+)/g;
  let match;
  while ((match = re.exec(line))) {
    if (match[1] !== undefined) tokens.push(`${match[1]}${match[2] ?? ""}`);
    else if (match[3] !== undefined) tokens.push(`${match[3]}${match[4] ?? ""}`);
    else tokens.push(match[5]);
  }
  return tokens;
}

function parseToken(token) {
  let raw = String(token ?? "").trim();
  if (!raw) return null;
  let name = "";
  let expression = "";

  const colon = raw.match(/^(.+?)[=:：]([+-]?\d+(?:\.\d+)?(?:\s*[+-]\s*\d+(?:\.\d+)?)*)$/);
  if (colon) {
    name = colon[1];
    expression = colon[2];
  } else {
    const suffix = raw.match(/^(.*?)([+-]?\d+(?:\.\d+)?(?:\s*[+-]\s*\d+(?:\.\d+)?)*)$/);
    if (!suffix) return null;
    name = suffix[1];
    expression = suffix[2];
  }

  name = name.trim();
  expression = expression.replace(/\s+/g, "");
  if (!name || !expression) return null;

  const mode = /^[+-]/.test(expression) ? "add" : "set";
  const value = expression
    .split(/(?=[+-])/)
    .reduce((sum, part) => sum + Number(part), 0);
  if (!Number.isFinite(value)) return null;
  return { name, value, mode };
}

const CONCAT_NAMES = new Set([
  ...Object.keys(SEALDICE_CHARACTERISTIC_ALIASES),
  ...Object.keys(SEALDICE_ATTRIBUTE_ALIASES),
  ...Object.keys(SEALDICE_IGNORED_ALIASES),
  ...Object.values(CHARACTERISTICS).flat(),
  ...Object.values(ATTRIBUTES).flat(),
  ...Object.keys(SEALDICE_SKILL_ALIASES),
  ...Object.values(SEALDICE_SKILL_ALIASES),
  ...Object.keys(EXTRA_SKILL_ALIASES),
  ...Object.keys(SKILL_GROUP_ALIASES),
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 已知名称连续解析：优先匹配最长名称，支持英文名中的空格。 */
function parseContinuous(line) {
  const names = [...CONCAT_NAMES]
    .filter((name) => String(name).length > 1)
    .sort((a, b) => String(b).length - String(a).length);
  if (!names.length) return null;
  let rest = String(line).trim();
  const entries = [];
  while (rest) {
    rest = rest.replace(/^[,，\s]+/, "");
    if (!rest) break;
    const lower = rest.toLowerCase();
    let name = names.find((candidate) => lower.startsWith(String(candidate).toLowerCase()));
    let afterName;
    if (name) {
      afterName = rest.slice(String(name).length);
    } else {
      // 未知技能名（不在海豹别名表里）也尽量支持：取到第一个数字/运算符之前作为名字
      const generic = rest.match(/^([^\d=:：+\-]+?)(?=[=:：]?[+-]?\d)/);
      if (!generic) return null;
      name = generic[1].trim();
      afterName = rest.slice(generic[1].length);
    }
    const match = afterName.match(/^[=:：]?\s*([+-]?\d+(?:\.\d+)?(?:\s*[+-]\s*\d+(?:\.\d+)?)*)/);
    if (!match) return null;
    const expression = match[1].replace(/\s+/g, "");
    const mode = /^[+-]/.test(expression) ? "add" : "set";
    const value = expression
      .split(/(?=[+-])/)
      .reduce((sum, part) => sum + Number(part), 0);
    if (!Number.isFinite(value)) return null;
    entries.push({ name: String(name).trim(), value, mode });
    rest = afterName.slice(match[0].length);
  }
  return entries.length ? entries : null;
}

/** 海豹允许 `.st 力量60敏捷70` 这种无空格连写；在已知属性/技能名前补空格。 */
function expandConcatenated(line) {
  const names = [...CONCAT_NAMES]
    .filter((name) => String(name).length > 1)
    .sort((a, b) => String(b).length - String(a).length);
  if (!names.length) return line;
  const pattern = new RegExp(`(?<![a-z])(${names.map(escapeRegExp).join("|")})(?=[=:：]?[+-]?\\d|\\()`, "gi");
  return line.replace(pattern, " $1");
}

/**
 * 解析 `.st` 文本。
 * @returns {{entries: {name:string,value:number,mode:"set"|"add"}[], warnings: string[]}}
 */
export function parseSealDiceSt(input) {
  const entries = [];
  const warnings = [];
  for (const rawLine of String(input ?? "").split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^\.?st(?:\s|$)/i.test(line)) line = line.replace(/^\.?st\s*/i, "").trim();
    if (!line) continue;
    if (/^(show|clr|clear|del|help|export)\b/i.test(line)) {
      warnings.push(line);
      continue;
    }
    if (line.startsWith("&")) {
      warnings.push(line);
      continue;
    }
    line = line
      .replace(/＋/g, "+")
      .replace(/－/g, "-")
      .replace(/＝/g, "=")
      .replace(/：/g, ":")
      .replace(/＆/g, "&")
      .replace(/＊/g, "*")
      .replace(/[,，]/g, " ");
    const continuous = parseContinuous(line);
    if (continuous) {
      entries.push(...continuous);
      continue;
    }
    line = expandConcatenated(line);
    for (const token of tokenize(line)) {
      const parsed = parseToken(token);
      if (parsed) entries.push(parsed);
      else warnings.push(token);
    }
  }
  return { entries, warnings };
}

function findCharacteristic(name) {
  const normalized = normalizeName(name);
  if (SEALDICE_CHARACTERISTIC_ALIASES[normalized]) return SEALDICE_CHARACTERISTIC_ALIASES[normalized];
  for (const [key, aliases] of Object.entries(CHARACTERISTICS)) {
    if (aliases.some((alias) => normalizeName(alias) === normalized)) return key;
  }
  return null;
}

function findAttribute(name) {
  const normalized = normalizeName(name);
  if (SEALDICE_ATTRIBUTE_ALIASES[normalized]) return SEALDICE_ATTRIBUTE_ALIASES[normalized];
  for (const [key, aliases] of Object.entries(ATTRIBUTES)) {
    if (aliases.some((alias) => normalizeName(alias) === normalized)) return key;
  }
  return null;
}

function splitSkillName(name) {
  const match = String(name ?? "").trim().match(/^(.+?)\s*[（(](.+?)[）)]\s*$/);
  if (!match) return { specialization: "", skillName: String(name ?? "").trim() };
  return { specialization: match[1].trim(), skillName: match[2].trim() };
}

function findIgnored(name) {
  return SEALDICE_IGNORED_ALIASES[normalizeName(name)] ?? null;
}

function isAsciiName(value) {
  return /^[\x20-\x7E]+$/.test(String(value ?? ""));
}

/**
 * 技能的跨别名规范键。
 * 同一技能的不同海豹骰别名（电脑/计算机/计算机使用）会得到同一个 en: 键，
 * 用于导入去重与“同值忽略、异值报非法”。
 */
function canonicalSkillKey(name) {
  const normalized = normalizeName(name);
  const aliased = SEALDICE_SKILL_ALIASES[normalized] ?? EXTRA_SKILL_ALIASES[normalized];
  if (aliased) return isAsciiName(aliased) ? `en:${normalizeName(aliased)}` : `raw:${normalizeName(aliased)}`;

  const parts = splitSkillName(name);
  const group = SKILL_GROUP_ALIASES[normalizeName(parts.specialization || parts.skillName)];
  const spec = SEALDICE_SPEC_ALIASES[normalizeName(parts.skillName)];
  if (group && spec) return `en:${normalizeName(`${group} (${spec})`)}`;
  if (group) return `en:${normalizeName(`${group} (Any)`)}`;
  if (isAsciiName(name)) return `en:${normalized}`;
  return `raw:${normalized}`;
}

function findSkill(actor, name) {
  const normalized = normalizeName(name);
  const target = canonicalSkillKey(name);
  for (const item of actor?.items ?? []) {
    if (item.type !== "skill") continue;
    const system = item.system ?? {};
    const candidates = [
      item.name,
      system.skillName,
      `${system.skillName}(${system.specialization})`,
      `${system.specialization}(${system.skillName})`,
    ];
    if (candidates.some((candidate) => candidate && normalizeName(candidate) === normalized)) return item;
    if (candidates.some((candidate) => candidate && canonicalSkillKey(candidate) === target)) return item;
  }
  const direct = findSkillByName(actor, name);
  if (direct) return direct;
  return null;
}

let compendiumIndexPromise = null;
async function getCompendiumIndex(pack) {
  if (!compendiumIndexPromise) {
    compendiumIndexPromise = pack.getIndex({ fields: ["system.skillName", "system.specialization", "system.base"] });
  }
  return compendiumIndexPromise;
}

async function findCompendiumSkill(name) {
  const pack = globalThis.game?.packs?.get?.("CoC7.skills");
  if (!pack) return null;
  try {
    const index = await getCompendiumIndex(pack);
    const entries = [...index];
    const target = canonicalSkillKey(name);
    const exact = entries.find((entry) => canonicalSkillKey(entry.name) === target);
    if (exact) return { document: await pack.getDocument(exact._id), generic: false };

    const parts = splitSkillName(name);
    const genericName = parts.specialization || parts.skillName;
    const group = SKILL_GROUP_ALIASES[normalizeName(parts.specialization || genericName)];
    const spec = SEALDICE_SPEC_ALIASES[normalizeName(parts.skillName)];
    let generic = group && spec
      ? entries.find((entry) =>
          normalizeName(entry.system?.specialization) === normalizeName(group) &&
          normalizeName(entry.system?.skillName) === normalizeName(spec),
        )
      : null;
    if (!generic && group) {
      generic = entries.find((entry) =>
        normalizeName(entry.system?.specialization) === normalizeName(group) &&
        /\(any\)$/i.test(entry.name),
      );
    }
    if (!generic) {
      generic = entries.find((entry) =>
        normalizeName(entry.name) === normalizeName(genericName) ||
        normalizeName(entry.system?.skillName) === normalizeName(genericName),
      );
    }
    return generic ? { document: await pack.getDocument(generic._id), generic: true, parts } : null;
  } catch (error) {
    console.warn("coc7-tidy-investigator | 读取 CoC7 技能包失败", error);
    return null;
  }
}

async function prepareSkillSource(name) {
  const parts = splitSkillName(name);
  const found = await findCompendiumSkill(name);
  if (found?.document) {
    try {
      const source = found.document.toObject();
      delete source._id;
      delete source.folder;
      source.name = String(name).trim();
      source.system = source.system ?? {};
      source.system.skillName = parts.skillName;
      source.system.specialization = parts.specialization;
      source.system.properties = {
        ...(source.system.properties ?? {}),
        special: Boolean(parts.specialization),
        requiresname: false,
        picknameonly: false,
      };
      return source;
    } catch (error) {
      console.warn("coc7-tidy-investigator | 从技能包准备技能失败，改用空白技能", name, error);
    }
  }
  return {
    name: String(name).trim(),
    type: "skill",
    system: {
      skillName: parts.skillName,
      specialization: parts.specialization,
      properties: { special: Boolean(parts.specialization) },
      flags: {},
    },
  };
}

async function createSkills(actor, names) {
  if (!names.length) return new Map();
  const sources = await Promise.all(names.map((name) => prepareSkillSource(name)));
  const valid = [];
  for (let index = 0; index < names.length; index++) {
    if (sources[index]) valid.push({ name: names[index], source: sources[index] });
  }
  if (!valid.length) return new Map();

  try {
    const created = await actor.createEmbeddedDocuments("Item", valid.map((entry) => entry.source));
    if (Array.isArray(created) && created.length) {
      // CoC7 的 createEmbeddedDocuments 可能合并/重排，按规范化名称重新定位，不能按返回数组下标对应
      const map = new Map();
      for (const entry of valid) {
        const item = findSkill(actor, entry.name);
        if (item) map.set(entry.name, item);
      }
      if (map.size === valid.length) return map;
    }
  } catch (error) {
    console.warn("coc7-tidy-investigator | 批量创建技能失败，逐个重试", error);
  }

  const result = new Map();
  for (const entry of valid) {
    try {
      const [item] = await actor.createEmbeddedDocuments("Item", [entry.source]);
      if (item) result.set(entry.name, item);
    } catch (error) {
      console.error("coc7-tidy-investigator | 创建技能失败", entry.name, error);
    }
  }
  return result;
}

/**
 * 把 `.st` 文本导入 Actor。
 * @returns {Promise<{characteristics:number, attributes:number, skills:number, created:number, warnings:string[], errors:string[], conflicts?:string[]}>}
 */
export async function importSealDiceSt(actor, text) {
  const parsed = parseSealDiceSt(text);
  const result = {
    characteristics: 0,
    attributes: 0,
    skills: 0,
    created: 0,
    warnings: [...parsed.warnings],
    errors: [],
  };
  if (!actor || !parsed.entries.length) return result;

  const resolved = new Map();
  const conflicts = [];
  result.conflicts = conflicts;

  for (const entry of parsed.entries) {
    const ignored = findIgnored(entry.name);
    if (ignored) {
      result.warnings.push(`${entry.name}（${ignored}，未导入）`);
      continue;
    }

    const characteristic = findCharacteristic(entry.name);
    const attribute = characteristic ? null : findAttribute(entry.name);
    const kind = characteristic ? "characteristic" : attribute ? "attribute" : "skill";
    const key = characteristic ?? attribute ?? `skill:${canonicalSkillKey(entry.name)}`;
    const dedupeKey = `${kind}:${key}`;
    const prior = resolved.get(dedupeKey);
    if (prior) {
      if (prior.mode !== entry.mode || prior.value !== entry.value) {
        conflicts.push(`${prior.label}（${prior.value} / ${entry.value}）`);
      }
      continue;
    }
    resolved.set(dedupeKey, {
      kind,
      key,
      name: entry.name,
      label: entry.name,
      value: entry.value,
      mode: entry.mode,
    });
  }

  if (conflicts.length) return result;

  const actorUpdates = {};
  const skillEntries = [];
  for (const target of resolved.values()) {
    if (target.kind === "characteristic") {
      const current = num(actor.system?.characteristics?.[target.key]?.value);
      const value = target.mode === "add" ? current + target.value : target.value;
      actorUpdates[`system.characteristics.${target.key}.value`] = Math.max(0, Math.min(99, Math.round(value)));
      result.characteristics++;
      continue;
    }

    if (target.kind === "attribute") {
      const current = num(actor.system?.attribs?.[target.key]?.value);
      const max = num(actor.system?.attribs?.[target.key]?.max);
      let value = target.mode === "add" ? current + target.value : target.value;
      value = Math.max(0, Math.round(value));
      if (max > 0) value = Math.min(max, value);
      actorUpdates[`system.attribs.${target.key}.value`] = value;
      result.attributes++;
      continue;
    }

    skillEntries.push(target);
  }

  if (Object.keys(actorUpdates).length) await actor.update(actorUpdates);

  const plans = [];
  const missing = [];
  for (const entry of skillEntries) {
    const item = findSkill(actor, entry.name);
    if (item) plans.push({ item, entry });
    else missing.push(entry);
  }

  if (missing.length) {
    const created = await createSkills(actor, missing.map((entry) => entry.name));
    for (const entry of missing) {
      const item = created.get(entry.name);
      if (item) {
        plans.push({ item, entry });
        result.created++;
      } else {
        result.errors.push(entry.name);
      }
    }
  }

  const itemUpdates = [];
  for (const { item, entry } of plans) {
    const current = skillValue(item);
    const target = Math.max(0, Math.round(entry.mode === "add" ? current + entry.value : entry.value));
    const modern = item.system?.valueUnmodified !== undefined;
    if (modern || actor.type === "character") {
      const adjustments = foundry.utils.duplicate(item.system?.adjustments ?? {});
      const delta = target - current;
      adjustments.experience = Math.max(0, num(adjustments.experience) + delta);
      const update = { _id: item.id, "system.adjustments": adjustments };
      if (!modern) update["system.value"] = null;
      itemUpdates.push(update);
      if (target < current && delta < 0 && num(adjustments.experience) === 0) {
        result.warnings.push(`${item.name}: ${current} → ${target}（低于基础值，已按基础值保留）`);
      }
    } else {
      itemUpdates.push({ _id: item.id, "system.value": target });
    }
    result.skills++;
  }

  if (itemUpdates.length) await actor.updateEmbeddedDocuments("Item", itemUpdates);

  return result;
}
