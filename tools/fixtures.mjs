/**
 * 视觉样稿数据夹具（开发工具，不随模组发布）
 * 用真实模组的 view-model 服务把 mock actor 整理成模板上下文。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
export const MODULE = path.join(ROOT, "module");
export const CN = JSON.parse(fs.readFileSync(path.join(MODULE, "lang/cn.json"), "utf8"));
export const MODULE_ID = "coc7-tidy-investigator";

/* ---------------- 本机 Foundry / CoC7 路径（可用环境变量覆盖） ---------------- */
export const FOUNDRY_DATA =
  process.env.FOUNDRY_DATA ?? path.join(os.homedir(), "Library/Application Support/FoundryVTT/Data");
export const COC7_SYSTEM = process.env.COC7_SYSTEM ?? path.join(FOUNDRY_DATA, "systems", "CoC7");
export const FOUNDRY_APP =
  process.env.FOUNDRY_APP ??
  "/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/public";

const SYS_PATH = path.join(COC7_SYSTEM, "lang", "cn.json");
export const SYS = fs.existsSync(SYS_PATH) ? JSON.parse(fs.readFileSync(SYS_PATH, "utf8")) : {};

const fileUrl = (...segments) => `file://${path.join(...segments)}`;
export const ICON = {
  coC: (n) => fileUrl(COC7_SYSTEM, "assets/icons", n),
  skill: (n) => fileUrl(COC7_SYSTEM, "assets/icons/skills", n),
  foundry: (n) => fileUrl(FOUNDRY_APP, "icons/svg", n),
};

/** 本地化（模块 dict 优先，其次 CoC7 系统 dict） */
export function localize(key) {
  return CN[key] ?? SYS[key] ?? String(key);
}

export function installGlobals() {
  globalThis.game = {
    i18n: {
      lang: "cn",
      localize,
      has: (k) => k in CN || k in SYS,
      format: (k) => localize(k),
    },
    user: { isGM: true },
  };
  globalThis.foundry = {
    utils: { flattenObject: (o) => o ?? {}, duplicate: (o) => JSON.parse(JSON.stringify(o ?? {})) },
    applications: {
      ux: {
        TextEditor: {
          implementation: {
            enrichHTML: async (html) => html ?? "",
          },
        },
      },
    },
  };
  globalThis.CONFIG = {
    Token: {
      movement: {
        actions: {
          walk: { label: "步行", order: 0 },
          fly: { label: "飞行", order: 1 },
          swim: { label: "游泳", order: 2 },
          burrow: { label: "掘地", order: 3 },
          climb: { label: "攀爬", order: 5 },
        },
      },
    },
  };
  globalThis.fromUuid = async (uuid) => ({ name: "深潜者之怒", img: ICON.coC("tentacles-skull.svg"), uuid });
}

/** 构造一个可被服务层消费的 mock actor */
function makeActor(actor, items) {
  items.get = (id) => items.find((i) => i.id === id);
  items.contents = items;
  return {
    ...actor,
    items,
    effects: { contents: actor.effects ?? [] },
    getFlag: (scope, key) => actor.flags?.[scope]?.[key] ?? null,
  };
}

/* ============================================================
   状态夹具：激活状态 / 低资源 / SAN 受伤
   ------------------------------------------------------------
   --state 接受逗号分隔的组合，例如：
     wounded, temp-insane, indef-insane, low-res, san-hit, all-active
   「all-active」会一次性打开全部激活状态 + 低 HP + SAN 受伤，
   用于检查多种强调色同时出现时是否互相干扰。
   ============================================================ */
export const STATE_TOKENS = ["wounded", "temp-insane", "indef-insane", "low-res", "san-hit", "all-active"];

const CONDITION_OF_STATE = {
  wounded: "criticalWounds",
  "temp-insane": "tempoInsane",
  "indef-insane": "indefInsane",
};

export function parseStates(state) {
  if (!state) return new Set();
  const tokens = String(state)
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => Boolean(token) && token !== "normal");
  if (tokens.includes("all-active")) {
    tokens.push("wounded", "temp-insane", "indef-insane", "low-res", "san-hit");
  }
  return new Set(tokens);
}

