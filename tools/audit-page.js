/**
 * 注入到每个评审页面里执行的只读探针（不代表任何产品代码）。
 * 由 audit.mjs 通过 CDP `Runtime.evaluate` 注入，暴露两个函数：
 *   window.__c7tAuditCollect()  —— 采集文本矩形 / 溢出 / 破图 / 控件 / 字体 / tab / 布局数据
 *   window.__c7tAuditHideText() —— 只用于截图采样：把文字临时透明化，拿到纯背景像素
 * 这里只读取 DOM 与 computed style，不写入页面数据。
 */
(() => {
  if (window.__c7tAuditReady) return;
  window.__c7tAuditReady = true;

  const TEXT_CAP = 900;
  const OVERFLOW_CAP = 160;
  const WIDGET_CAP = 240;
  const IMAGE_CAP = 200;
  const ICON_TAGS = new Set(["I", "SVG", "PATH", "USE", "SCRIPT", "STYLE", "NOSCRIPT", "OPTION", "TITLE", "META", "LINK"]);
  const FA_GLYPH = /[\uE000-\uF8FF]/;
  const SECONDARY_RE = /(mute|dim|sub(?!mit)|hint|foot|placeholder|note|meta|secondary|empty|caption|hint|tooltip)/i;

  const px = (value) => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };

  function parseColor(value) {
    const match = String(value).match(/rgba?\(([^)]+)\)/i);
    if (!match) return { r: 0, g: 0, b: 0, a: 0 };
    const parts = match[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
  }

  function composite(top, bottom) {
    const a = top.a + bottom.a * (1 - top.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (t, b) => Math.round((t * top.a + b * bottom.a * (1 - top.a)) / a);
    return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
  }

  /** 祖先背景近似：由外到内合成 background-color；遇到背景图时标记 hasImage。 */
  function backgroundGuess(el) {
    const chain = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      chain.push({ color: parseColor(cs.backgroundColor), hasImage: cs.backgroundImage !== "none" });
      node = node.parentElement;
    }
    let out = { r: 24, g: 24, b: 26, a: 1, hasImage: false };
    for (let i = chain.length - 1; i >= 0; i--) {
      const entry = chain[i];
      if (entry.hasImage) out.hasImage = true;
      if (entry.color.a > 0) out = composite({ ...entry.color, a: entry.color.a }, out);
    }
    return out;
  }

  function cssPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let sel = node.tagName.toLowerCase();
      const cls = [...node.classList].filter((name) => !name.startsWith("is-")).slice(0, 2);
      if (cls.length) sel += `.${cls.join(".")}`;
      if (node.dataset && node.dataset.tab) sel += `[data-tab="${node.dataset.tab}"]`;
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function snippet(text) {
    return String(text).replace(/\s+/g, " ").trim().slice(0, 42);
  }

  function visibleElement(el) {
    if (!el || el.nodeType !== 1) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (Number(cs.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function textRectOf(node) {
    try {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      range.detach?.();
      if (!rects.length) return null;
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const rect of rects) {
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      }
      return { x: left, y: top, w: right - left, h: bottom - top, lines: rects.length, left, top, right, bottom };
    } catch {
      return null;
    }
  }

  function windowRect() {
    return document.querySelector(".c7t-window")?.getBoundingClientRect() ?? null;
  }

  /** 文字/输入框可见区域 = 自身矩形 ∩ 窗口矩形 ∩ 所有滚动/裁切祖先。被裁掉 >28% 的不参与对比度采样。 */
  function visibleRect(rect, el) {
    const win = windowRect();
    if (!win) return null;
    let left = Math.max(rect.left, win.left);
    let top = Math.max(rect.top, win.top);
    let right = Math.min(rect.right, win.right);
    let bottom = Math.min(rect.bottom, win.bottom);
    let node = el.parentElement;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (/(auto|scroll|hidden|clip)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
        const clip = node.getBoundingClientRect();
        left = Math.max(left, clip.left);
        top = Math.max(top, clip.top);
        right = Math.min(right, clip.right);
        bottom = Math.min(bottom, clip.bottom);
      }
      if (node.matches(".c7t-window")) break;
      node = node.parentElement;
    }
    if (right <= left || bottom <= top) return null;
    const area = (right - left) * (bottom - top);
    if (area / Math.max(1, rect.w * rect.h) < 0.72) return null;
    return { x: left, y: top, w: right - left, h: bottom - top, left, top, right, bottom };
  }

  function collectText() {
    const root = document.querySelector(".c7t-sheet");
    if (!root) return [];
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const el = node.parentElement;
        if (!el || ICON_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (FA_GLYPH.test(node.nodeValue) && !/[A-Za-z\u4e00-\u9fff]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode()) && out.length < TEXT_CAP) {
      const el = node.parentElement;
      if (!visibleElement(el)) continue;
      const rect = textRectOf(node);
      if (!rect || rect.w < 1 || rect.h < 1) continue;
      const sampleRect = visibleRect(rect, el);
      if (!sampleRect) continue;
      const cs = getComputedStyle(el);
      // 「次要文字」只按语义类 / 标签判断：em、small、mute/dim/hint 等。
      // 不按字号判断，避免把 10px 的表头/标签误当成次要文字而放低对比度要求。
      const secondary = SECONDARY_RE.test(String(el.className)) || ["EM", "SMALL"].includes(el.tagName);
      out.push({
        sel: cssPath(el),
        text: snippet(node.nodeValue),
        color: cs.color,
        fontSize: px(cs.fontSize),
        fontWeight: Number(cs.fontWeight) || 400,
        fontFamily: cs.fontFamily,
        letterSpacing: cs.letterSpacing,
        opacity: Number(cs.opacity),
        secondary,
        rect: { x: sampleRect.x, y: sampleRect.y, w: sampleRect.w, h: sampleRect.h, lines: rect.lines },
        bgGuess: backgroundGuess(el),
      });
    }

    // 输入框 / 下拉框里的文字不是文本节点，单独采样。
    for (const el of root.querySelectorAll("input, textarea, select")) {
      if (out.length >= TEXT_CAP) break;
      if (!visibleElement(el)) continue;
      const value = el.tagName === "SELECT" ? el.selectedOptions?.[0]?.textContent ?? "" : el.value ?? "";
      if (!value.trim()) continue;
      const raw = el.getBoundingClientRect();
      const rect =
        raw.width > 0 && raw.height > 0
          ? { left: raw.left, top: raw.top, right: raw.right, bottom: raw.bottom, w: raw.width, h: raw.height }
          : null;
      const sampleRect = rect ? visibleRect(rect, el) : null;
      if (!sampleRect) continue;
      const cs = getComputedStyle(el);
      out.push({
        sel: cssPath(el),
        text: snippet(value),
        color: cs.color,
        fontSize: px(cs.fontSize),
        fontWeight: Number(cs.fontWeight) || 400,
        fontFamily: cs.fontFamily,
        letterSpacing: cs.letterSpacing,
        opacity: Number(cs.opacity),
        secondary: false,
        input: true,
        rect: { x: sampleRect.x, y: sampleRect.y, w: sampleRect.w, h: sampleRect.h, lines: 1 },
        bgGuess: backgroundGuess(el),
      });
    }
    return out;
  }

  function overflowAncestor(rect, el) {
    let node = el.parentElement;
    while (node && node.nodeType === 1) {
      if (node.matches(".c7t-sheet, .c7t-window")) break;
      const cs = getComputedStyle(node);
      if (cs.overflowX === "hidden" || cs.overflowX === "clip" || cs.overflow === "hidden") {
        const box = node.getBoundingClientRect();
        const clippedRight = rect.right - box.right;
        const clippedLeft = box.left - rect.left;
        if (clippedRight > 1 || clippedLeft > 1) {
          return { by: cssPath(node), right: Math.round(clippedRight), left: Math.round(clippedLeft) };
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  function collectOverflow() {
    const out = [];
    const win = windowRect();
    const root = document.querySelector(".c7t-sheet");
    if (!root) return { items: out, page: null };
    const page = {
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };

    const candidates = [root, ...root.querySelectorAll("*")];
    for (const el of candidates) {
      if (out.length >= OVERFLOW_CAP) break;
      if (!visibleElement(el)) continue;
      if (ICON_TAGS.has(el.tagName) || el.tagName === "IMG") continue;
      // input/textarea 的 scrollWidth 宽于 clientWidth 是输入框内部正常滚动，不是视觉裁切
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") continue;
      const cs = getComputedStyle(el);
      const scrollW = el.scrollWidth;
      const clientW = el.clientWidth;
      const delta = scrollW - clientW;
      const rect = el.getBoundingClientRect();
      const decorative =
        getComputedStyle(el).opacity < 0.16 ||
        el.closest(".c7t-banner-art") ||
        el.closest("[aria-hidden='true']");
      // 内容区本身是纵向滚动容器，超出窗口底部属于正常滚动；这里只把「横向探出窗口」当成错位。
      const outsideWindow = win && !decorative ? rect.right > win.right + 1 || rect.left < win.left - 1 : false;
      const clipped = decorative ? null : overflowAncestor(rect, el);
      const truncated = delta > 1 && (cs.textOverflow === "ellipsis" || cs.overflowX === "hidden" || cs.overflowX === "clip") && (el.textContent ?? "").trim().length > 0;
      if (delta <= 1 && !outsideWindow && !clipped) continue;
      if (delta <= 2 && !outsideWindow && !clipped && !truncated) continue;
      out.push({
        sel: cssPath(el),
        text: snippet(el.textContent ?? ""),
        tag: el.tagName.toLowerCase(),
        scrollWidth: scrollW,
        clientWidth: clientW,
        delta,
        overflowX: cs.overflowX,
        textOverflow: cs.textOverflow,
        truncated,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        outsideWindow,
        clipped,
      });
    }
    return { items: out, page };
  }

  function collectImages() {
    const items = [];
    for (const img of document.querySelectorAll("img")) {
      if (items.length >= IMAGE_CAP) break;
      const rect = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      items.push({
        sel: cssPath(img),
        src: img.getAttribute("src") ?? "",
        alt: img.getAttribute("alt") ?? "",
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete,
        filter: cs.filter,
        visible: cs.display !== "none" && rect.width > 0 && rect.height > 0,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });
    }
    const brokenSymbols = [];
    for (const use of document.querySelectorAll("use[href], use[xlink\\:href]")) {
      const href = use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "";
      if (!href.startsWith("#")) continue;
      if (!document.querySelector(href)) {
        brokenSymbols.push({ href, owner: cssPath(use) });
      }
    }
    return { items, brokenSymbols };
  }

  const FOREIGN_FONT_RE = /(Signika|Modesto|Amiri|Roboto\b|Font Awesome|FontAwesome)/i;

  function collectWidgets() {
    const root = document.querySelector(".c7t-sheet");
    if (!root) return [];
    const out = [];
    for (const el of root.querySelectorAll("button, input, select, textarea")) {
      if (out.length >= WIDGET_CAP) break;
      if (!visibleElement(el)) continue;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const reasons = [];
      const tag = el.tagName.toLowerCase();
      if (tag === "button" && cs.appearance !== "none") reasons.push("button 仍使用原生 appearance");
      if (FOREIGN_FONT_RE.test(cs.fontFamily) && !/C7T/i.test(cs.fontFamily)) reasons.push("命中 Foundry 核心字体栈");
      if (tag === "button" && Math.abs(rect.height) > 0 && px(cs.lineHeight) > rect.height + 2 && el.textContent?.trim()) reasons.push("行高大于按钮高度");
      if (tag !== "button" && cs.appearance !== "none" && el.type !== "text" && el.type !== "number" && el.type !== "search" && el.type !== "textarea") {
        if (el.type === "checkbox" || el.type === "radio" || tag === "select") reasons.push("控件仍使用原生 appearance");
      }
      // 注：CSS 已内联到 HTML，曾经出现的「白底原生按钮」属于截图竞态假象，
      // 不再作为规则；这里只保留 appearance / 字体栈这类可核实的启发式。
      out.push({
        sel: cssPath(el),
        tag,
        type: el.type ?? "",
        text: snippet(el.textContent || el.value || ""),
        appearance: cs.appearance,
        fontFamily: cs.fontFamily,
        fontSize: px(cs.fontSize),
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        backgroundImage: cs.backgroundImage.slice(0, 64),
        borderRadius: cs.borderRadius,
        reasons,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });
    }
    return out;
  }

  function collectFonts() {
    const families = new Map();
    for (const face of document.fonts) {
      const key = `${face.family}|${face.weight}|${face.style}`;
      const prev = families.get(key);
      families.set(key, { family: face.family, weight: face.weight, style: face.style, status: face.status, loaded: face.status === "loaded" || (prev?.loaded ?? false) });
    }
    const checks = {};
    for (const family of ["C7T Cinzel", "C7T Condensed", "C7T Garamond"]) {
      checks[family] = document.fonts.check(`16px "${family}"`);
    }
    // 用了自定义字体且已加载失败的文本元素
    const missing = [];
    const seen = new Set();
    for (const el of document.querySelectorAll(".c7t-sheet *")) {
      if (!visibleElement(el)) continue; // 隐藏 tab 不触发字体加载，不是缺陷
      // 纯中文文本本来就走 CJK 回退字体，不会加载拉丁字体；只有含拉丁字符的文本才要求字体已加载。
      if (!/[A-Za-z0-9]/.test(el.textContent ?? "")) continue;
      const cs = getComputedStyle(el);
      const first = (cs.fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
      if (!first.startsWith("C7T")) continue;
      // 必须带上 style / weight：C7T Garamond 的 italic 是单独的 @font-face，
      // 用 normal 规格去 check italic 文本会误报「字体缺失」。
      const spec = `${cs.fontStyle === "italic" ? "italic " : ""}${cs.fontWeight} ${cs.fontSize} "${first}"`;
      if (document.fonts.check(spec)) continue;
      const key = `${first}|${cs.fontSize}|${cssPath(el)}`;
      if (seen.has(key) || missing.length > 40) continue;
      seen.add(key);
      missing.push({ family: first, fontSize: px(cs.fontSize), sel: cssPath(el), text: snippet(el.textContent ?? "").slice(0, 24) });
    }
    const iconFonts = [...document.fonts]
      .filter((face) => /awesome/i.test(face.family))
      .map((face) => ({ family: face.family, weight: face.weight, status: face.status }));
    return { families: [...families.values()], checks, missing, iconFonts };
  }

  function collectTabs() {
    const nav = [...document.querySelectorAll(".c7t-tabs .c7t-tab")];
    const sections = [...document.querySelectorAll(".c7t-content > .tab")];
    const active = sections.find((section) => section.classList.contains("active"));
    return {
      nav: nav.map((entry) => ({
        id: entry.dataset.tab ?? "",
        label: snippet(entry.textContent ?? ""),
        active: entry.classList.contains("active"),
        rect: (() => {
          const rect = entry.getBoundingClientRect();
          return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        })(),
      })),
      sections: sections.map((section) => ({
        id: section.dataset.tab ?? "",
        active: section.classList.contains("active"),
        childCount: section.children.length,
        rect: (() => {
          const rect = section.getBoundingClientRect();
          return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        })(),
      })),
      activeId: active?.dataset.tab ?? "",
    };
  }

  function rectOf(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }

  function collectLayout() {
    const groups = [
      ".c7t-vitals > *",
      ".c7t-abilities > *",
      ".c7t-tabs > *",
      ".c7t-banner-foot > *",
      ".c7t-banner-inner > *",
      ".c7t-body > *",
      ".c7t-section-head, .c7t-group-head",
    ];
    const overlaps = [];
    for (const selector of groups) {
      const els = [...document.querySelectorAll(selector)].filter(visibleElement);
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          const a = els[i].getBoundingClientRect();
          const b = els[j].getBoundingClientRect();
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w <= 0 || h <= 0) continue;
          const area = w * h;
          const minArea = Math.min(a.width * a.height, b.width * b.height);
          if (area > 6 && area / Math.max(1, minArea) > 0.18) {
            overlaps.push({
              group: selector,
              a: cssPath(els[i]),
              b: cssPath(els[j]),
              overlap: { w: Math.round(w), h: Math.round(h), ratio: Number((area / Math.max(1, minArea)).toFixed(2)) },
            });
          }
        }
      }
    }
    const win = windowRect();
    const banner = rectOf(".c7t-banner");
    const activeTab = document.querySelector(".c7t-content > .tab.active");
    return {
      window: win ? { x: win.x, y: win.y, w: win.width, h: win.height } : null,
      sheet: rectOf(".c7t-sheet"),
      banner: banner ? { ...banner, ratio: win ? Number((banner.h / win.height).toFixed(2)) : null } : null,
      body: rectOf(".c7t-body"),
      content: rectOf(".c7t-content"),
      sidebar: rectOf(".c7t-sidebar"),
      activeTab: activeTab
        ? {
            id: activeTab.dataset.tab ?? "",
            rect: (() => {
              const rect = activeTab.getBoundingClientRect();
              return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
            })(),
            childCount: activeTab.children.length,
          }
        : null,
      overlaps,
    };
  }

  function collectClasses() {
    const root = document.querySelector(".c7t-sheet");
    if (!root) return { lowVitals: [], activeChips: [], chips: [], formula: false, compact: false, gm: false, editControls: 0 };
    const chips = [...root.querySelectorAll(".c7t-chip")].map((chip) => ({
      text: snippet(chip.textContent ?? ""),
      active: chip.classList.contains("is-active"),
      classes: chip.className.toString().slice(0, 80),
    }));
    return {
      lowVitals: [...root.querySelectorAll(".c7t-vital.is-low")].map((vital) => ({
        text: snippet(vital.textContent ?? ""),
        classes: vital.className.toString().slice(0, 80),
      })),
      activeChips: chips.filter((chip) => chip.active),
      chips,
      formula: root.classList.contains("is-formula"),
      compact: root.classList.contains("is-compact"),
      gm: root.classList.contains("is-gm"),
      editControls: root.querySelectorAll("input[name='name'], input[name^='system.'], textarea, select").length,
      groupHeads: root.querySelectorAll(".c7t-group-head").length,
      toggleGroups: root.querySelectorAll("[data-action='toggleGroup']").length,
      emptyStates: root.querySelectorAll(".c7t-empty, .c7t-group-empty, [class*='empty']").length,
    };
  }

  function collectMeta() {
    const win = document.querySelector(".c7t-window");
    const dataset = win?.dataset ?? {};
    return {
      url: location.href,
      title: document.title,
      sheet: dataset.c7tSheet ?? "",
      tab: dataset.c7tTab ?? "",
      viewer: dataset.c7tViewer ?? "",
      state: dataset.c7tState ?? "",
      theme: document.documentElement.dataset.theme ?? "",
      width: Number(dataset.c7tWidth ?? 0),
      height: Number(dataset.c7tHeight ?? 0),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      isGM: Boolean(document.querySelector(".c7t-sheet.is-gm")),
      isCompact: Boolean(document.querySelector(".c7t-sheet.is-compact")),
      isFormula: Boolean(document.querySelector(".c7t-sheet.is-formula")),
      isEditing: Boolean(document.querySelector(".c7t-sheet input[name='name'], .c7t-sheet input[name^='system.']")),
    };
  }

  window.__c7tAuditCollect = () => {
    const overflow = collectOverflow();
    return {
      meta: collectMeta(),
      text: collectText(),
      overflow: overflow.items,
      page: overflow.page,
      classes: collectClasses(),
      images: collectImages(),
      widgets: collectWidgets(),
      fonts: collectFonts(),
      tabs: collectTabs(),
      layout: collectLayout(),
    };
  };

  /**
   * 只把「承载文字的元素」的文字颜色置为透明（inline !important），
   * 保留背景、图片、边框与装饰不变，这样截图像素就是真实的文字背景。
   * 输入框的显示值不是文本节点，单独处理。
   */
  window.__c7tAuditHideText = () => {
    const root = document.querySelector(".c7t-sheet");
    if (!root) return false;
    const targets = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement) targets.add(node.parentElement);
    }
    for (const el of root.querySelectorAll("input, textarea, select")) targets.add(el);
    for (const el of targets) {
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("-webkit-text-fill-color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
    }
    return targets.size;
  };
})();
