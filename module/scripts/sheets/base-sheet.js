import { MODULE_ID } from "../constants.js";
import {
  prepareCharacteristics,
  prepareConditions,
  prepareDailySan,
  prepareDerived,
  prepareIdentity,
  prepareResources,
} from "../services/view-data.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * CoC7 Tidy 卡片基类：所有 Tidy 风格 actor 卡（调查员、后续 NPC）共用。
 * 只负责通用上下文与状态判断，不绑定具体 tab 结构。
 */
export class Coc7TidyBaseSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** @returns {Actor} */
  get actor() {
    return this.document;
  }

  /** 系统原生「锁定」标志：锁定时为只读展示。 */
  get isLocked() {
    return Boolean(this.document.system?.flags?.locked);
  }

  /** 是否处于可编辑态（有 owner 权限且未锁定）。 */
  get isEditing() {
    return Boolean(this.isEditable && !this.isLocked);
  }

  /** @override */
  _initializeApplicationOptions(options) {
    const opts = super._initializeApplicationOptions(options);
    // 明确开启窗口缩放（避免父类默认 resizable:false 或外部配置覆盖）
    opts.window.resizable = true;

    // 记忆窗口尺寸
    try {
      if (game.settings.get(MODULE_ID, "rememberWindowSize")) {
        const saved = (game.settings.get(MODULE_ID, "sheetSize") ?? {})[this.constructor.name];
        if (saved?.width && saved?.height) {
          opts.position = { ...opts.position, width: saved.width, height: saved.height };
        }
      }
    } catch {
      /* 设置尚未注册时忽略 */
    }
    return opts;
  }

  /** 保存当前窗口尺寸（供下次打开使用） */
  #saveWindowSize() {
    try {
      if (!game.settings.get(MODULE_ID, "rememberWindowSize")) return;
      const sizes = foundry.utils.duplicate(game.settings.get(MODULE_ID, "sheetSize") ?? {});
      sizes[this.constructor.name] = { width: Math.round(this.position.width), height: Math.round(this.position.height) };
      game.settings.set(MODULE_ID, "sheetSize", sizes);
    } catch {
      /* 忽略 */
    }
  }

  /** @override */
  async _onClose(options) {
    this.#saveWindowSize();
    return super._onClose(options);
  }

  /** 缩放手柄挂载的最小尺寸 */
  static MIN_WIDTH = 700;
  static MIN_HEIGHT = 500;
  static RESIZE_DIRECTIONS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#installResizeHandles();
  }

  /** 在窗口四周安装 8 个缩放手柄（Foundry 原生只有右下角一个）。 */
  #installResizeHandles() {
    const win = this.element;
    if (!win || win.querySelector(".c7t-resize-handle")) return;
    for (const dir of Coc7TidyBaseSheet.RESIZE_DIRECTIONS) {
      const handle = document.createElement("div");
      handle.className = `c7t-resize-handle c7t-resize-${dir}`;
      handle.dataset.dir = dir;
      handle.addEventListener("pointerdown", (event) => this.#onResizeStart(event, dir));
      win.append(handle);
    }
  }

  /** @param {PointerEvent} event @param {string} dir */
  #onResizeStart(event, dir) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const start = {
      x: event.clientX,
      y: event.clientY,
      left: this.position.left,
      top: this.position.top,
      width: this.position.width,
      height: this.position.height,
    };
    const minWidth = this.constructor.MIN_WIDTH ?? 760;
    const minHeight = this.constructor.MIN_HEIGHT ?? 520;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      let { left, top, width, height } = start;

      if (dir.includes("e")) width = Math.max(minWidth, start.width + dx);
      if (dir.includes("s")) height = Math.max(minHeight, start.height + dy);
      if (dir.includes("w")) {
        width = Math.max(minWidth, start.width - dx);
        left = start.left + (start.width - width);
      }
      if (dir.includes("n")) {
        height = Math.max(minHeight, start.height - dy);
        top = start.top + (start.height - height);
      }

      this.setPosition({
        left: Math.max(0, left),
        top: Math.max(0, top),
        width,
        height,
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      this.#saveWindowSize();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  #isCompact() {
    try {
      return Boolean(game.settings.get(MODULE_ID, "compactMode"));
    } catch {
      return false;
    }
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system ?? {};

    return Object.assign(context, {
      actor,
      document: actor,
      system,
      canEdit: this.isEditable,
      isCompact: this.#isCompact(),
      isLocked: this.isLocked,
      isEditing: this.isEditing,
      isGM: game.user.isGM,
      identity: prepareIdentity(actor, system),
      characteristics: prepareCharacteristics(system),
      resources: prepareResources(system),
      derived: prepareDerived(system),
      conditions: prepareConditions(system),
      dailySan: prepareDailySan(system),
    });
  }
}