/** 把状态写进 mock actor 的 system（不改变 module 的真实语义，只模拟系统字段）。 */
function applyState(actor, state, { human = false } = {}) {
  const tokens = parseStates(state);
  const system = actor.system;
  system.conditions ??= {};
  for (const key of ["criticalWounds", "unconscious", "dying", "dead", "prone", "tempoInsane", "indefInsane"]) {
    const current = system.conditions[key];
    if (!current || typeof current !== "object") system.conditions[key] = { value: Boolean(current) };
  }
  for (const [token, key] of Object.entries(CONDITION_OF_STATE)) {
    if (tokens.has(token)) system.conditions[key].value = true;
  }
  if (tokens.has("low-res")) {
    const hp = (system.attribs.hp ??= {});
    const max = Number(hp.max) > 0 ? Number(hp.max) : 10;
    hp.value = Math.max(1, Math.floor(max * 0.2));
  }
  if (tokens.has("san-hit")) {
    const san = (system.attribs.san ??= {});
    // 调查员 SAN 被打到低值；生物原本没有 SAN，这里补一个可见值以检查低 SAN 表现
    san.value = human ? 18 : 20;
    san.max = Number(san.max) > 0 ? Number(san.max) : 99;
    san.dailyLoss = 7;
    san.dailyLimit = 10;
    if (Array.isArray(system.sanityLossEvents)) {
      system.sanityLossEvents.push({ type: "目睹不可名状之物（QA 夹具）", totalLoss: 6 });
    }
  }
  return tokens;
}

function item(type, name, system = {}, extra = {}) {
  return {
    id: extra.id ?? `${type}-${name}`,
    uuid: `Item.${extra.id ?? name}`,
    type,
    name,
    img: extra.img ?? "",
    sort: extra.sort ?? 0,
    flags: extra.flags ?? {},
    system: { ...system },
  };
}

const skill = (id, name, cocid, value, extra = {}) =>
  item(
    "skill",
    name,
    {
      value,
      valueUnmodified: value,
      adjustments: { base: extra.base ?? 0, occupation: 0, personal: 0, experience: 0, ...(extra.adjustments ?? {}) },
      properties: extra.properties ?? {},
      flags: extra.flags ?? {},
      skillName: extra.skillName ?? "",
      specialization: extra.specialization ?? "",
    },
    { id, img: extra.img ?? ICON.skill(extra.icon ?? "skills.svg"), flags: { CoC7: { cocidFlag: { id: `i.skill.${cocid}` } } } },
  );

/* ============================================================
   调查员卡数据
   ============================================================ */
