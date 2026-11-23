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
  SEALDICE_GROUP_ALIASES,
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
  "驾驶(汽车)": "Drive Auto",
  "射击(手枪)": "Firearms (Handgun)",
  "射击(步枪/霰弹枪)": "Firearms (Rifle/Shotgun)",
  "射击(冲锋枪)": "Firearms (Submachine Gun)",
  "射击(机枪)": "Firearms (Machine Gun)",
  "射击(重武器)": "Firearms (Heavy Weapons)",
  "射击(弓)": "Firearms (Bow)",
  "射击(火炮)": "Firearms (Artillery)",
  "射击(喷火器)": "Firearms (Flamethrower)",
  "艺术与手艺(摄影)": "Art/Craft (Photography)",
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
    const name = names.find((candidate) => lower.startsWith(String(candidate).toLowerCase()));
    if (!name) return null;
    rest = rest.slice(String(name).length);
    const match = rest.match(/^[=:：]?\s*([+-]?\d+(?:\.\d+)?(?:\s*[+-]\s*\d+(?:\.\d+)?)*)/);
    if (!match) return null;
    const expression = match[1].replace(/\s+/g, "");
    const mode = /^[+-]/.test(expression) ? "add" : "set";
    const value = expression
      .split(/(?=[+-])/)
      .reduce((sum, part) => sum + Number(part), 0);
    if (!Number.isFinite(value)) return null;
    entries.push({ name: String(name).trim(), value, mode });
    rest = rest.slice(match[0].length);
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
    line = line.replace(/[,，]/g, " ");
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
  for (const [key, aliases] of Object.entries(CHARACTERISTICS)) {
    if (aliases.some((alias) => normalizeName(alias) === normalized)) return key;
  }
  return null;
}

function findAttribute(name) {
  const normalized = normalizeName(name);
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

function findSkill(actor, name) {
  const direct = findSkillByName(actor, name);
  if (direct) return direct;
  const normalized = normalizeName(name);
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
  }
  return null;
}

async function findCompendiumSkill(name) {
  const pack = globalThis.game?.packs?.get?.("CoC7.skills");
  if (!pack) return null;
  try {
    const index = await pack.getIndex({ fields: ["system.skillName", "system.specialization", "system.base"] });
    const entries = [...index];
    const normalized = normalizeName(name);
    const alias = SEALDICE_SKILL_ALIASES[normalized] ?? EXTRA_SKILL_ALIASES[normalized];
    const lookupNames = alias ? [alias, name] : [name];
    const exact = entries.find((entry) => {
      const system = entry.system ?? {};
      return lookupNames.some((lookupName) => {
        const wanted = normalizeName(lookupName);
        return [entry.name, system.skillName, `${system.skillName}(${system.specialization})`, `${system.specialization}(${system.skillName})`]
          .some((candidate) => candidate && normalizeName(candidate) === wanted);
      });
    });
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

async function createSkill(actor, name) {
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
      const [item] = await actor.createEmbeddedDocuments("Item", [source]);
      if (item) return item;
    } catch (error) {
      console.warn("coc7-tidy-investigator | 从技能包创建技能失败，改用空白技能", name, error);
    }
  }
  try {
    const [item] = await actor.createEmbeddedDocuments("Item", [{
      name: String(name).trim(),
      type: "skill",
      system: {
        skillName: parts.skillName,
        specialization: parts.specialization,
        properties: { special: Boolean(parts.specialization) },
        flags: {},
      },
    }]);
    return item ?? null;
  } catch (error) {
    console.error("coc7-tidy-investigator | 创建技能失败", name, error);
    return null;
  }
}

/**
 * 把 `.st` 文本导入 Actor。
 * @returns {Promise<{characteristics:number, attributes:number, skills:number, created:number, warnings:string[], errors:string[]}>}
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

  const actorUpdates = {};
  const skillEntries = [];

  for (const entry of parsed.entries) {
    const characteristic = findCharacteristic(entry.name);
    if (characteristic) {
      const current = num(actor.system?.characteristics?.[characteristic]?.value);
      const value = entry.mode === "add" ? current + entry.value : entry.value;
      actorUpdates[`system.characteristics.${characteristic}.value`] = Math.max(0, Math.min(99, Math.round(value)));
      result.characteristics++;
      continue;
    }

    const attribute = findAttribute(entry.name);
    if (attribute) {
      const current = num(actor.system?.attribs?.[attribute]?.value);
      const max = num(actor.system?.attribs?.[attribute]?.max);
      let value = entry.mode === "add" ? current + entry.value : entry.value;
      value = Math.max(0, Math.round(value));
      if (max > 0) value = Math.min(max, value);
      actorUpdates[`system.attribs.${attribute}.value`] = value;
      result.attributes++;
      continue;
    }

    skillEntries.push(entry);
  }

  if (Object.keys(actorUpdates).length) await actor.update(actorUpdates);

  for (const entry of skillEntries) {
    let item = findSkill(actor, entry.name);
    if (!item) {
      item = await createSkill(actor, entry.name);
      if (item) result.created++;
    }
    if (!item) {
      result.errors.push(entry.name);
      continue;
    }

    const current = skillValue(item);
    const target = Math.max(0, Math.round(entry.mode === "add" ? current + entry.value : entry.value));
    const modern = item.system?.valueUnmodified !== undefined;
    if (modern || actor.type === "character") {
      const adjustments = foundry.utils.duplicate(item.system?.adjustments ?? {});
      const delta = target - current;
      adjustments.experience = Math.max(0, num(adjustments.experience) + delta);
      const update = { _id: item.id, "system.adjustments": adjustments };
      if (!modern) update["system.value"] = null;
      await actor.updateEmbeddedDocuments("Item", [update]);
      if (target < current && delta < 0 && num(adjustments.experience) === 0) {
        result.warnings.push(`${item.name}: ${current} → ${target}（低于基础值，已按基础值保留）`);
      }
    } else if (typeof item.updateValue === "function") {
      await item.updateValue(target);
    } else {
      await item.update({ "system.value": target });
    }
    result.skills++;
  }

  return result;
}
