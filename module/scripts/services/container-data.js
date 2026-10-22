/**
 * 容器卡（container actor）视图模型。
 * 容器只有 description.value / description.keeper 两个文本字段，没有特性、属性、物品之外的数据。
 */

function text(value, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

/** 物品分组的类型顺序（与系统容器卡一致：武器 / 护具 / 书籍 / 法术 / 道具 …） */
const TYPE_ORDER = ["weapon", "armor", "book", "spell", "talent", "item", "status"];

/** 容器身份：名称/头像/类型/物品总数与分类计数。 */
export function prepareContainerView(actor) {
  const items = actor.items?.contents ?? Array.from(actor.items ?? []);
  const counts = TYPE_ORDER.map((type) => ({
    type,
    label: `TYPES.Item.${type}`,
    count: items.filter((item) => item.type === type).length,
  })).filter((row) => row.count > 0);
  return {
    name: actor.name,
    img: actor.img,
    total: items.length,
    counts,
  };
}

/** 容器描述与守秘笔记：富文本 + 原文。 */
export async function prepareContainerText(actor) {
  const description = text(actor.system?.description?.value, "");
  const keeper = text(actor.system?.description?.keeper, "");
  return {
    description,
    descriptionHtml: await enrich(actor, description, Boolean(game.user?.isGM)),
    keeper,
    keeperHtml: await enrich(actor, keeper, Boolean(game.user?.isGM)),
  };
}

/** 富文本渲染（三态回退）。 */
export async function enrich(actor, html, secrets = false) {
  const TextEditor = foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  if (!TextEditor?.enrichHTML) return html ?? "";
  try {
    return await TextEditor.enrichHTML(html || "", { async: true, relativeTo: actor, secrets });
  } catch {
    return html ?? "";
  }
}