export function investigatorActor() {
  const items = [
    skill("sk-spot", "侦查", "spot-hidden", 65, { base: 25, adjustments: { occupation: 20, personal: 20 }, flags: { developement: true }, icon: "spot_hidden.svg" }),
    skill("sk-library", "图书馆使用", "library-use", 55, { base: 20, adjustments: { occupation: 20, personal: 15 }, icon: "library_use.svg" }),
    skill("sk-listen", "聆听", "listen", 45, { base: 20, adjustments: { personal: 25 }, icon: "listen.svg" }),
    skill("sk-persuade", "说服", "persuade", 40, { base: 10, adjustments: { personal: 30 }, icon: "persuade.svg" }),
    skill("sk-psychology", "心理学", "psychology", 35, { base: 10, adjustments: { occupation: 25 }, icon: "psychology.svg" }),
    skill("sk-dodge", "闪避", "dodge", 32, { base: 32, flags: { developement: true }, icon: "dodge.svg" }),
    skill("sk-stealth", "潜行", "stealth", 40, { base: 20, adjustments: { personal: 20 }, icon: "stealth.svg" }),
    skill("sk-firstaid", "急救", "first-aid", 30, { base: 30, icon: "first_aid.svg" }),
    skill("sk-occult", "神秘学", "occult", 30, { base: 5, adjustments: { personal: 25 }, icon: "occult.svg" }),
    skill("sk-mythos", "克苏鲁神话", "cthulhu-mythos", 12, { base: 0, adjustments: { personal: 12 }, icon: "cthulhu_mythos.svg" }),
    skill("sk-locksmith", "锁匠", "locksmith", 25, { base: 1, adjustments: { personal: 24 }, icon: "locksmith.svg" }),
    skill("sk-drive", "驾驶（汽车）", "drive-auto", 35, { base: 20, adjustments: { personal: 15 }, icon: "drive_auto.svg" }),
    skill("sk-credit", "信用评级", "credit-rating", 45, { base: 0, adjustments: { occupation: 45 }, icon: "credit_rating.svg" }),
    skill("sk-own", "母语", "language-own", 75, { base: 75, icon: "language.svg" }),
    skill("sk-english", "英语", "language-english", 50, { base: 1, adjustments: { personal: 49 }, icon: "language.svg" }),
    skill("sk-throw", "投掷", "throw", 35, { base: 20, adjustments: { personal: 15 }, icon: "fighting_throw.svg" }),
    skill("sk-jump", "跳跃", "jump", 25, { base: 20, icon: "jump.svg" }),
    skill("sk-medicine", "医学", "medicine", 20, { base: 1, adjustments: { personal: 19 }, icon: "medicine.svg" }),
    skill("sk-accounting", "会计", "accounting", 30, { base: 5, adjustments: { occupation: 25 }, icon: "accounting.svg" }),
    skill("sk-archaeology", "考古学", "archaeology", 25, { base: 1, adjustments: { personal: 24 }, icon: "archaeology.svg" }),
    skill("sk-climb", "攀爬", "climb", 35, { base: 20, adjustments: { personal: 15 }, icon: "climb.svg" }),
    skill("sk-firearms", "射击（手枪）", "firearms-handgun", 40, {
      base: 20,
      adjustments: { personal: 20 },
      properties: { special: true },
      skillName: "射击",
      icon: "firearms_handgun.svg",
    }),
    skill("sk-brawl", "格斗（斗殴）", "fighting-brawl", 45, {
      base: 25,
      adjustments: { personal: 20 },
      properties: { special: true },
      skillName: "格斗",
      icon: "fighting_brawl.svg",
    }),
    item(
      "weapon",
      ".45 自动手枪",
      {
        skillMain: { name: "射击（手枪）", system: { value: 40 } },
        skillAlternative: null,
        range: { normal: { value: "15 码", damage: "1D10+2" } },
        usesPerRound: { normal: 2 },
        bullets: 7,
        ammo: 3,
        malfunction: 100,
        properties: { rngd: true },
      },
      { id: "w-pistol", img: ICON.coC("skills.svg"), sort: 10 },
    ),
    item(
      "weapon",
      "李-恩菲尔德步枪",
      {
        skillMain: { name: "射击（步枪）", system: { value: 30 } },
        range: { normal: { value: "110 码", damage: "1D10+4" } },
        usesPerRound: { normal: 1 },
        bullets: 10,
        ammo: 10,
        malfunction: 100,
        properties: { rngd: true },
      },
      { id: "w-rifle", img: ICON.coC("skills.svg"), sort: 15 },
    ),
    item(
      "weapon",
      "折叠刀",
      {
        skillMain: { name: "格斗（斗殴）", system: { value: 45 } },
        range: { normal: { value: "接触", damage: "1D4+DB" } },
        usesPerRound: { normal: 1 },
        bullets: null,
        ammo: 0,
        malfunction: null,
        properties: {},
      },
      { id: "w-knife", img: ICON.coC("secret-book.svg"), sort: 20 },
    ),
    item("armor", "厚呢大衣", { armor: { value: 1 }, description: { value: "<p>颇为体面的深灰呢料大衣，能挡住伦敦的雨，也挡不住多少爪子。</p>" } }, { id: "a-coat", img: ICON.foundry("shield.svg") }),
    item("book", "《黄衣之王》残卷", { mythosRating: "8", description: { value: "<p>装帧考究的剧本残页，页边写满无法辨认的批注。</p>" } }, { id: "b-king", img: ICON.coC("secret-book.svg") }),
    item("spell", "精神转移", { description: { value: "<p>消耗 10 点 MP，将意识短暂投射到视野内的另一具躯体中。</p>" } }, { id: "sp-transfer", img: ICON.coC("pentagram-rose.svg") }),
    item("talent", "博闻强记", { description: { value: "<p>在进行「图书馆使用」检定时，若失败，可再消耗 1 点幸运重掷一次。</p>" } }, { id: "t-memory", img: ICON.foundry("book.svg") }),
    item("talent", "预感", { description: { value: "<p>每章一次，可要求守秘人给出一条关于即将发生危险的模糊提示。</p>" } }, { id: "t-hunch", img: ICON.coC("eye-shield.svg") }),
    item("item", "煤油灯", { quantity: 1, description: { value: "<p>黄铜灯身，玻璃罩有一道裂纹。</p>" } }, { id: "i-lamp", img: ICON.foundry("barrel.svg") }),
    item("item", "黄铜钥匙", { quantity: 2, description: { value: "" } }, { id: "i-key", img: ICON.foundry("door-locked-outline.svg") }),
    item("status", "轻度恐惧", { description: { value: "" } }, { id: "st-fear", img: ICON.coC("paranoia.svg") }),
  ];

  return makeActor(
    {
      name: "埃莉诺·万斯",
      img: ICON.foundry("mystery-man.svg"),
      type: "character",
      uuid: "Actor.investigator",
      system: {
        characteristics: {
          str: { value: 60, formula: "3D6*5" },
          con: { value: 55, formula: "3D6*5" },
          siz: { value: 55, formula: "3D6*5" },
          dex: { value: 65, formula: "3D6*5" },
          app: { value: 45, formula: "3D6*5" },
          int: { value: 70, formula: "3D6*5" },
          pow: { value: 50, formula: "3D6*5" },
          edu: { value: 75, formula: "3D6*5" },
        },
        attribs: {
          hp: { value: 6, max: 14, auto: false },
          mp: { value: 10, max: 10, auto: false },
          san: { value: 55, max: 99, auto: false },
          lck: { value: 60 },
          db: { value: "0", auto: true },
          build: { value: 0, auto: true },
          mov: { value: 8, auto: true },
          armor: { value: 0, auto: false },
          san: { value: 55, max: 99, auto: false, dailyLoss: 3, dailyLimit: 5 },
        },
        infos: {
          occupation: "记者",
          age: "32",
          sex: "女",
          residence: "波士顿",
          birthplace: "阿卡姆",
          organization: "《阿卡姆广告人报》",
          playername: "小明",
        },
        monetary: { credit: 45, cash: 120, assets: 2500, spendingLevel: 10 },
        biography: [
          { title: "外貌形象", value: "身形清瘦，总穿着男式风衣；左眼下方有一道细长的疤。" },
          { title: "思想信念", value: "真相必须被记录，哪怕它并不体面。" },
          { title: "宝贵之物", value: "父亲留下的黄铜怀表，表盖内刻着一行拉丁文。" },
          { title: "意义非凡之地", value: "阿卡姆报社地下档案室，霉味与油墨味交织。" },
          { title: "重要的人", value: "老编辑霍尔曼先生——他在一场火灾后变得沉默寡言。" },
          { title: "特质", value: "刨根问底；对闪光灯有轻微的恐惧。" },
          { title: "伤疤和恐惧症", value: "右肩旧伤；暴雨夜会梦见海底的钟声。" },
        ],
        backstory:
          "<p>埃莉诺·万斯是《阿卡姆广告人报》的资深记者。三年前，她在报道一桩教堂纵火案时第一次看见了不该看见的东西——从那天起，她开始收集所有被报纸压下来的怪事。</p><p>如今她带着相机与速记本，走遍了新英格兰的雾夜。</p>",
        development: { personal: 100, occupation: 200, archetype: 0, experiencePackage: 0 },
        description: { keeper: "<p>埃莉诺其实已经读过三次《黄衣之王》，每次都会丢失一部分关于妹妹的记忆。</p>" },
        sanityLossEvents: [
          { type: "目击深潜者群", totalLoss: 5 },
          { type: "阅读《黄衣之王》", totalLoss: 8 },
          { type: "地下墓穴遭遇", totalLoss: 3, immunity: true },
        ],
        books: [
          { name: "《黄衣之王》残卷", progress: 3, necessary: 40 },
          { name: "《新英格兰民俗志》", progress: 12, necessary: 20 },
        ],
        conditions: {
          criticalWounds: false,
          unconscious: false,
          dying: false,
          dead: false,
          prone: false,
          tempoInsane: false,
          indefInsane: false,
        },
        flags: { locked: true, mythosHardened: false, mythosInsanityExperienced: false },
      },
      flags: {
        [MODULE_ID]: {
          favorites: [{ id: "sk-spot" }, { id: "w-pistol" }],
          keyConnections: ["appearance", "people"],
          growthLabels: ["奈亚拉托提普的面具"],
          growthHistory: [
            { id: "g1", label: "奈亚拉托提普的面具", createdAt: 1730000000000, skillId: "sk-spot", name: "侦查", before: 60, after: 65 },
            { id: "g2", label: "奈亚拉托提普的面具", createdAt: 1730100000000, skillId: "sk-dodge", name: "闪避", before: 30, after: 32 },
          ],
        },
      },
      personalPointsSpent: 40,
      occupationPointsSpent: 120,
      archetypePointsSpent: 0,
      experiencePackagePointsSpent: 0,
      effects: [
        { id: "e1", name: "轻微恐惧", img: ICON.coC("paranoia.svg"), disabled: false },
        { id: "e2", name: "肾上腺素", img: ICON.coC("heart-beats.svg"), disabled: true },
      ],
      getFirstItemByCoCID(cocid) {
        return items.find((i) => i.flags?.CoC7?.cocidFlag?.id === cocid) ?? null;
      },
    },
    items,
  );
}

