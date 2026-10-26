export const MODULE_ID = "coc7-tidy-investigator";

export const TEMPLATES = {
  // 调查员卡
  sheet: `modules/${MODULE_ID}/templates/investigator/sheet.hbs`,
  icons: `modules/${MODULE_ID}/templates/parts/icons.hbs`,
  bannerArt: `modules/${MODULE_ID}/templates/parts/banner-art.hbs`,
  tabsNav: `modules/${MODULE_ID}/templates/parts/tabs-nav.hbs`,
  skillRow: `modules/${MODULE_ID}/templates/parts/skill-row.hbs`,
  skillRowEdit: `modules/${MODULE_ID}/templates/parts/skill-row-edit.hbs`,
  skills: `modules/${MODULE_ID}/templates/tabs/skills.hbs`,
  summary: `modules/${MODULE_ID}/templates/tabs/summary.hbs`,
  possessions: `modules/${MODULE_ID}/templates/tabs/possessions.hbs`,
  background: `modules/${MODULE_ID}/templates/tabs/background.hbs`,
  growth: `modules/${MODULE_ID}/templates/tabs/growth.hbs`,
  notes: `modules/${MODULE_ID}/templates/tabs/notes.hbs`,
  effects: `modules/${MODULE_ID}/templates/tabs/effects.hbs`,

  // 生物 / NPC 卡
  npcSheet: `modules/${MODULE_ID}/templates/npc/sheet.hbs`,
  npcSkillRow: `modules/${MODULE_ID}/templates/npc/parts/skill-row.hbs`,
  npcSkillRowEdit: `modules/${MODULE_ID}/templates/npc/parts/skill-row-edit.hbs`,
  npcCombat: `modules/${MODULE_ID}/templates/npc/tabs/combat.hbs`,
  npcSkills: `modules/${MODULE_ID}/templates/npc/tabs/skills.hbs`,
  npcInventory: `modules/${MODULE_ID}/templates/npc/tabs/inventory.hbs`,
  npcDescription: `modules/${MODULE_ID}/templates/npc/tabs/description.hbs`,
  npcKeeper: `modules/${MODULE_ID}/templates/npc/tabs/keeper.hbs`,

  // 容器卡
  containerSheet: `modules/${MODULE_ID}/templates/container/sheet.hbs`,
  containerItems: `modules/${MODULE_ID}/templates/container/tabs/items.hbs`,
  containerDescription: `modules/${MODULE_ID}/templates/container/tabs/description.hbs`,
  containerKeeper: `modules/${MODULE_ID}/templates/container/tabs/keeper.hbs`,
};

/** 生物 / NPC 卡可出现的物品分组（武器在战斗页，无货币） */
export const NPC_ITEM_TYPES = ["armor", "book", "spell", "talent", "item", "status"];

export const NPC_TAB_IDS = ["combat", "skills", "inventory", "description", "keeper", "effects"];

/** 容器卡可收纳的物品类型（与系统容器卡一致，另保留天赋 / 状态） */
export const CONTAINER_ITEM_TYPES = ["weapon", "armor", "book", "spell", "talent", "item", "status"];

export const CONTAINER_TAB_IDS = ["items", "description", "keeper", "effects"];

/** 背景（Backstory）七要素：slot id → 默认中文标题 */
export const BACKGROUND_SLOTS = [
  { id: "appearance", label: "C7TIDY.Background.Appearance", aliases: ["外貌形象", "形象描述", "Personal Description"] },
  { id: "beliefs", label: "C7TIDY.Background.Beliefs", aliases: ["思想信念", "思想与信念", "意识形态与信念", "Ideology & Beliefs", "Ideology and Beliefs"] },
  { id: "treasured", label: "C7TIDY.Background.Treasured", aliases: ["宝贵之物", "珍视之物", "Treasured Possessions"] },
  { id: "locations", label: "C7TIDY.Background.Locations", aliases: ["意义非凡之地", "有意义的地点", "Meaningful Locations"] },
  { id: "people", label: "C7TIDY.Background.People", aliases: ["重要的人", "重要之人", "Significant People"] },
  { id: "traits", label: "C7TIDY.Background.Traits", aliases: ["特质", "Traits"] },
  { id: "scars", label: "C7TIDY.Background.Scars", aliases: ["伤疤和恐惧症", "伤害与疤痕", "伤疤", "Injuries & Scars", "Scars and Phobias"] },
];

/** 简表六类技能：CoC-ID 去掉 "i.skill." 前缀后的完整映射（CoC7 8.16 共 103 个） */
export const SKILL_CATEGORIES = [
  {
    id: "combat",
    label: "C7TIDY.Category.Combat",
    cocids: [
      "fighting-any", "fighting-axe", "fighting-brawl", "fighting-chainsaw", "fighting-flail",
      "fighting-garrote", "fighting-spear", "fighting-sword", "fighting-whip",
      "firearms-any", "firearms-artillery", "firearms-bow", "firearms-flamethrower", "firearms-handgun",
      "firearms-heavy-weapons", "firearms-machine-gun", "firearms-rifle-shotgun", "firearms-submachine-gun",
      "dodge", "throw", "demolitions",
    ],
  },
  {
    id: "investigation",
    label: "C7TIDY.Category.Investigation",
    cocids: [
      "accounting", "anthropology", "appraise", "archaeology", "civics", "cthulhu-mythos", "empire",
      "history", "language-any", "language-own", "language-czech", "language-dutch", "language-english",
      "language-german", "language-polish", "language-russian", "language-swahili", "language-yoruba",
      "language-zulu", "law", "library-use", "listen", "lore-any", "natural-world", "occult",
      "psychology", "read-lips", "science-any", "science-astronomy", "science-biology", "science-botany",
      "science-chemistry", "science-cryptography", "science-engineering", "science-forensics",
      "science-geology", "science-mathematics", "science-meteorology", "science-pharmacy",
      "science-physics", "science-zoology", "spot-hidden",
    ],
  },
  {
    id: "social",
    label: "C7TIDY.Category.Social",
    cocids: ["charm", "credit-rating", "fast-talk", "gambling", "intimidate", "persuade"],
  },
  {
    id: "survival",
    label: "C7TIDY.Category.Survival",
    cocids: [
      "animal-handling", "climb", "diving", "drive-auto", "drive-carriage", "drive-horse-oxen",
      "drive-wagon-coach", "jump", "navigate", "pilot-any", "ride", "rope-use", "stealth",
      "survival-any", "swim", "track",
    ],
  },
  {
    id: "craft",
    label: "C7TIDY.Category.Craft",
    cocids: [
      "art-craft-acting", "art-craft-any", "art-craft-fine-art", "art-craft-forgery",
      "art-craft-photography", "computer-use", "disguise", "electrical-repair", "electronics",
      "locksmith", "mechanical-repair", "operate-heavy-machinery", "sleight-of-hand", "trap",
    ],
  },
  {
    id: "medical",
    label: "C7TIDY.Category.Medical",
    cocids: ["first-aid", "hypnosis", "medicine", "psychoanalysis"],
  },
];