/* ============================================================
   生物 / NPC 卡数据
   ============================================================ */
export function npcActor({ type = "creature", locked = true } = {}) {
  const human = type === "npc";
  const items = [
    skill("n-bite", "格斗（撕咬）", "fighting-brawl", 45, { base: 25, adjustments: { personal: 20 }, icon: "fighting_brawl.svg" }),
    skill("n-claw", "格斗（爪击）", "fighting-brawl", 55, { base: 25, adjustments: { personal: 30 }, properties: { special: true }, skillName: "格斗", icon: "fighting_brawl.svg" }),
    skill("n-swim", "游泳", "swim", 80, { base: 20, adjustments: { personal: 60 }, icon: "swim.svg" }),
    skill("n-spot", "侦查", "spot-hidden", 50, { base: 25, adjustments: { personal: 25 }, icon: "spot_hidden.svg" }),
    skill("n-listen", "聆听", "listen", 45, { base: 20, adjustments: { personal: 25 }, icon: "listen.svg" }),
    skill("n-stealth", "潜行", "stealth", 40, { base: 20, adjustments: { personal: 20 }, icon: "stealth.svg" }),
    skill("n-throw", "投掷", "throw", 35, { base: 20, adjustments: { personal: 15 }, icon: "fighting_throw.svg" }),
    skill("n-occult", "神秘学", "occult", 30, { base: 5, adjustments: { personal: 25 }, icon: "occult.svg" }),
    skill("n-dodge", "闪避", "dodge", 25, { base: 25, icon: "dodge.svg" }),
    item(
      "weapon",
      "爪击",
      {
        skillMain: { name: "格斗（爪击）", system: { value: 55 } },
        range: { normal: { value: "接触", damage: "1D6+1D4" } },
        usesPerRound: { normal: 2 },
        bullets: "—",
        malfunction: "—",
        properties: { addb: true },
      },
      { id: "nw-claw", img: ICON.coC("whiplash.svg") },
    ),
    item(
      "weapon",
      "咬击",
      {
        skillMain: { name: "格斗（撕咬）", system: { value: 45 } },
        range: { normal: { value: "接触", damage: "1D4+DB" } },
        usesPerRound: { normal: 1 },
        bullets: "—",
        malfunction: "—",
        properties: {},
      },
      { id: "nw-bite", img: ICON.coC("tentacles-skull.svg") },
    ),
    item(
      "weapon",
      "投掷巨石",
      {
        skillMain: { name: "投掷", system: { value: 35 } },
        range: { normal: { value: "20 码", damage: "2D6+1D4" } },
        usesPerRound: { normal: 1 },
        bullets: "—",
        malfunction: "—",
        properties: {},
      },
      { id: "nw-rock", img: ICON.foundry("stone-path.svg") },
    ),
    item(
      "weapon",
      "鱼叉枪",
      {
        skillMain: { name: "射击（鱼叉枪）", system: { value: 35 } },
        range: { normal: { value: "30 码", damage: "1D10+2" } },
        usesPerRound: { normal: 1 },
        bullets: 1,
        ammo: 0,
        malfunction: 95,
        properties: { rngd: true },
      },
      { id: "nw-harpoon", img: ICON.coC("skills.svg") },
    ),
    item("talent", "两栖", { description: { value: "<p>可在水中自由行动；水下移动力等同于游泳移动力，无需呼吸。</p>" } }, { id: "nt-amph", img: ICON.skill("diving.svg") }),
    item("talent", "深渊凝视", { description: { value: "<p>与深潜者对视的调查员须进行 POW 检定；失败者损失 1/1D4 点 SAN。</p>" } }, { id: "nt-gaze", img: ICON.coC("eye-shield.svg") }),
    item("talent", "再生", { description: { value: "<p>每轮恢复 1 点 HP；火焰或魔法造成的伤害无法以此方式恢复。</p>" } }, { id: "nt-regen", img: ICON.coC("heart-beats.svg") }),
    item("spell", "深渊之息", { description: { value: "<p>让周围的水体沸腾。</p>" } }, { id: "nsp-breath", img: ICON.coC("pentagram-rose.svg") }),
    item("spell", "召唤深潜者", { description: { value: "<p>呼唤深海中的同族。</p>" } }, { id: "nsp-summon", img: ICON.coC("floating-tentacles.svg") }),
    item("item", "沉船宝藏", { quantity: 3, description: { value: "" } }, { id: "ni-treasure", img: ICON.foundry("chest.svg") }),
    item("armor", "湿滑鳞甲", { armor: { value: 1 }, description: { value: "" } }, { id: "na-scale", img: ICON.foundry("shield.svg") }),
  ];

  const actor = makeActor(
    {
      name: "深潜者",
      img: ICON.coC("floating-tentacles.svg"),
      type,
      uuid: "Actor.deepone",
      system: {
        characteristics: {
          str: { value: 70, formula: "3D6*5" },
          con: { value: 65, formula: "3D6*5" },
          siz: { value: 80, formula: "3D6*5" },
          dex: { value: 50, formula: "3D6*5" },
          app: { value: null, formula: "" },
          int: { value: 65, formula: "3D6*5" },
          pow: { value: 80, formula: "3D6*5" },
          edu: { value: null, formula: "" },
        },
        attribs: {
          hp: { value: 13, max: 13, auto: true },
          mp: { value: 16, max: 16, auto: true },
          san: { value: null, max: 99, auto: true },
          lck: { value: null },
          db: { value: "1D4", auto: true },
          build: { value: 1, auto: true },
          mov: { value: 8, auto: true, type: "walk" },
          armor: { value: "1", notes: true },
        },
        special: {
          attacksPerRound: "1D3",
          sanLoss: { checkPassed: "0", checkFailled: "1D6" },
          movement: [
            { value: 8, type: "swim" },
            { value: 4, type: "climb" },
          ],
          macros: [{ uuid: "Macro.deepone" }],
        },
        infos: { type: "异界生物", occupation: "", age: "", organization: "" },
        conditions: { criticalWounds: false, unconscious: false, dying: false, dead: false, prone: false, tempoInsane: false, indefInsane: false },
        biography: {
          personalDescription: {
            value:
              "<p>深潜者直立时约有 2 米高，灰绿色的皮肤覆着细鳞，手脚具蹼。头部呈鱼形，眼球外凸，颈侧有鳃裂。</p><p>它们崇拜父神达贡与母神海德拉，在月圆之夜于礁石间吟唱。</p>",
          },
        },
        description: {
          keeper: "<p>聚落入口位于灯塔东北约 400 米的礁洞，退潮时露出。族群由一名祭司统领，持有「海德拉之泪」。</p>",
        },
        flags: { locked, displayFormula: false },
      },
      effects: [{ id: "ne1", name: "水下呼吸", img: ICON.skill("diving.svg"), disabled: false }],
      flags: {
        [MODULE_ID]: { favorites: [] },
      },
    },
    items,
  );
  if (human) applyNpcHumanVariant(actor);
  return actor;
}

/** `--npc-type=npc` 时把生物夹具改成人类 NPC：有 APP/EDU、SAN、幸运，副标题走职业/年龄/组织分支。 */
function applyNpcHumanVariant(actor) {
  const system = actor.system;
  actor.name = "赫尔曼·卡特";
  actor.img = ICON.foundry("mystery-man.svg");
  actor.uuid = "Actor.npc-cultist";
  system.infos = { type: "", occupation: "邪教徒", age: "34", organization: "无形之子" };
  system.characteristics.app = { value: 50, formula: "3D6*5" };
  system.characteristics.edu = { value: 60, formula: "3D6*5" };
  system.attribs.san = { value: 45, max: 99, auto: true };
  system.attribs.lck = { value: 55 };
  system.special.sanLoss = { checkPassed: "1", checkFailled: "1D6" };
  system.biography.personalDescription.value =
    "<p>一个在码头区传教的男人，西装总是过于整洁。他的右手掌心有一枚螺旋状烙印。</p>";
  system.description.keeper = "<p>他并非自愿入教；若被逼问，会透露集会地点在旧海关仓库的地下室。</p>";
  actor.items.push(
    item(
      "weapon",
      "韦伯利左轮手枪",
      {
        skillMain: { name: "射击（手枪）", system: { value: 40 } },
        range: { normal: { value: "15 码", damage: "1D10+2" } },
        usesPerRound: { normal: 2 },
        bullets: 6,
        ammo: 4,
        malfunction: 100,
        properties: { rngd: true },
      },
      { id: "nw-revolver", img: ICON.coC("skills.svg") },
    ),
  );
}

/* ============================================================
   容器卡数据
   ============================================================ */
export function containerActor({ locked = true, empty = false } = {}) {
  const items = empty ? [] : [
    item("weapon", "旧猎枪", { description: { value: "<p>枪管锈迹斑斑，但还能打响。</p>" } }, { id: "cw-shotgun", img: ICON.coC("skills.svg") }),
    item("item", "煤油灯", { quantity: 2, description: { value: "" } }, { id: "ci-lamp", img: ICON.foundry("barrel.svg") }),
    item("book", "无名手稿", { description: { value: "<p>用某种闪着微光的墨水写成。</p>" } }, { id: "cb-manuscript", img: ICON.coC("secret-book.svg") }),
    item("item", "银钥匙", { quantity: 1, description: { value: "" } }, { id: "ci-key", img: ICON.foundry("door-locked-outline.svg") }),
    item("armor", "船长制服", { description: { value: "" } }, { id: "ca-uniform", img: ICON.foundry("shield.svg") }),
    item("spell", "唤潮", { description: { value: "" } }, { id: "cs-tide", img: ICON.coC("pentagram-rose.svg") }),
  ];

  return makeActor(
    {
      name: "船长室的木箱",
      img: ICON.foundry("chest.svg"),
      type: "container",
      uuid: "Actor.box",
      system: {
        description: empty
          ? { value: "", keeper: "" }
          : {
              value: "<p>一只上锁的橡木箱，边角包着铜皮。里面似乎还有夹层。</p>",
              keeper: "<p>钥匙在船长身上；夹层里藏着航海日志。</p>",
            },
        flags: { locked },
      },
      flags: { [MODULE_ID]: { collapsedGroups: [] } },
      effects: [],
    },
    items,
  );
}

/* ============================================================
   模板上下文
   ============================================================ */
/**
 * 生成一张卡的模板上下文。
 * @param {object} opts
 * @param {string} opts.sheet investigator | npc | container
 * @param {string} [opts.tab] 激活的 tab id
 * @param {boolean} [opts.editing] 编辑态（未锁定 + 有 owner 权限）
 * @param {boolean} [opts.compact] 紧凑模式
 * @param {boolean} [opts.dark] 暗色主题
 * @param {string} [opts.npcType] creature | npc
 * @param {string} [opts.state] 逗号分隔的状态组合，见 STATE_TOKENS
 * @param {"gm"|"owner"|"observer"} [opts.viewer] 视角：GM / 非 GM 所有者 / 观察者（只读）
 * @param {boolean} [opts.formulaMode] NPC 公式模式（需要编辑态）
 */
export async function buildContexts({
  sheet,
  tab,
  editing = false,
  compact = false,
  dark = false,
  npcType = "creature",
  state = "normal",
  viewer = "gm",
  formulaMode = false,
  empty = false,
}) {
  const isGM = viewer === "gm";
  const canEdit = viewer !== "observer";
  const isEditing = canEdit && Boolean(editing);
  const tabsOf = (ids, active) => {
    const icons = {
      skills: "fa-solid fa-dice-d20",
      summary: "fa-solid fa-list-ul",
      possessions: "fa-solid fa-suitcase",
      background: "fa-solid fa-book-open",
      growth: "fa-solid fa-star",
      notes: "fa-solid fa-feather",
      effects: "fa-solid fa-bolt",
      combat: "fa-solid fa-crosshairs",
      inventory: "fa-solid fa-suitcase",
      description: "fa-solid fa-book-open",
      keeper: "fa-solid fa-feather",
      items: "fa-solid fa-suitcase",
    };
    return Object.fromEntries(
      ids.map((id) => [id, { id, group: "primary", label: `C7TIDY.Tabs.${id}`, icon: icons[id] ?? "", cssClass: id === active ? "active" : "" }]),
    );
  };

  const base = {
    canEdit,
    isGM,
    isCompact: compact,
    isEditing,
    isLocked: !isEditing,
  };

  if (sheet === "investigator") {
    const view = await import(`${MODULE}/scripts/services/view-data.js`);
    const tabsData = await import(`${MODULE}/scripts/services/tabs-data.js`);
    const { orderResources, prepareCharacteristics, prepareConditions, prepareDailySan, prepareDerived, prepareIdentity, prepareResources } = view;
    const actor = investigatorActor();
    applyState(actor, state, { human: true });
    const system = actor.system;
    system.flags.locked = !isEditing;
    const tabs = tabsOf(["skills", "summary", "possessions", "background", "growth", "notes", "effects"], tab ?? "skills");
    // 「笔记」tab 仅 GM 可见（与 investigator-sheet.js 一致）
    if (!isGM) delete tabs.notes;
    const ctx = {
      ...base,
      actor,
      document: actor,
      system,
      identity: prepareIdentity(actor, system),
      characteristics: prepareCharacteristics(system, actor),
      resources: orderResources(prepareResources(system), actor.getFlag(MODULE_ID, "resourceOrder")),
      derived: prepareDerived(system),
      conditions: prepareConditions(system),
      dailySan: prepareDailySan(system),
      skillView: tabsData.prepareSkillView(actor, { sort: "value" }),
      skillSort: "value",
      sortByValue: true,
      sortByName: false,
      isCustomSort: false,
      summary: tabsData.prepareSummary(actor),
      weapons: tabsData.prepareWeapons(actor),
      possessions: tabsData.preparePossessions(actor),
      growth: tabsData.prepareGrowth(actor),
      notes: tabsData.prepareNotes(actor),
      effects: tabsData.prepareEffects(actor),
      favorites: tabsData.prepareFavorites(actor),
      background: await backgroundContext(tabsData, actor),
      tabs,
    };
    ctx.notes.keeperHtml = ctx.notes.keeper;
    for (const group of ctx.possessions.groups) group.collapsed = false;
    markFavorites(ctx);
    return { html: ctx, kind: "investigator", width: 780, height: 780, dark, editing: isEditing, compact };
  }

  if (sheet === "npc") {
    const npcData = await import(`${MODULE}/scripts/services/npc-data.js`);
    const view = await import(`${MODULE}/scripts/services/view-data.js`);
    const tabsData = await import(`${MODULE}/scripts/services/tabs-data.js`);
    const actor = npcActor({ locked: !isEditing, type: npcType });
    applyState(actor, state, { human: npcType === "npc" });
    const system = actor.system;
    if (formulaMode) system.flags.displayFormula = true;
    const npc = npcData.prepareNpcIdentity(actor, system);
    const tabs = tabsOf(["combat", "skills", "inventory", "description", "keeper", "effects"], tab ?? "combat");
    // 「守秘」tab 仅 GM 可见（与 npc-sheet.js 一致）
    if (!isGM) delete tabs.keeper;
    const ctx = {
      ...base,
      actor,
      document: actor,
      system,
      identity: npc,
      npc,
      isCreature: npcType === "creature",
      characteristics: view.prepareCharacteristics(system, actor),
      resources: npcData.prepareNpcResources(system, !isEditing),
      derived: view.prepareNpcDerived(system),
      conditions: view.prepareConditions(system),
      special: npcData.prepareNpcSpecial(actor),
      talents: npcData.prepareTalents(actor),
      weapons: tabsData.prepareWeapons(actor),
      skillView: tabsData.prepareSkillView(actor, { sort: "value" }),
      skillSort: "value",
      sortByValue: true,
      sortByName: false,
      isCustomSort: false,
      inventory: tabsData.preparePossessions(actor, { types: ["armor", "book", "spell", "talent", "item", "status"], keepEmpty: isEditing }),
      effects: tabsData.prepareEffects(actor),
      macros: await npcData.prepareMacros(actor),
      npcText: await npcData.prepareNpcText(actor),
      formulaMode: isEditing && Boolean(system.flags?.displayFormula),
      tabs,
    };
    for (const group of ctx.inventory.groups) group.collapsed = false;
    return { html: ctx, kind: "npc", width: 780, height: 780, dark, editing: isEditing, compact };
  }

  const containerData = await import(`${MODULE}/scripts/services/container-data.js`);
  const tabsData = await import(`${MODULE}/scripts/services/tabs-data.js`);
  const actor = containerActor({ locked: !isEditing, empty });
  const tabs = tabsOf(["items", "description", "keeper", "effects"], tab ?? "items");
  // 「守秘」tab 仅 GM 可见（与 container-sheet.js 一致）
  if (!isGM) delete tabs.keeper;
  const ctx = {
    ...base,
    actor,
    document: actor,
    system: actor.system,
    identity: {},
    container: containerData.prepareContainerView(actor),
    inventory: tabsData.preparePossessions(actor, { types: ["weapon", "armor", "book", "spell", "talent", "item", "status"], keepEmpty: isEditing }),
    effects: tabsData.prepareEffects(actor),
    containerText: await containerData.prepareContainerText(actor),
    tabs,
  };
  for (const group of ctx.inventory.groups) group.collapsed = false;
  return { html: ctx, kind: "container", width: 660, height: 720, dark, editing: isEditing, compact };
}

async function backgroundContext(tabsData, actor) {
  const data = tabsData.prepareBackground(actor);
  data.slots = data.slots.map((slot) => ({ ...slot, valueHtml: slot.value }));
  data.backstoryHtml = data.backstory;
  return data;
}

function markFavorites(ctx) {
  const ids = new Set(ctx.favorites.map((entry) => entry.id));
  for (const row of ctx.skillView.rows) row.isFavorite = ids.has(row.id);
  for (const group of ctx.skillView.groups) for (const row of group.skills) row.isFavorite = ids.has(row.id);
  for (const weapon of ctx.weapons) weapon.isFavorite = ids.has(weapon.id);
  for (const group of ctx.possessions.groups) for (const row of group.items) row.isFavorite = ids.has(row.id);
}
