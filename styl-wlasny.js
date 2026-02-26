(function () {
  const STYLE_CUSTOM = "styl_wlasny";
  const DATA_URL = "https://raw.githubusercontent.com/MasterMM2025/masterzamowienia/main/baza%20danych%20-%20rumunia.json";

  let cachedProducts = null;
  let loadingPromise = null;
  const SEARCH_RENDER_LIMIT = 300;
  const IMAGE_BUCKET_BASE = "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/";
  const IMAGE_FOLDER = "zdjecia - World food";
  const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
  const DIRECT_CUSTOM_MODULE_MODE = true; // testowy tryb: moduł rysowany bez redraw z importdanych.js
  const PRICE_BADGE_STYLE_OPTIONS = [
    { id: "solid", label: "Kolor koła (domyślny)", path: "" },
    {
      id: "kolko-czerwone",
      label: "Kołko czerwone - cena",
      path: "CREATOR BASIC/katalog styl wlasny/kolko czerwone - cena.png",
      url: "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/CREATOR%20BASIC%2Fkatalog%20styl%20wlasny%2Fkolko%20czerwone%20-%20cena%20.png?alt=media&token=0fd79e26-582b-454b-bc25-b7d157c2c2b7"
    },
    { id: "kolko-czerwone-tnz", label: "Kołko czerwone TNZ - cena", path: "CREATOR BASIC/katalog styl wlasny/kolko czerwone tnz - cena.png" },
    { id: "kolko-granatowe", label: "Kołko granatowe - cena", path: "CREATOR BASIC/katalog styl wlasny/kolko granatowe - cena.png" },
    { id: "kolko-granatowe-bez-ramki", label: "Kołko granatowe bez ramki - cena", path: "CREATOR BASIC/katalog styl wlasny/kolko granatowe bez ramki - cena.png" }
  ];
  let currentPreviewProduct = null;
  let currentPreviewImageUrl = null;
  let currentPickerProduct = null;
  let currentPickerImageUrl = null;
  const customNameOverrides = new Map();
  const customImageOverrides = new Map();
  const customResolvedImageUrls = new Map();
  const customImageMetaCache = new Map();
  const customBadgeImageCache = new Map();
  let customDirectModuleSeq = 0;
  let directModuleUngroupProtectionInstalled = false;
  let directModuleStabilityWorkInProgress = false;
  let pendingPreviewExportLayouts = null;
  let isCustomPlacementActive = false;
  let customPriceCircleColor = "#d71920";
  let customPriceBadgeStyleId = "solid";
  let customPriceTextColor = "#ffffff";
  let customCurrencySymbol = "£";
  let customPriceTextScale = 1;
  const CUSTOM_FONT_OPTIONS = [
    "Arial",
    "Helvetica",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
    "Georgia",
    "Times New Roman",
    "Courier New"
  ];
  let customMetaFontFamily = "Arial";
  let customMetaTextColor = "#1f3560";
  let customMetaTextBold = true;
  let customMetaTextUnderline = false;
  let customMetaTextAlign = "left";
  let customPriceFontFamily = "Arial";
  let customPriceTextBold = true;
  let customPriceTextUnderline = false;
  let customPriceTextAlign = "left";
  let customDraftModules = [];
  let customDraftModuleSeq = 0;
  let familyBaseProduct = null;
  let familyBaseImageUrl = null;
  let currentFamilyProducts = [];
  const customPreviewVisibility = {
    showFlag: false,
    showBarcode: false
  };

// =====================================================
// RĘCZNA KONFIGURACJA UKŁADU ZDJĘĆ (EDYTUJ TUTAJ)
// =====================================================
// Wartości są w proporcjach 0..1 względem obszaru zdjęcia modułu.
// x,y - pozycja lewego górnego rogu; w,h - szerokość/wysokość.
const CUSTOM_PRODUCT_LAYOUTS = {
  defaults: {
    single: [
      { x: 0.02, y: 0.02, w: 0.96, h: 0.96 }
    ],
    family2: [
      { x: 0.00, y: 0.00,  w: 1.00, h: 0.50 },   // 50% + 50% = idealny podział bez dziury
      { x: 0.00, y: 0.50,  w: 1.00, h: 0.50 }
    ],
    family3: [
      { x: 0.00, y: 0.00, w: 0.48, h: 0.32 },
      { x: 0.52, y: 0.00, w: 0.48, h: 0.32 },
      { x: 0.00, y: 0.34, w: 1.00, h: 0.66 }
    ],
    family4: [
      { x: 0.00, y: 0.00, w: 0.49, h: 0.49 },
      { x: 0.51, y: 0.00, w: 0.49, h: 0.49 },
      { x: 0.00, y: 0.51, w: 0.49, h: 0.49 },
      { x: 0.51, y: 0.51, w: 0.49, h: 0.49 }
    ]
  },
  byMergedIndex: {
    "29552,29554": [
      { x: 0.00, y: 0.00,  w: 1.00, h: 0.50 },
      { x: 0.00, y: 0.50,  w: 1.00, h: 0.50 }
    ]
  },
  byBaseIndex: {
    // opcjonalnie możesz tu dodać dla pojedynczego indeksu
  }
};
  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeIndexKey(value) {
    return String(value || "")
      .split(",")
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort((a, b) => a.localeCompare(b, "pl", { numeric: true, sensitivity: "base" }))
      .join(",");
  }

  function clamp01(n, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(0, Math.min(1, v));
  }

  function sanitizeImageLayouts(layouts, fallbackLayouts) {
    const src = Array.isArray(layouts) && layouts.length ? layouts : fallbackLayouts;
    return (Array.isArray(src) ? src : []).map((item) => ({
      x: clamp01(item?.x, 0),
      y: clamp01(item?.y, 0),
      w: clamp01(item?.w, 0.76),
      h: clamp01(item?.h, 1)
    }));
  }

  function getExplicitCustomLayoutFor(baseIndex, mergedIndex) {
    const keyMerged = normalizeIndexKey(mergedIndex);
    const keyBase = String(baseIndex || "").trim();
    const fromMerged = (CUSTOM_PRODUCT_LAYOUTS.byMergedIndex || {})[keyMerged];
    const fromBase = (CUSTOM_PRODUCT_LAYOUTS.byBaseIndex || {})[keyBase];
    return fromMerged || fromBase || null;
  }

  function cacheImageMeta(url, width, height) {
    const key = String(url || "").trim();
    const w = Number(width);
    const h = Number(height);
    if (!key || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    customImageMetaCache.set(key, {
      width: w,
      height: h,
      aspect: w / h
    });
  }

  function getImageAspectFromCache(url) {
    const key = String(url || "").trim();
    const meta = key ? customImageMetaCache.get(key) : null;
    const aspect = meta && Number(meta.aspect);
    return Number.isFinite(aspect) && aspect > 0 ? aspect : null;
  }

  function resolveCustomImageLayouts(baseIndex, mergedIndex, familyCount) {
    const keyMerged = normalizeIndexKey(mergedIndex);
    const keyBase = String(baseIndex || "").trim();
    const fromMerged = (CUSTOM_PRODUCT_LAYOUTS.byMergedIndex || {})[keyMerged];
    const fromBase = (CUSTOM_PRODUCT_LAYOUTS.byBaseIndex || {})[keyBase];

    let fallback = CUSTOM_PRODUCT_LAYOUTS.defaults.single;
    if (familyCount >= 4) fallback = CUSTOM_PRODUCT_LAYOUTS.defaults.family4;
    else if (familyCount === 3) fallback = CUSTOM_PRODUCT_LAYOUTS.defaults.family3;
    else if (familyCount === 2) fallback = CUSTOM_PRODUCT_LAYOUTS.defaults.family2;

    return sanitizeImageLayouts(fromMerged || fromBase, fallback);
  }

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function preloadImageUrl(url, timeoutMs = 1600) {
    const src = String(url || "").trim();
    if (!src) return Promise.resolve(false);
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(!!ok);
      };
      const timer = setTimeout(() => finish(false), Math.max(250, timeoutMs));
      img.onload = () => {
        cacheImageMeta(src, img.naturalWidth || img.width, img.naturalHeight || img.height);
        finish(true);
      };
      img.onerror = () => finish(false);
      img.src = src;
    });
  }

  async function preloadImageUrls(urls, timeoutMs = 1600) {
    const list = Array.from(
      new Set((Array.isArray(urls) ? urls : []).map((v) => String(v || "").trim()).filter(Boolean))
    );
    if (!list.length) return;
    await Promise.allSettled(list.map((u) => preloadImageUrl(u, timeoutMs)));
  }

  function buildSafeFamily2LayoutsFromImageMeta(urls) {
    const list = Array.isArray(urls) ? urls.slice(0, 2) : [];
    if (list.length < 2) return null;

    // importdanych.js skaluje rodzinę po szerokości ramki.
    // Dobieramy wspólną szerokość (jeden pionowy słupek), aby oba zdjęcia były w jednej linii.
    const boxAspectSafe = 0.95; // konserwatywne H/W dla layout6/layout8
    const rowHeight = 0.5;
    const verticalPad = 0.012;
    const topY = verticalPad;
    const bottomY = rowHeight + verticalPad;
    const usableH = rowHeight - verticalPad * 2;

    const widths = list.map((url) => {
      const aspect = Math.max(0.22, Math.min(3.6, getImageAspectFromCache(url) || 1));
      const safeWidth = usableH * boxAspectSafe * aspect * 0.96;
      return Math.max(0.22, Math.min(0.96, safeWidth));
    });

    const sharedW = Math.max(0.22, Math.min(0.96, Math.min(...widths)));
    const sharedX = (1 - sharedW) / 2;

    return list.map((_url, idx) => ({
      x: sharedX,
      y: idx === 0 ? topY : bottomY,
      w: sharedW,
      h: usableH
    }));
  }

  function shouldUsePreviewSnapshotLayouts(baseIndex, mergedIndex, familyCount) {
    if (familyCount <= 1) return false;
    if (familyCount === 2 && !getExplicitCustomLayoutFor(baseIndex, mergedIndex)) return false;
    return true;
  }

  function readRenderedImageLayoutsFromPreviewTrack(expectedCount) {
    const track = document.getElementById("customPreviewImagesTrack");
    if (!track) return null;
    const trackRect = track.getBoundingClientRect();
    if (!trackRect || trackRect.width < 4 || trackRect.height < 4) return null;

    const imgEls = Array.from(track.querySelectorAll("img"));
    if (!imgEls.length) return null;
    if (Number.isFinite(expectedCount) && expectedCount > 0 && imgEls.length < expectedCount) return null;

    const result = [];
    for (const imgEl of imgEls) {
      const rect = imgEl.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;

      const naturalW = imgEl.naturalWidth || 0;
      const naturalH = imgEl.naturalHeight || 0;
      let drawW = rect.width;
      let drawH = rect.height;

      // Preview multi-img używa object-fit: contain + object-position: left top.
      // Zapisujemy rzeczywisty "obszar treści" obrazka, nie cały box.
      if (naturalW > 0 && naturalH > 0) {
        const ar = naturalW / naturalH;
        if (Number.isFinite(ar) && ar > 0) {
          const fitW = Math.min(rect.width, rect.height * ar);
          const fitH = fitW / ar;
          if (fitW > 0 && fitH > 0) {
            drawW = fitW;
            drawH = fitH;
          }
        }
      }

      result.push({
        x: clamp01((rect.left - trackRect.left) / trackRect.width, 0),
        y: clamp01((rect.top - trackRect.top) / trackRect.height, 0),
        w: clamp01(drawW / trackRect.width, 0.76),
        h: clamp01(drawH / trackRect.height, 1)
      });
    }

    if (Number.isFinite(expectedCount) && expectedCount > 0 && result.length < expectedCount) return null;
    return result;
  }

  function snapshotPreviewLayoutsForExport() {
    const family = Array.isArray(currentFamilyProducts) ? currentFamilyProducts : [];
    const urls = family.map((item) => String(item && item.url ? item.url : "").trim()).filter(Boolean);
    const count = Math.max(1, urls.length || 1);
    const base = getEffectivePreviewProduct();
    const indexes = family
      .map((item) => String(item && item.product && item.product.index ? item.product.index : "").trim())
      .filter(Boolean);
    if (!indexes.length && base?.index) indexes.push(String(base.index).trim());
    const mergedIndex = normalizeIndexKey(Array.from(new Set(indexes)).join(","));
    const layouts = readRenderedImageLayoutsFromPreviewTrack(count);
    pendingPreviewExportLayouts = {
      baseIndex: String(base?.index || "").trim(),
      mergedIndex,
      count,
      urls,
      layouts: Array.isArray(layouts) ? sanitizeImageLayouts(layouts, []) : null,
      capturedAt: Date.now()
    };
  }

  function buildExportImageLayouts(baseIndex, mergedIndex, familyImageUrls) {
    const urls = Array.isArray(familyImageUrls) ? familyImageUrls.filter(Boolean) : [];
    const familyCount = Math.max(1, urls.length || 1);
    const pending = pendingPreviewExportLayouts;
    if (
      shouldUsePreviewSnapshotLayouts(baseIndex, mergedIndex, familyCount) &&
      pending &&
      Array.isArray(pending.layouts) &&
      pending.layouts.length >= familyCount &&
      pending.count === familyCount &&
      String(pending.baseIndex || "") === String(baseIndex || "").trim() &&
      normalizeIndexKey(pending.mergedIndex) === normalizeIndexKey(mergedIndex)
    ) {
      return sanitizeImageLayouts(pending.layouts.slice(0, familyCount), resolveCustomImageLayouts(baseIndex, mergedIndex, familyCount));
    }

    const baseLayouts = resolveCustomImageLayouts(baseIndex, mergedIndex, familyCount);
    if (familyCount !== 2) return baseLayouts;
    if (getExplicitCustomLayoutFor(baseIndex, mergedIndex)) return baseLayouts;

    const safe2 = buildSafeFamily2LayoutsFromImageMeta(urls);
    if (!safe2 || safe2.length < 2) return baseLayouts;
    return sanitizeImageLayouts(safe2, baseLayouts);
  }

  function loadKonvaImageFromUrl(url, timeoutMs = 2600) {
    const src = String(url || "").trim();
    if (!src || !window.Konva || typeof window.Konva.Image?.fromURL !== "function") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (img) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(img || null);
      };
      const timer = setTimeout(() => finish(null), Math.max(500, timeoutMs));
      try {
        window.Konva.Image.fromURL(src, (img) => finish(img));
      } catch (_err) {
        finish(null);
      }
    });
  }

  function ensureCustomAddLoadingOverlay() {
    let styleEl = document.getElementById("customAddLoadingStyle");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "customAddLoadingStyle";
      styleEl.textContent = `
        @keyframes customAddSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleEl);
    }

    let overlay = document.getElementById("customAddLoadingOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "customAddLoadingOverlay";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "background:rgba(15,23,42,.22)",
      "z-index:1000002",
      "pointer-events:auto"
    ].join(";");
    overlay.innerHTML = `
      <div style="min-width:260px;max-width:min(90vw,420px);display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;background:#ffffff;border:1px solid #d7dfec;box-shadow:0 10px 30px rgba(0,0,0,.14);font-family:Inter,Arial,sans-serif;">
        <div style="width:18px;height:18px;border-radius:999px;border:2px solid #cbd5e1;border-top-color:#0f172a;animation:customAddSpin .8s linear infinite;flex:0 0 auto;"></div>
        <div id="customAddLoadingLabel" style="font-size:13px;font-weight:700;color:#0f172a;">Trwa dodawanie produktu...</div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showCustomAddLoading(message) {
    const overlay = ensureCustomAddLoadingOverlay();
    const label = overlay.querySelector("#customAddLoadingLabel");
    if (label) label.textContent = String(message || "Trwa dodawanie produktu...");
    overlay.style.display = "flex";
  }

  function hideCustomAddLoading() {
    const overlay = document.getElementById("customAddLoadingOverlay");
    if (overlay) overlay.style.display = "none";
  }

  function getDisplayName(product) {
    if (!product) return "";
    const override = customNameOverrides.get(product.id);
    if (typeof override === "string" && override.trim()) return override.trim();
    return product.name || "-";
  }

  function normalizeProduct(row, idx) {
    const index = String(
      row?.["index-cell"] ||
      row?.index ||
      row?.INDEKS ||
      row?.indeks ||
      ""
    ).trim();

    const name = String(
      row?.["text-decoration-none"] ||
      row?.name ||
      row?.NAZWA ||
      row?.nazwa ||
      ""
    ).trim();
    const packageValue = String(
      row?.["package-cell"] ||
      row?.package ||
      row?.PAKIET ||
      ""
    ).trim();
    const packageUnit = String(
      row?.["package-cell 2"] ||
      row?.packageUnit ||
      row?.PAKIET_JM ||
      ""
    ).trim();
    const ean = String(
      row?.["text-right 2"] ||
      row?.ean ||
      row?.EAN ||
      ""
    ).trim();
    const netto = String(
      row?.["netto-cell"] ||
      row?.netto ||
      row?.CENA ||
      ""
    ).trim();

    if (!index && !name) return null;

    return {
      id: `${index || "brak"}-${idx}`,
      index,
      name,
      packageValue,
      packageUnit,
      ean,
      netto,
      indexNorm: normalizeText(index),
      nameNorm: normalizeText(name),
      raw: row
    };
  }

  function scientificToPlain(raw) {
    const txt = String(raw || "").trim();
    if (!txt) return "";
    if (!/[eE]/.test(txt)) return txt.replace(/\D/g, "");
    const n = Number(txt);
    if (!Number.isFinite(n)) return txt.replace(/\D/g, "");
    return String(Math.round(n));
  }

  function formatPrice(nettoRaw) {
    const src = String(nettoRaw || "").trim();
    const currency = src.includes("£") ? "£" : (src.includes("€") ? "€" : "£");
    const value = parseFloat(src.replace(",", ".").replace(/[^0-9.]/g, ""));
    const safe = Number.isFinite(value) ? value : 0;
    const parts = safe.toFixed(2).split(".");
    return {
      currency,
      main: parts[0],
      dec: parts[1]
    };
  }

  function normalizeFontOption(value, fallback = "Arial") {
    const v = String(value || "").trim();
    if (!v) return fallback;
    return CUSTOM_FONT_OPTIONS.includes(v) ? v : fallback;
  }

  function normalizeAlignOption(value, fallback = "left") {
    const v = String(value || "").trim().toLowerCase();
    if (v === "left" || v === "center" || v === "right") return v;
    return fallback;
  }

  function boolAttrToFlag(value) {
    return value === true || value === "true" || value === 1 || value === "1";
  }

  function buildKonvaFontStyle({ bold = false, italic = false } = {}) {
    if (bold && italic) return "bold italic";
    if (bold) return "bold";
    if (italic) return "italic";
    return "normal";
  }

  function getEffectiveCurrencySymbol(productLike, fallbackSymbol = "£") {
    const saved = String(productLike?.PRICE_CURRENCY_SYMBOL || "").trim();
    if (saved === "€" || saved === "£") return saved;
    if (customCurrencySymbol === "€" || customCurrencySymbol === "£") return customCurrencySymbol;
    return fallbackSymbol === "€" ? "€" : "£";
  }

  function buildPackageInfoText(product) {
    if (!product) return "";
    const unit = String(product.packageUnit || "").trim().toLowerCase();
    const value = String(product.packageValue || "").trim();
    if (unit === "kg") return "produkt na wagę";
    if (unit === "szt" && value) return `opak. ${value}`;
    return "";
  }

  function isWeightProduct(productLike) {
    const unit = String(
      productLike?.packageUnit ||
      productLike?.CUSTOM_PACKAGE_UNIT ||
      productLike?.JEDNOSTKA ||
      ""
    ).trim().toLowerCase();
    return unit === "kg";
  }

  function nextDirectModuleId() {
    customDirectModuleSeq += 1;
    return `direct-module-${Date.now()}-${customDirectModuleSeq}`;
  }

  function moveNodeToParentPreserveAbsolute(node, parent) {
    if (!node || !parent || typeof node.moveTo !== "function") return;
    const abs = typeof node.getAbsolutePosition === "function" ? node.getAbsolutePosition() : null;
    node.moveTo(parent);
    if (abs && typeof node.absolutePosition === "function") {
      node.absolutePosition(abs);
    } else if (abs && typeof node.setAbsolutePosition === "function") {
      node.setAbsolutePosition(abs);
    }
  }

  function bakeGroupTransformToChildren(group) {
    if (!group || !group.getChildren) return false;
    const sx = Number(group.scaleX?.() || 1);
    const sy = Number(group.scaleY?.() || 1);
    const rot = Number(group.rotation?.() || 0);
    const needsBake =
      Math.abs(sx - 1) > 0.0001 ||
      Math.abs(sy - 1) > 0.0001 ||
      Math.abs(rot) > 0.0001;
    if (!needsBake) return false;

    const children = Array.from(group.getChildren());
    const snapshots = children.map((child) => {
      const absPos = child.getAbsolutePosition ? child.getAbsolutePosition() : null;
      const absScale = child.getAbsoluteScale ? child.getAbsoluteScale() : { x: child.scaleX?.() || 1, y: child.scaleY?.() || 1 };
      const absRot = child.getAbsoluteRotation ? child.getAbsoluteRotation() : (child.rotation?.() || 0);
      return { child, absPos, absScale, absRot };
    });

    group.scaleX?.(1);
    group.scaleY?.(1);
    group.rotation?.(0);

    snapshots.forEach(({ child, absPos, absScale, absRot }) => {
      if (!child || (typeof child.isDestroyed === "function" && child.isDestroyed())) return;
      try {
        if (absPos) {
          if (typeof child.absolutePosition === "function") child.absolutePosition(absPos);
          else if (typeof child.setAbsolutePosition === "function") child.setAbsolutePosition(absPos);
        }
        if (absScale && typeof child.scaleX === "function" && typeof child.scaleY === "function") {
          if (Number.isFinite(absScale.x)) child.scaleX(absScale.x);
          if (Number.isFinite(absScale.y)) child.scaleY(absScale.y);
        }
        if (Number.isFinite(absRot) && typeof child.rotation === "function") child.rotation(absRot);
      } catch (_err) {}
    });
    return true;
  }

  function normalizeDirectModuleGroupTransformsOnPage(page) {
    if (!page || !page.layer || !window.Konva) return;
    const layer = page.layer;
    const groups = layer.find((n) =>
      n instanceof window.Konva.Group &&
      n.getAttr &&
      n.getAttr("isDirectCustomModuleGroup")
    );
    groups.forEach((group) => {
      bakeGroupTransformToChildren(group);
    });

    layer.batchDraw?.();
    page.transformerLayer?.batchDraw?.();
  }

  function restoreDirectModuleNodeSelectabilityOnPage(page) {
    if (!page || !page.layer || !window.Konva) return;
    const layer = page.layer;
    const directNodes = layer.find((n) => n && n.getAttr && !!n.getAttr("directModuleId"));
    directNodes.forEach((node) => {
      if (!node || (typeof node.isDestroyed === "function" && node.isDestroyed())) return;
      const parent = node.getParent ? node.getParent() : null;
      const parentIsUserGroup = !!(parent && parent.getAttr && parent.getAttr("isUserGroup"));
      const isTopLevel = parent === layer;
      const selectableType =
        node instanceof window.Konva.Text ||
        node instanceof window.Konva.Image ||
        node instanceof window.Konva.Group;

      // Po "Rozgrupuj" elementy direct wracają jako top-level i muszą być znowu
      // normalnie zaznaczalne (także box-select). Nie ruszamy dzieci siedzących w userGroup.
      if (!parentIsUserGroup && selectableType) {
        if (typeof node.listening === "function") node.listening(true);
        if (isTopLevel && typeof node.draggable === "function") node.draggable(true);
        if (node.setAttr) node.setAttr("selectable", true);
      }

      // Teksty wewnątrz priceGroup nie powinny stać się niezależnie draggable po ungroup.
      if (parent && parent.getAttr && parent.getAttr("isPriceGroup") && typeof node.draggable === "function") {
        node.draggable(false);
      }
    });
  }

  function collectDirectModuleTopLevelNodes(page, directModuleId) {
    if (!page || !page.layer || !directModuleId) return [];
    const layer = page.layer;
    return layer.find((n) => {
      if (!n || !n.getAttr) return false;
      if (String(n.getAttr("directModuleId") || "") !== String(directModuleId)) return false;
      if (n.getParent && n.getParent() !== layer) return false;
      return (
        n instanceof window.Konva.Text ||
        n instanceof window.Konva.Image ||
        n instanceof window.Konva.Group
      );
    });
  }

  function collectDirectModuleIdsFromSelectionDeep(selection) {
    const ids = new Set();
    const visit = (node) => {
      if (!node || (typeof node.isDestroyed === "function" && node.isDestroyed())) return;
      if (node.getAttr) {
        const id = String(node.getAttr("directModuleId") || "").trim();
        if (id) ids.add(id);
      }
      if (node.getChildren) {
        try { node.getChildren().forEach(visit); } catch (_err) {}
      }
    };
    (Array.isArray(selection) ? selection : []).forEach(visit);
    return ids;
  }

  function selectionContainsDirectNodes(selection) {
    return collectDirectModuleIdsFromSelectionDeep(selection).size > 0;
  }

  function bakeSelectedUserGroupTransformsBeforeUngroup(page, selection) {
    if (!page || !window.Konva) return;
    const groups = (Array.isArray(selection) ? selection : []).filter((n) =>
      n instanceof window.Konva.Group &&
      n.getAttr &&
      n.getAttr("isUserGroup")
    );
    groups.forEach((group) => {
      if (!group || !group.find) return;
      const hasDirectDesc = !!group.findOne((n) => n && n.getAttr && !!n.getAttr("directModuleId"));
      if (!hasDirectDesc) return;
      bakeGroupTransformToChildren(group);
    });
  }

  function selectDirectModuleNodes(page, directModuleId) {
    if (!page || !directModuleId || !window.Konva) return false;
    const nodes = collectDirectModuleTopLevelNodes(page, directModuleId);
    if (!nodes.length) return false;
    page.selectedNodes = nodes;
    page.transformer?.nodes?.(nodes);
    page.layer?.find?.(".selectionOutline")?.forEach?.((n) => n.destroy?.());
    // importdanych rysuje outline własną funkcją; tutaj robimy minimum, żeby zaznaczenie było aktywne.
    page.layer?.batchDraw?.();
    page.transformerLayer?.batchDraw?.();
    return true;
  }

  function patchPageUngroupForDirectModules(page) {
    if (!page || typeof page.ungroupSelectedNodes !== "function") return;
    if (page._customDirectUngroupPatched) return;
    const originalUngroup = page.ungroupSelectedNodes.bind(page);
    page.ungroupSelectedNodes = function patchedUngroupSelectedNodes(...args) {
      const beforeSelection = Array.isArray(page.selectedNodes) ? page.selectedNodes.slice() : [];
      if (selectionContainsDirectNodes(beforeSelection)) {
        bakeSelectedUserGroupTransformsBeforeUngroup(page, beforeSelection);
      }
      const beforeIds = collectDirectModuleIdsFromSelectionDeep(beforeSelection);
      const out = originalUngroup(...args);
      try {
        restoreDirectModuleNodeSelectabilityOnPage(page);
        const afterIds = collectDirectModuleIdsFromSelectionDeep(page.selectedNodes);
        const targetId = Array.from(afterIds)[0] || Array.from(beforeIds)[0] || "";
        if (targetId) selectDirectModuleNodes(page, targetId);
        page.layer?.batchDraw?.();
        page.transformerLayer?.batchDraw?.();
      } catch (_err) {}
      return out;
    };
    page._customDirectUngroupPatched = true;
  }

  function ensureDirectModuleUngroupProtectionInstalled() {
    if (directModuleUngroupProtectionInstalled) return;
    directModuleUngroupProtectionInstalled = true;
    window.addEventListener("canvasModified", () => {
      if (directModuleStabilityWorkInProgress) return;
      directModuleStabilityWorkInProgress = true;
      try {
        const pages = Array.isArray(window.pages) ? window.pages : [];
        pages.forEach((p) => {
          patchPageUngroupForDirectModules(p);
          normalizeDirectModuleGroupTransformsOnPage(p);
          restoreDirectModuleNodeSelectabilityOnPage(p);
        });
      } finally {
        setTimeout(() => { directModuleStabilityWorkInProgress = false; }, 0);
      }
    });
  }

  function getCustomModuleDimensions(page) {
    const fallbackW = 500;
    const fallbackH = 362;
    const w = (typeof BW_dynamic !== "undefined" && Number.isFinite(BW_dynamic) && BW_dynamic > 0)
      ? BW_dynamic
      : fallbackW;
    const h = (typeof BH_dynamic !== "undefined" && Number.isFinite(BH_dynamic) && BH_dynamic > 0)
      ? BH_dynamic
      : Math.round(w / 1.38);
    return { w, h };
  }

  function ensureStylWlasnyHelperScriptLoaded() {
    if (window.__stylWlasnyHelper1Loaded || document.getElementById("stylWlasnyHelper1Script")) return;
    const s = document.createElement("script");
    s.id = "stylWlasnyHelper1Script";
    s.src = "styl-wlasny-1.js";
    s.async = true;
    s.onload = () => { window.__stylWlasnyHelper1Loaded = true; };
    s.onerror = () => {};
    document.head.appendChild(s);
  }

  function makeStripFlagDataUrl() {
    const key = "ro-strip";
    if (customBadgeImageCache.has(key)) return customBadgeImageCache.get(key);
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 28;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#22409a";
    ctx.fillRect(0, 0, 100, 28);
    ctx.fillStyle = "#f3d31f";
    ctx.fillRect(100, 0, 100, 28);
    ctx.fillStyle = "#c4003a";
    ctx.fillRect(200, 0, 100, 28);
    const url = c.toDataURL("image/png");
    customBadgeImageCache.set(key, url);
    return url;
  }

  function makePriceCircleDataUrl(color) {
    const safeColor = String(color || "#d71920").trim() || "#d71920";
    const key = `circle:${safeColor}`;
    if (customBadgeImageCache.has(key)) return customBadgeImageCache.get(key);
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = 240;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = safeColor;
    ctx.beginPath();
    ctx.arc(120, 120, 118, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    const url = c.toDataURL("image/png");
    customBadgeImageCache.set(key, url);
    return url;
  }

  function buildStorageMediaUrl(objectPath) {
    const safePath = String(objectPath || "").trim();
    if (!safePath) return null;
    return `${IMAGE_BUCKET_BASE}${encodeURIComponent(safePath)}?alt=media`;
  }

  function getSelectedPriceBadgeStyleMeta() {
    return PRICE_BADGE_STYLE_OPTIONS.find((opt) => opt.id === customPriceBadgeStyleId) || PRICE_BADGE_STYLE_OPTIONS[0];
  }

  function getSelectedPriceBadgeBackgroundUrl() {
    const style = getSelectedPriceBadgeStyleMeta();
    if (!style || !style.path) return makePriceCircleDataUrl(customPriceCircleColor || "#d71920");
    return String(style.url || "").trim()
      || buildStorageMediaUrl(style.path)
      || makePriceCircleDataUrl(customPriceCircleColor || "#d71920");
  }

  function generateBarcodeDataUrl(ean) {
    const code = scientificToPlain(ean);
    if (!code) return Promise.resolve(null);
    if (typeof window.generateBarcode === "function") {
      return new Promise((resolve) => {
        try {
          window.generateBarcode(code, (url) => resolve(url || null));
        } catch (_err) {
          resolve(null);
        }
      });
    }
    if (!(window.JsBarcode)) return Promise.resolve(null);
    return Promise.resolve().then(() => {
      try {
        const c = document.createElement("canvas");
        window.JsBarcode(c, code, {
          format: "EAN13",
          width: 2.2,
          height: 50,
          displayValue: true,
          fontSize: 14,
          margin: 5,
          background: "transparent",
          lineColor: "#000"
        });
        return c.toDataURL("image/png");
      } catch (_err) {
        return null;
      }
    });
  }

  async function createKonvaImageNodeFromUrl(url) {
    const src = String(url || "").trim();
    if (!src) return null;
    const img = await loadKonvaImageFromUrl(src, 3000);
    if (img && img.setAttr) img.setAttr("originalSrc", src);
    return img || null;
  }

  function layoutImageNodeContain(node, frameX, frameY, frameW, frameH) {
    if (!node) return;
    const rawW = Number(node.width?.()) || 1;
    const rawH = Number(node.height?.()) || 1;
    const scale = Math.min(frameW / rawW, frameH / rawH);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    node.scaleX(safeScale);
    node.scaleY(safeScale);
    node.x(frameX + (frameW - rawW * safeScale) / 2);
    node.y(frameY + (frameH - rawH * safeScale) / 2);
  }

  function scaleNodeAroundCenter(node, factor) {
    if (!node || !Number.isFinite(Number(factor)) || Number(factor) <= 0 || Math.abs(Number(factor) - 1) < 0.001) return;
    const f = Number(factor);
    const rawW = Number(node.width?.() || 0);
    const rawH = Number(node.height?.() || 0);
    const oldSX = Number(node.scaleX?.() || 1);
    const oldSY = Number(node.scaleY?.() || 1);
    const oldX = Number(node.x?.() || 0);
    const oldY = Number(node.y?.() || 0);
    const cx = oldX + (rawW * oldSX) / 2;
    const cy = oldY + (rawH * oldSY) / 2;
    const nextSX = oldSX * f;
    const nextSY = oldSY * f;
    node.scaleX(nextSX);
    node.scaleY(nextSY);
    node.x(cx - (rawW * nextSX) / 2);
    node.y(cy - (rawH * nextSY) / 2);
  }

  function bindDirectPriceGroupEditor(priceGroup, page) {
    if (!priceGroup || !priceGroup.getAttr || priceGroup.getAttr("_directPriceEditorBound")) return;
    const children = priceGroup.getChildren ? priceGroup.getChildren() : [];
    const hitArea = children.find((n) => n && n.getAttr && n.getAttr("isPriceHitArea"));
    const main = children.find((n) => n && n.getAttr && n.getAttr("pricePart") === "main");
    const dec = children.find((n) => n && n.getAttr && n.getAttr("pricePart") === "dec");
    const unit = children.find((n) => n && n.getAttr && n.getAttr("pricePart") === "unit");
    if (!main || !dec || !unit) return;

    const updateHitArea = () => {
      if (!hitArea || typeof hitArea.setAttrs !== "function") return;
      const nodes = [main, dec, unit].filter(Boolean);
      const rects = nodes.map((n) => {
        try {
          return n.getClientRect({ relativeTo: priceGroup });
        } catch (_err) {
          return null;
        }
      }).filter(Boolean);
      if (!rects.length) return;
      const minX = Math.min(...rects.map((r) => r.x));
      const minY = Math.min(...rects.map((r) => r.y));
      const maxX = Math.max(...rects.map((r) => r.x + r.width));
      const maxY = Math.max(...rects.map((r) => r.y + r.height));
      const pad = 6;
      hitArea.setAttrs({
        x: minX - pad,
        y: minY - pad,
        width: Math.max(24, (maxX - minX) + pad * 2),
        height: Math.max(18, (maxY - minY) + pad * 2)
      });
    };

    const realign = () => {
      const gap = 4;
      const baseX = Number(priceGroup.getAttr?.("priceTextOffsetX"));
      const baseY = Number(priceGroup.getAttr?.("priceTextOffsetY"));
      let safeBaseX = Number.isFinite(baseX) ? baseX : (main.x?.() || 0);
      const safeBaseY = Number.isFinite(baseY) ? baseY : (main.y?.() || 0);
      const alignMode = normalizeAlignOption(priceGroup.getAttr?.("priceTextAlign") || "left", "left");
      const circleSize = Number(priceGroup.getAttr?.("priceCircleSize"));
      const circleLocalX = Number(priceGroup.getAttr?.("priceCircleLocalX"));
      const isDirectSingle = !!priceGroup.getAttr?.("isDirectSinglePriceLayout");
      const isImageBadge = !!priceGroup.getAttr?.("isImagePriceBadge");
      const priceBadgeStyleId = String(priceGroup.getAttr?.("priceBadgeStyleId") || "");
      const isTnzBadge = priceBadgeStyleId.includes("tnz");
      const isGranatBadge = priceBadgeStyleId.includes("granatowe");
      const localUnitGap = isDirectSingle ? 2 : gap;
      const mainW = Number(main.width?.() || 0);
      const decW = Number(dec.width?.() || 0);
      let unitMeasuredW = Number(unit.width?.() || 0);
      if (typeof unit.measureSize === "function") {
        const m = unit.measureSize(unit.text?.() || "");
        if (m && Number.isFinite(m.width)) unitMeasuredW = m.width;
      }
      const clusterWidth = Math.max(
        mainW,
        mainW + gap + decW,
        mainW + localUnitGap + unitMeasuredW
      );
      const fallbackCircle = Number.isFinite(circleSize) ? circleSize : 80;
      let opticalShiftX = 0;
      let opticalShiftY = 0;
      if (isDirectSingle) {
        opticalShiftX = Math.round(fallbackCircle * (isTnzBadge ? 0.245 : (isGranatBadge ? 0.135 : (isImageBadge ? 0.11 : 0.06))));
        opticalShiftY = Math.round(fallbackCircle * (isTnzBadge ? 0.068 : (isGranatBadge ? 0.05 : (isImageBadge ? 0.045 : 0.025))));
      } else if (isImageBadge) {
        opticalShiftX = Math.round(fallbackCircle * (isTnzBadge ? 0.14 : (isGranatBadge ? 0.28 : 0.16)));
        opticalShiftY = Math.round(fallbackCircle * (isTnzBadge ? 0.03 : (isGranatBadge ? 0.045 : 0.03)));
      }
      if (Number.isFinite(circleSize) && Number.isFinite(circleLocalX)) {
        const innerPad = 4;
        if (alignMode === "center") safeBaseX = circleLocalX + (circleSize - clusterWidth) / 2;
        else if (alignMode === "right") safeBaseX = circleLocalX + circleSize - clusterWidth - innerPad;
        else safeBaseX = circleLocalX + innerPad;
      }
      if ((isDirectSingle || isImageBadge) && alignMode !== "right") safeBaseX += opticalShiftX;
      main.x(safeBaseX);
      main.y(safeBaseY + opticalShiftY);
      dec.x(safeBaseX + (main.width?.() || 0) + gap);
      dec.y((safeBaseY + opticalShiftY) + (main.height?.() || 0) * 0.10);
      unit.x(safeBaseX + (main.width?.() || 0) + (isDirectSingle ? 2 : gap));
      unit.y((safeBaseY + opticalShiftY) + (dec.height?.() || 0) * (isDirectSingle ? 1.35 : 1.5));
      if (typeof unit.width === "function" && typeof unit.measureSize === "function") {
        const measured = unit.measureSize(unit.text?.() || "");
        const targetW = Math.max(isDirectSingle ? 42 : 34, Math.ceil((measured?.width || 0) + (isDirectSingle ? 10 : 6)));
        unit.width(targetW);
      }
      updateHitArea();
      page?.layer?.batchDraw?.();
      page?.transformerLayer?.batchDraw?.();
    };
    priceGroup.on("dblclick.directPriceEdit dbltap.directPriceEdit", () => {
      const current = `${main.text?.() || "0"}.${dec.text?.() || "00"}`;
      const raw = prompt("Podaj nową cenę (np. 1,49):", String(current).replace(".", ","));
      if (raw == null) return;
      const parsed = parseFloat(String(raw).replace(",", ".").replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(parsed)) return;
      const [nm, nd] = parsed.toFixed(2).split(".");
      main.text(nm);
      dec.text(nd);
      realign();
    });
    priceGroup.setAttr("_directPriceEditorBound", true);
    realign();
  }

  async function addDirectCustomModuleToPage(page, slotIndex, pointer, catalogEntry, options = {}) {
    if (!page || !page.layer || !page.stage || !window.Konva) return false;
    ensureDirectModuleUngroupProtectionInstalled();
    const layer = page.layer;
    const stage = page.stage;
    const directModuleId = nextDirectModuleId();
    const { w: moduleW, h: moduleH } = getCustomModuleDimensions(page);
    const stageW = stage.width?.() || 0;
    const stageH = stage.height?.() || 0;
    const x = Math.max(0, Math.min(Math.max(0, stageW - moduleW), (pointer?.x || 0) - moduleW / 2));
    const y = Math.max(0, Math.min(Math.max(0, stageH - moduleH), (pointer?.y || 0) - moduleH / 2));

    const pct = (px, total) => (Number(px) / 100) * total;
    const imageUrls = Array.isArray(catalogEntry?.FAMILY_IMAGE_URLS) && catalogEntry.FAMILY_IMAGE_URLS.length
      ? catalogEntry.FAMILY_IMAGE_URLS.filter(Boolean)
      : [String(options.effectiveImageUrl || "").trim()].filter(Boolean);
    const isSingleDirectLayout = imageUrls.length <= 1;
    const hasImagePriceBadge = String(catalogEntry?.PRICE_BG_STYLE_ID || customPriceBadgeStyleId || "solid") !== "solid";

    // Nowy układ direct (single): jak na przykładzie użytkownika
    // duże zdjęcie u góry, cena lewy dół, tekst po prawej od ceny.
    const imgArea = isSingleDirectLayout
      ? { x: x + pct(6, moduleW), y: y + pct(10.5, moduleH), w: pct(82, moduleW), h: pct(37, moduleH) }
      : { x: x + pct(0, moduleW), y: y + pct(4, moduleH), w: pct(48, moduleW), h: pct(83, moduleH) };
    const nameArea = isSingleDirectLayout
      ? { x: x + pct(35, moduleW), y: y + pct(56, moduleH), w: pct(38, moduleW), h: pct(20, moduleH) }
      : { x: x + pct(49, moduleW), y: y + pct(50, moduleH), w: pct(47, moduleW), h: pct(15, moduleH) };
    const indexPos = isSingleDirectLayout
      ? { x: x + pct(35, moduleW), y: y + pct(67.8, moduleH) }
      : { x: x + pct(48.7, moduleW), y: y + pct(62, moduleH) };
    const packagePos = isSingleDirectLayout
      ? { x: x + pct(35, moduleW), y: y + pct(72.0, moduleH) }
      : { x: x + pct(48.7, moduleW), y: y + pct(65.2, moduleH) };
    const flagArea = isSingleDirectLayout
      ? { x: x + pct(35, moduleW), y: y + pct(78.8, moduleH), w: pct(18, moduleW), h: pct(2.6, moduleH) }
      : { x: x + pct(49, moduleW), y: y + pct(72, moduleH), w: pct(34, moduleW), h: pct(3, moduleH) };
    const priceArea = isSingleDirectLayout
      ? { x: x + pct(3.5, moduleW), y: y + pct(57, moduleH), s: Math.max(56, pct(hasImagePriceBadge ? 27.5 : 24, moduleW)) }
      : { x: x + pct(22, moduleW), y: y + pct(70, moduleH), s: Math.max(48, pct(18, moduleW)) };
    const barcodeArea = isSingleDirectLayout
      ? { x: x + pct(53, moduleW), y: y + pct(79.2, moduleH), w: pct(38, moduleW), h: pct(11, moduleH) }
      : { x: x + pct(40, moduleW), y: y + pct(76, moduleH), w: pct(49, moduleW), h: pct(22, moduleH) };
    const createdNodes = [];
    const addNode = (node) => {
      if (!node) return;
      layer.add(node);
      createdNodes.push(node);
    };
    const metaFontFamily = normalizeFontOption(catalogEntry?.TEXT_FONT_FAMILY || customMetaFontFamily, page.settings?.fontFamily || "Arial");
    const metaTextColor = String(catalogEntry?.TEXT_COLOR || customMetaTextColor || (isSingleDirectLayout ? "#1f3560" : "#111827"));
    const metaTextBold = boolAttrToFlag(catalogEntry?.TEXT_BOLD ?? customMetaTextBold);
    const metaTextUnderline = boolAttrToFlag(catalogEntry?.TEXT_UNDERLINE ?? customMetaTextUnderline);
    const metaTextAlign = normalizeAlignOption(catalogEntry?.TEXT_ALIGN || customMetaTextAlign, "left");
    const priceFontFamily = normalizeFontOption(catalogEntry?.PRICE_FONT_FAMILY || customPriceFontFamily, page.settings?.fontFamily || "Arial");
    const priceTextBold = boolAttrToFlag(catalogEntry?.PRICE_TEXT_BOLD ?? customPriceTextBold);
    const priceTextUnderline = boolAttrToFlag(catalogEntry?.PRICE_TEXT_UNDERLINE ?? customPriceTextUnderline);
    const priceTextAlign = normalizeAlignOption(catalogEntry?.PRICE_TEXT_ALIGN || customPriceTextAlign, "left");

    const layouts = Array.isArray(catalogEntry?.CUSTOM_IMAGE_LAYOUTS) ? catalogEntry.CUSTOM_IMAGE_LAYOUTS : [];
    for (let i = 0; i < Math.min(4, imageUrls.length); i++) {
      const kImg = await createKonvaImageNodeFromUrl(imageUrls[i]);
      if (!kImg) continue;
      const layout = layouts[i] || { x: 0.02, y: 0.02, w: 0.96, h: 0.96 };
      const frame = {
        x: imgArea.x + imgArea.w * clamp01(layout.x, 0),
        y: imgArea.y + imgArea.h * clamp01(layout.y, 0),
        w: imgArea.w * Math.max(0.05, clamp01(layout.w, 0.96)),
        h: imgArea.h * Math.max(0.05, clamp01(layout.h, 0.96))
      };
      layoutImageNodeContain(kImg, frame.x, frame.y, frame.w, frame.h);
      kImg.draggable(true);
      kImg.listening(true);
      kImg.setAttrs({
        slotIndex,
        directModuleId,
        isProductImage: true,
        familyImageIndex: i
      });
      addNode(kImg);
      if (typeof setupProductImageDrag === "function") setupProductImageDrag(kImg, layer);
      if (typeof addImageShadow === "function") addImageShadow(layer, kImg);
    }

    const nameText = new window.Konva.Text({
      x: nameArea.x,
      y: nameArea.y,
      width: nameArea.w,
      height: nameArea.h,
      text: String(catalogEntry?.NAZWA || "-"),
      fontSize: isSingleDirectLayout ? 8.4 : 10,
      lineHeight: 1.02,
      fontFamily: metaFontFamily,
      fill: metaTextColor,
      fontStyle: buildKonvaFontStyle({ bold: metaTextBold, italic: false }),
      textDecoration: metaTextUnderline ? "underline" : "",
      wrap: "word",
      align: metaTextAlign,
      draggable: true
    });
    nameText.setAttrs({ slotIndex, isProductText: true, isName: true });
    nameText.setAttr("directModuleId", directModuleId);
    addNode(nameText);
    if (typeof enableEditableText === "function") enableEditableText(nameText, page);

    const indexText = new window.Konva.Text({
      x: indexPos.x,
      y: indexPos.y,
      width: Math.max(120, nameArea.w * 0.95),
      text: String(catalogEntry?.INDEKS || "-"),
      fontSize: isSingleDirectLayout ? 12 : 8,
      lineHeight: 1.05,
      fontFamily: metaFontFamily,
      fill: metaTextColor,
      fontStyle: buildKonvaFontStyle({ bold: metaTextBold, italic: true }),
      textDecoration: metaTextUnderline ? "underline" : "",
      wrap: "none",
      align: metaTextAlign,
      draggable: true
    });
    indexText.setAttrs({ slotIndex, isProductText: true, isIndex: true });
    indexText.setAttr("directModuleId", directModuleId);
    addNode(indexText);
    if (typeof enableEditableText === "function") enableEditableText(indexText, page);

    const packageInfoText = String(catalogEntry?.CUSTOM_PACKAGE_INFO_TEXT || "").trim();
    if (packageInfoText) {
      const packageNode = new window.Konva.Text({
        x: packagePos.x,
        y: packagePos.y,
        width: Math.max(120, nameArea.w * 0.95),
        text: packageInfoText,
        fontSize: isSingleDirectLayout ? 12 : 8,
        lineHeight: 1.05,
        fontFamily: metaFontFamily,
        fill: metaTextColor,
        fontStyle: buildKonvaFontStyle({ bold: metaTextBold, italic: false }),
        textDecoration: metaTextUnderline ? "underline" : "",
        wrap: "none",
        align: metaTextAlign,
        draggable: true
      });
      packageNode.setAttrs({ slotIndex, isProductText: true, isCustomPackageInfo: true });
      packageNode.setAttr("directModuleId", directModuleId);
      addNode(packageNode);
      if (typeof enableEditableText === "function") enableEditableText(packageNode, page);
    }

    if (String(catalogEntry?.KRAJPOCHODZENIA || "").trim()) {
      const flagUrl = makeStripFlagDataUrl();
      const flagImg = await createKonvaImageNodeFromUrl(flagUrl);
      if (flagImg) {
        flagImg.x(flagArea.x);
        flagImg.y(flagArea.y);
        flagImg.width(flagImg.width?.() || 300);
        flagImg.height(flagImg.height?.() || 28);
        layoutImageNodeContain(flagImg, flagArea.x, flagArea.y, flagArea.w, flagArea.h);
        flagImg.draggable(true);
        flagImg.setAttrs({ slotIndex, directModuleId, isCountryBadge: true, isOverlayElement: true });
        addNode(flagImg);
      }
    }

    const priceParts = formatPrice(catalogEntry?.CENA || "0.00");
    const priceCurrencySymbol = getEffectiveCurrencySymbol(catalogEntry, priceParts.currency);
    const priceUnitSuffix = isWeightProduct(catalogEntry) ? "KG" : "SZT.";
    const priceScale = Number.isFinite(Number(catalogEntry?.PRICE_TEXT_SCALE))
      ? Number(catalogEntry.PRICE_TEXT_SCALE)
      : 1;
    const priceColor = String(catalogEntry?.PRICE_TEXT_COLOR || "#ffffff");
    const priceTextOffsetX = Math.round(priceArea.s * (isSingleDirectLayout ? 0.16 : 0.22));
    const priceTextOffsetY = Math.round(priceArea.s * (isSingleDirectLayout ? 0.235 : 0.26));

    const priceCircleUrl = String(catalogEntry?.PRICE_BG_IMAGE_URL || "").trim() || getSelectedPriceBadgeBackgroundUrl();
    const priceBadgeStyleId = String(catalogEntry?.PRICE_BG_STYLE_ID || customPriceBadgeStyleId || "solid");
    const priceBg = await createKonvaImageNodeFromUrl(priceCircleUrl);
    if (priceBg) {
      priceBg.x(priceArea.x);
      priceBg.y(priceArea.y);
      priceBg.width(priceBg.width?.() || 240);
      priceBg.height(priceBg.height?.() || 240);
      layoutImageNodeContain(priceBg, priceArea.x, priceArea.y, priceArea.s, priceArea.s);
      if (hasImagePriceBadge && !isSingleDirectLayout) {
        const familyBadgeBoost = priceBadgeStyleId.includes("tnz")
          ? 1.14
          : (priceBadgeStyleId.includes("granatowe") ? 1.24 : 1.16);
        scaleNodeAroundCenter(priceBg, familyBadgeBoost);
      }
      // Klik ma przechodzić do powiększonego hit-area na priceGroup (tekst ceny),
      // dzięki temu łatwiej zaznaczyć cenę, ale dalej można skalować sam tekst.
      priceBg.draggable(false);
      priceBg.listening(false);
      priceBg.setAttrs({
        slotIndex,
        directModuleId,
        isOverlayElement: true,
        isDirectPriceCircleBg: true,
        selectable: false
      });
      addNode(priceBg);
    }

    const priceGroup = new window.Konva.Group({
      x: priceArea.x + priceTextOffsetX,
      y: priceArea.y + priceTextOffsetY,
      draggable: true,
      listening: true
    });
    priceGroup.setAttrs({ slotIndex, isPriceGroup: true, isPrice: true, isProductText: true });
    priceGroup.setAttr("directModuleId", directModuleId);
    if (isSingleDirectLayout) priceGroup.setAttr("isDirectSinglePriceLayout", true);
    if (hasImagePriceBadge) priceGroup.setAttr("isImagePriceBadge", true);
    priceGroup.setAttr("priceBadgeStyleId", priceBadgeStyleId);
    priceGroup.setAttr("priceTextAlign", priceTextAlign);
    priceGroup.setAttr("priceTextOffsetX", 0);
    priceGroup.setAttr("priceTextOffsetY", 0);
    priceGroup.setAttr("priceCircleSize", priceArea.s);
    priceGroup.setAttr("priceCircleLocalX", -priceTextOffsetX);

    // Lekko powiększony obszar trafienia dla tekstu ceny (nie całego koła),
    // żeby transformer nie robił ogromnej ramki.
    const priceHitPadding = 6;
    const priceHitRect = new window.Konva.Rect({
      x: -priceHitPadding,
      y: -priceHitPadding,
      width: 140,
      height: 70,
      fill: "#000000",
      opacity: 0.001,
      listening: true,
      draggable: false
    });
    priceHitRect.setAttrs({ slotIndex, directModuleId, isPriceHitArea: true });
    priceGroup.add(priceHitRect);

    const mainSize = Math.max(12, Math.round(priceArea.s * (isSingleDirectLayout ? 0.425 : 0.34) * priceScale));
    const decSize = Math.max(8, Math.round(priceArea.s * 0.12 * priceScale));
    const unitSize = Math.max(7, Math.round(priceArea.s * (isSingleDirectLayout ? 0.082 : 0.10) * priceScale));
    const mainNode = new window.Konva.Text({
      x: 0, y: 0, text: priceParts.main, fontSize: mainSize, fontStyle: "bold",
      fontFamily: priceFontFamily, fill: priceColor, lineHeight: 1,
      textDecoration: priceTextUnderline ? "underline" : ""
    });
    mainNode.setAttr("pricePart", "main");
    if (priceTextBold === false) mainNode.fontStyle("normal");
    const decNode = new window.Konva.Text({
      x: (mainNode.width?.() || 0) + 4, y: (mainNode.height?.() || 0) * 0.10,
      text: priceParts.dec, fontSize: decSize, fontStyle: "bold",
      fontFamily: priceFontFamily, fill: priceColor, lineHeight: 1,
      textDecoration: priceTextUnderline ? "underline" : ""
    });
    decNode.setAttr("pricePart", "dec");
    if (priceTextBold === false) decNode.fontStyle("normal");
    const unitNode = new window.Konva.Text({
      x: (mainNode.width?.() || 0) + (isSingleDirectLayout ? 2 : 4), y: (decNode.height?.() || 0) * (isSingleDirectLayout ? 1.35 : 1.5),
      text: `${priceCurrencySymbol} / ${priceUnitSuffix}`, fontSize: unitSize, fontStyle: "bold",
      fontFamily: priceFontFamily, fill: priceColor, lineHeight: 1,
      textDecoration: priceTextUnderline ? "underline" : "",
      width: Math.max(52, Math.round(priceArea.s * 0.62)),
      wrap: "none"
    });
    unitNode.setAttr("pricePart", "unit");
    if (priceTextBold === false) unitNode.fontStyle("normal");
    priceGroup.add(mainNode, decNode, unitNode);
    addNode(priceGroup);
    bindDirectPriceGroupEditor(priceGroup, page);

    const eanValue = String(catalogEntry?.["KOD EAN"] || "").trim();
    if (eanValue) {
      const barcodeUrl = await generateBarcodeDataUrl(eanValue);
      const barcodeNode = await createKonvaImageNodeFromUrl(barcodeUrl);
      if (barcodeNode) {
        barcodeNode.x(barcodeArea.x);
        barcodeNode.y(barcodeArea.y);
        barcodeNode.width(barcodeNode.width?.() || 240);
        barcodeNode.height(barcodeNode.height?.() || 90);
        layoutImageNodeContain(barcodeNode, barcodeArea.x, barcodeArea.y, barcodeArea.w, barcodeArea.h);
        barcodeNode.draggable(true);
        barcodeNode.setAttrs({
          slotIndex,
          directModuleId,
          isBarcode: true,
          barcodeOriginalSrc: barcodeUrl,
          barcodeColor: "#000"
        });
        addNode(barcodeNode);
      }
    }

    // Grupujemy cały moduł (bez widocznego boxa), aby można było przenosić całość jednym ruchem.
    const moduleGroup = new window.Konva.Group({
      x: 0,
      y: 0,
      draggable: true,
      listening: true
    });
    moduleGroup.setAttrs({
      isUserGroup: true,
      isAutoSlotGroup: true,
      preservedSlotIndex: slotIndex,
      slotIndex: null,
      isDirectCustomModuleGroup: true,
      directModuleId
    });
    layer.add(moduleGroup);

    createdNodes.forEach((node) => {
      if (!node) return;
      const abs = node.getAbsolutePosition ? node.getAbsolutePosition() : null;
      if (typeof node.draggable === "function") {
        node.setAttr?.("_wasDraggableBeforeUserGroup", !!node.draggable());
        node.draggable(false);
      }
      moveNodeToParentPreserveAbsolute(node, moduleGroup);
    });

    page.selectedNodes = [moduleGroup];
    page.transformer?.nodes?.([moduleGroup]);
    layer.batchDraw();
    page.transformerLayer?.batchDraw?.();
    return true;
  }

  async function loadProducts() {
    if (Array.isArray(cachedProducts)) return cachedProducts;
    if (loadingPromise) return loadingPromise;

    loadingPromise = fetch(DATA_URL, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const src = Array.isArray(json) ? json : [];
        const list = src
          .map((row, i) => normalizeProduct(row, i))
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name, "pl", { sensitivity: "base" }));
        cachedProducts = list;
        return list;
      })
      .finally(() => {
        loadingPromise = null;
      });

    return loadingPromise;
  }

  function ensureModal() {
    if (document.getElementById("customStyleModal")) return;

    const overlay = document.createElement("div");
    overlay.id = "customStyleModal";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(10,14,24,.50)",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "z-index:1000001"
    ].join(";");

    overlay.innerHTML = `
      <div style="width:min(1460px,98vw);height:min(94vh,1200px);overflow:auto;background:#fff;border-radius:16px;padding:24px 26px 24px 26px;box-shadow:0 24px 54px rgba(0,0,0,.24);font-family:Inter,Arial,sans-serif;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
          <h3 style="margin:0;font-size:15px;font-weight:800;color:#0f172a;">Kreator katalogu - styl własny</h3>
          <button id="customStyleClose" type="button" style="border:none;background:#eef2f7;color:#1f2937;font-size:24px;line-height:1;padding:8px 12px;border-radius:10px;cursor:pointer;">x</button>
        </div>

        <div style="display:grid;grid-template-columns:minmax(0,1fr) 520px;gap:16px;align-items:start;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:18px;background:#fbfdff;min-height:560px;">
            <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:8px;">1. Dodawanie produktu</div>

            <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:end;">
              <div>
                <label for="customStyleSearch" style="display:block;font-size:10px;color:#64748b;margin-bottom:6px;font-weight:500;">Wyszukiwarka (nazwa lub indeks)</label>
                <input id="customStyleSearch" type="text" placeholder="np. 29552 albo GERULA" style="width:100%;padding:6px 7px;border:1px solid #d7dfec;border-radius:10px;font-size:10px;outline:none;">
              </div>
              <div>
                <label for="customStyleSelect" style="display:block;font-size:10px;color:#64748b;margin-bottom:6px;font-weight:500;">Produkt (dropdown)</label>
                <select id="customStyleSelect" size="1" style="width:100%;padding:5px 7px;border:1px solid #d7dfec;border-radius:10px;font-size:10px;background:#fff;color:#0f172a;"></select>
              </div>
            </div>

              <div id="customStyleInfo" style="margin-top:12px;padding:8px 10px;border:1px dashed #cbd5e1;border-radius:10px;background:#fff;font-size:10px;color:#334155;min-height:70px;">
              Ładowanie produktów...
            </div>
              <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <button id="customShowFlagToggle" type="button" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;cursor:pointer;">
                  <span id="customShowFlagToggleMark" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:12px;font-weight:700;line-height:1;color:#0f172a;">✓</span>
                  Flaga
                </button>
                <button id="customShowBarcodeToggle" type="button" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;cursor:pointer;">
                  <span id="customShowBarcodeToggleMark" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:12px;font-weight:700;line-height:1;color:#0f172a;">✓</span>
                  Kod kreskowy
                </button>
                <label for="customPriceColorInput" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  Kolor ceny
                  <input id="customPriceColorInput" type="color" value="#d71920" style="width:24px;height:20px;padding:0;border:none;background:transparent;cursor:pointer;">
                </label>
                <label for="customPriceStyleSelect" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  Wybierz styl
                  <select id="customPriceStyleSelect" style="max-width:180px;padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px;background:#fff;color:#0f172a;">
                    ${PRICE_BADGE_STYLE_OPTIONS.map((opt) => `<option value="${escapeHtml(opt.id)}">${escapeHtml(opt.label)}</option>`).join("")}
                  </select>
                </label>
                <label for="customPriceTextColorInput" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  Kolor czcionki ceny
                  <input id="customPriceTextColorInput" type="color" value="#ffffff" style="width:24px;height:20px;padding:0;border:none;background:transparent;cursor:pointer;">
                </label>
                <label for="customCurrencySelect" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  Waluta
                  <select id="customCurrencySelect" style="padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px;background:#fff;color:#0f172a;">
                    <option value="£">Funt (£)</option>
                    <option value="€">Euro (€)</option>
                  </select>
                </label>
                <div style="display:inline-flex;align-items:center;gap:6px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  <span>Wielkość ceny</span>
                  <button id="customPriceSizeMinusBtn" type="button" style="width:20px;height:20px;border:1px solid #cbd5e1;background:#fff;border-radius:4px;font-size:12px;line-height:1;cursor:pointer;">-</button>
                  <span id="customPriceSizeValue" style="min-width:38px;text-align:center;font-weight:700;">100%</span>
                  <button id="customPriceSizePlusBtn" type="button" style="width:20px;height:20px;border:1px solid #cbd5e1;background:#fff;border-radius:4px;font-size:12px;line-height:1;cursor:pointer;">+</button>
                </div>
              </div>
              <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <label for="customMetaFontSelect" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  Czcionka nazwa/indeks/opak.
                  <select id="customMetaFontSelect" style="max-width:150px;padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px;background:#fff;color:#0f172a;">
                    ${CUSTOM_FONT_OPTIONS.map((font) => `<option value="${escapeHtml(font)}">${escapeHtml(font)}</option>`).join("")}
                  </select>
                </label>
                <label for="customMetaTextColorInput" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  Kolor tekstów
                  <input id="customMetaTextColorInput" type="color" value="#1f3560" style="width:24px;height:20px;padding:0;border:none;background:transparent;cursor:pointer;">
                </label>
                <button id="customMetaBoldToggle" type="button" style="border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;font-weight:700;cursor:pointer;">B</button>
                <button id="customMetaUnderlineToggle" type="button" style="border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;text-decoration:underline;cursor:pointer;">U</button>
                <label for="customMetaAlignSelect" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  Wyrównanie tekstów
                  <select id="customMetaAlignSelect" style="padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px;background:#fff;color:#0f172a;">
                    <option value="left">Lewo</option>
                    <option value="center">Środek</option>
                    <option value="right">Prawo</option>
                  </select>
                </label>
              </div>
              <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <label for="customPriceFontSelect" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  Czcionka ceny
                  <select id="customPriceFontSelect" style="max-width:150px;padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px;background:#fff;color:#0f172a;">
                    ${CUSTOM_FONT_OPTIONS.map((font) => `<option value="${escapeHtml(font)}">${escapeHtml(font)}</option>`).join("")}
                  </select>
                </label>
                <button id="customPriceBoldToggle" type="button" style="border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;font-weight:700;cursor:pointer;">B cena</button>
                <button id="customPriceUnderlineToggle" type="button" style="border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;text-decoration:underline;cursor:pointer;">U cena</button>
                <label for="customPriceAlignSelect" style="display:inline-flex;align-items:center;gap:8px;border:1px solid #d7dfec;background:#fff;color:#0f172a;border-radius:8px;padding:6px 9px;font-size:10px;">
                  Wyrównanie ceny
                  <select id="customPriceAlignSelect" style="padding:2px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px;background:#fff;color:#0f172a;">
                    <option value="left">Lewo</option>
                    <option value="center">Środek</option>
                    <option value="right">Prawo</option>
                  </select>
                </label>
              </div>
              <input id="customImageUploadInput" type="file" accept="image/*" style="display:none;">
          </div>

          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#f8fafc;">
            <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:8px;">Podgląd modułu 1:1 (styl elegancki)</div>
            <div id="customPreviewCard" style="position:relative;width:100%;aspect-ratio:1.38/1;background:#ffffff;border:1px solid #dbe4ef;border-radius:12px;overflow:hidden;">
              <div id="customPreviewImagesTrack" style="position:absolute;left:0%;top:4%;width:48%;height:83%;overflow:hidden;">
                <img id="customPreviewImage" alt="Podgląd produktu" style="width:100%;height:100%;object-fit:contain;flex:1 1 auto;min-width:0;">
              </div>
              <div id="customPreviewName" style="position:absolute;left:49%;top:50%;width:47%;font-size:10px;line-height:1.02;font-weight:600;color:#111827;text-align:left;"></div>
              <div id="customPreviewIndex" style="position:absolute;left:48.7%;top:62%;font-size:7px;font-weight:700;font-style:italic;color:#111827;"></div>
              <div id="customPreviewPackageInfo" style="position:absolute;left:48.7%;top:65.2%;font-size:7px;font-weight:600;color:#334155;"></div>
              <div id="customPreviewFlag" style="position:absolute;left:49%;top:72%;width:34%;height:3%;display:flex;border-radius:2px;overflow:hidden;border:1px solid rgba(0,0,0,.08);">
                <span style="flex:1;background:#22409a;"></span>
                <span style="flex:1;background:#f3d31f;"></span>
                <span style="flex:1;background:#c4003a;"></span>
              </div>
              <div id="customPreviewPriceCircle" style="position:absolute;left:22%;top:70%;width:84px;height:84px;border-radius:50%;background:#d71920;display:flex;align-items:center;justify-content:center;color:#fff;z-index:2;">
                <div id="customPreviewPriceRow" style="display:flex;align-items:center;gap:5px;width:100%;justify-content:flex-start;padding:0 8px;box-sizing:border-box;">
                  <div id="customPreviewPriceMain" style="font-size:32px;font-weight:800;line-height:1;">0</div>
                  <div style="display:flex;flex-direction:column;line-height:1;">
                    <span id="customPreviewPriceDec" style="font-size:12px;font-weight:700;">00</span>
                    <span id="customPreviewPriceUnit" style="font-size:9px;font-weight:700;">£ / SZT.</span>
                  </div>
                </div>
              </div>
              <div id="customPreviewBarcodeWrap" style="position:absolute;left:40%;top:76%;width:49%;height:22%;overflow:hidden;">
                <svg id="customPreviewBarcode" style="width:100%;height:100%;display:block;"></svg>
              </div>
            </div>
            <div style="margin-top:10px;display:flex;justify-content:flex-end;">
              <div style="display:flex;gap:8px;align-items:center;">
                <button
                  id="customSaveDraftBtn"
                  type="button"
                  style="border:1px solid #334155;background:#ffffff;color:#0f172a;border-radius:10px;padding:8px 12px;font-size:11px;font-weight:700;cursor:pointer;"
                >
                  Dodaj kolejny produkt (lista)
                </button>
                <button
                  id="customAddProductBtn"
                  type="button"
                  style="border:1px solid #0b8f84;background:#0fb5a8;color:#fff;border-radius:10px;padding:8px 12px;font-size:11px;font-weight:700;cursor:pointer;"
                >
                  Dodaj produkt do katalogu
                </button>
              </div>
            </div>
            <div style="margin-top:8px;display:flex;justify-content:flex-start;">
              <button id="customAddFamilyProductBtn" type="button" style="border:1px solid #334155;background:#ffffff;color:#0f172a;border-radius:8px;padding:6px 10px;font-size:10px;font-weight:700;cursor:pointer;">
                Dodaj kolejny produkt (rodzina)
              </button>
            </div>
            <div id="customFamilyStatusBox" style="margin-top:8px;padding:8px 10px;border:1px solid #d7dfec;border-radius:8px;background:#fff;color:#334155;font-size:10px;line-height:1.35;">
              <div id="customFamilyStatusLine" style="font-weight:600;">Rodzina: brak</div>
              <div id="customFamilyStatusDetails" style="margin-top:4px;color:#64748b;">Kliknij przycisk, aby ustawić produkt bazowy rodziny.</div>
            </div>
            <div style="margin-top:10px;padding:8px 10px;border:1px solid #d7dfec;border-radius:10px;background:#fff;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                <div style="font-size:10px;font-weight:700;color:#0f172a;">Lista modułów roboczych</div>
                <button id="customOpenDraftTrayBtn" type="button" style="border:1px solid #334155;background:#fff;color:#0f172a;border-radius:6px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer;">Dodaj te produkty do katalogu</button>
              </div>
              <div id="customDraftModulesList" style="display:grid;gap:8px;max-height:220px;overflow:auto;">
                <div style="font-size:10px;color:#64748b;">Brak zapisanych modułów roboczych.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
      overlay.style.display = "none";
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    const closeBtn = overlay.querySelector("#customStyleClose");
    if (closeBtn) closeBtn.addEventListener("click", close);
  }

  function renderSelect(select, list) {
    if (!select) return;
    const options = list.map((p) => {
      const label = `${p.index ? `[${p.index}] ` : ""}${p.name || "(bez nazwy)"}`;
      return `<option value="${p.id}">${label}</option>`;
    });
    select.innerHTML = options.join("");
  }

  function updateInfo(info, product, allCount, filteredCount, renderedCount) {
    if (!info) return;
    if (!product) {
      info.innerHTML = `Brak dopasowań. Łącznie produktów: <strong>${allCount}</strong>.`;
      return;
    }
    info.innerHTML = `
      <div style="display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:start;">
        <div style="border:1px solid #d7dfec;border-radius:8px;background:#fff;padding:6px;">
          <div style="font-size:10px;color:#64748b;margin-bottom:6px;">Zdjęcie</div>
          <div id="customStyleImageBox" style="width:100%;height:84px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:10px;">brak</div>
        </div>
        <div style="border:1px solid #d7dfec;border-radius:8px;background:#fff;padding:8px;">
          <div><strong>Indeks:</strong> ${product.index || "-"}</div>
          <div><strong>Nazwa:</strong>
            <span
              id="customEditableName"
              contenteditable="true"
              spellcheck="false"
              title="Kliknij, aby edytować nazwę"
              style="display:inline-block;min-width:220px;padding:1px 4px;border-radius:4px;border:1px dashed transparent;cursor:text;outline:none;"
            >${escapeHtml(getDisplayName(product))}</span>
          </div>
          <div><strong>Opakowanie:</strong> ${product.packageValue || "-"} ${product.packageUnit || ""}</div>
          <div><strong>EAN:</strong> ${product.ean || "-"}</div>
        </div>
      </div>
      <div style="margin-top:6px;color:#64748b;">Dopasowań: ${filteredCount} / ${allCount}${Number.isFinite(renderedCount) ? ` (pokazano: ${renderedCount})` : ""}</div>
    `;
  }

  function bindEditableName(product) {
    const nameEl = document.getElementById("customEditableName");
    if (!nameEl || !product) return;

    nameEl.addEventListener("focus", () => {
      nameEl.style.borderColor = "#93c5fd";
      nameEl.style.background = "#eff6ff";
    });
    nameEl.addEventListener("blur", () => {
      nameEl.style.borderColor = "transparent";
      nameEl.style.background = "transparent";
    });
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameEl.blur();
      }
    });
    nameEl.addEventListener("input", () => {
      const next = String(nameEl.textContent || "").replace(/\s+/g, " ").trim();
      if (next) customNameOverrides.set(product.id, next);
      else customNameOverrides.delete(product.id);
      if (currentPreviewProduct && currentPreviewProduct.id === product.id) {
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      }
    });
  }

  function buildImageUrl(index, ext) {
    const objectPath = `${IMAGE_FOLDER}/${String(index || "").trim()}.${ext}`;
    return `${IMAGE_BUCKET_BASE}${encodeURIComponent(objectPath)}?alt=media`;
  }

  function loadImageWithFallback(index, onReady) {
    const safeIndex = String(index || "").trim();
    if (!safeIndex) {
      onReady(null);
      return;
    }
    let i = 0;
    const tryNext = () => {
      if (i >= IMAGE_EXTENSIONS.length) {
        onReady(null);
        return;
      }
      const url = buildImageUrl(safeIndex, IMAGE_EXTENSIONS[i++]);
      const img = new Image();
      img.onload = () => {
        cacheImageMeta(url, img.naturalWidth || img.width, img.naturalHeight || img.height);
        onReady(url);
      };
      img.onerror = tryNext;
      img.src = url;
    };
    tryNext();
  }

  function getEffectivePreviewProduct() {
    return familyBaseProduct || currentPreviewProduct || null;
  }

  function getEffectivePreviewImageUrl() {
    return familyBaseProduct ? familyBaseImageUrl : currentPreviewImageUrl;
  }

  function resolveProductImageUrl(product, onReady) {
    if (!product) {
      onReady(null);
      return;
    }
    if (customImageOverrides.has(product.id)) {
      onReady(customImageOverrides.get(product.id) || null);
      return;
    }
    if (customResolvedImageUrls.has(product.id)) {
      onReady(customResolvedImageUrls.get(product.id) || null);
      return;
    }
    loadImageWithFallback(product.index, (url) => {
      customResolvedImageUrls.set(product.id, url || null);
      onReady(url || null);
    });
  }

  function renderProductImagePreview(product) {
    const box = document.getElementById("customStyleImageBox");
    if (!box) return;
    const overrideUrl = product?.id ? customImageOverrides.get(product.id) : null;
    if (overrideUrl) {
      box.innerHTML = `<img src="${overrideUrl}" alt="Zdjęcie produktu (własne)" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:7px;transition:transform .16s ease;transform-origin:center center;cursor:zoom-in;position:relative;z-index:1;">`;
      const imgEl = box.querySelector("img");
      if (imgEl) {
        imgEl.onmouseenter = () => {
          imgEl.style.transform = "scale(1.9)";
          imgEl.style.zIndex = "3";
        };
        imgEl.onmouseleave = () => {
          imgEl.style.transform = "scale(1)";
          imgEl.style.zIndex = "1";
        };
      }
      box.style.color = "#0f172a";
      currentPreviewImageUrl = overrideUrl;
      renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      return;
    }

    box.textContent = "szukam...";
    box.style.color = "#94a3b8";
    const stamp = `${product?.id || ""}-${Date.now()}`;
    box.setAttribute("data-stamp", stamp);

    loadImageWithFallback(product?.index, (url) => {
      const current = document.getElementById("customStyleImageBox");
      if (!current || current.getAttribute("data-stamp") !== stamp) return;
      if (product?.id && customImageOverrides.has(product.id)) return;
      if (!url) {
        current.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;height:100%;">
            <div style="font-size:10px;color:#94a3b8;">brak</div>
            <button id="customImportImageBtn" type="button" style="border:1px solid #0b8f84;background:#fff;color:#0b8f84;border-radius:7px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer;">Importuj zdjęcie</button>
          </div>
        `;
        current.style.color = "#94a3b8";
        currentPreviewImageUrl = null;
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
        return;
      }
      current.innerHTML = `<img src="${url}" alt="Zdjęcie produktu" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:7px;transition:transform .16s ease;transform-origin:center center;cursor:zoom-in;position:relative;z-index:1;">`;
      const imgEl = current.querySelector("img");
      if (imgEl) {
        imgEl.onmouseenter = () => {
          imgEl.style.transform = "scale(1.9)";
          imgEl.style.zIndex = "3";
        };
        imgEl.onmouseleave = () => {
          imgEl.style.transform = "scale(1)";
          imgEl.style.zIndex = "1";
        };
      }
      current.style.color = "#0f172a";
      currentPreviewImageUrl = url;
      renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
    });
  }

  function renderFamilyImagesTrack() {
    const track = document.getElementById("customPreviewImagesTrack");
    if (!track) return;
    const entries = Array.isArray(currentFamilyProducts) ? currentFamilyProducts : [];
    const base = getEffectivePreviewProduct();
    const familyIndexes = entries
      .map((item) => String(item && item.product && item.product.index ? item.product.index : "").trim())
      .filter(Boolean);
    if (!familyIndexes.length && base && base.index) familyIndexes.push(String(base.index).trim());
    const mergedIndex = normalizeIndexKey(Array.from(new Set(familyIndexes)).join(","));
    if (!entries.length) {
      track.innerHTML = `<img id="customPreviewImage" alt="Podgląd produktu" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;transform:scale(1.08);transform-origin:left top;">`;
      const imgEl = document.getElementById("customPreviewImage");
      const effectiveUrl = getEffectivePreviewImageUrl();
      if (imgEl) {
        if (effectiveUrl) imgEl.src = effectiveUrl;
        else imgEl.removeAttribute("src");
      }
      return;
    }

    if (entries.length === 1) {
      const escaped = escapeHtml(entries[0].url || "");
      track.innerHTML = `<img src="${escaped}" alt="Zdjęcie produktu 1" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;transform:scale(1.08);transform-origin:left top;">`;
      return;
    }

    const maxThumbs = 4;
    const visible = entries.slice(0, maxThumbs);
    const count = Math.max(1, visible.length);
    const layout = resolveCustomImageLayouts(base?.index, mergedIndex, count);

    // Dla układów z więcej niż jednym zdjęciem wyłączamy skalowanie (transform:scale),
    // bo powoduje ono wychodzenie miniatur poza przydzielony obszar i nakładanie się.
    const multiImgTransform = 'transform: none; transform-origin: left top;';

    track.innerHTML = visible
      .map((entry, idx) => {
        const escaped = escapeHtml(entry.url || "");
        const alt = `Zdjęcie produktu ${idx + 1}`;
        const pos = layout[idx] || layout[layout.length - 1] || { x: 0, y: 0, w: 0.76, h: 1 };
        return `<img src="${escaped}" alt="${alt}" style="position:absolute;left:${(pos.x * 100).toFixed(3)}%;top:${(pos.y * 100).toFixed(3)}%;width:${(pos.w * 100).toFixed(3)}%;height:${(pos.h * 100).toFixed(3)}%;object-fit:contain;object-position:left top;${multiImgTransform}border-radius:4px;">`;
      })
      .join("");
  }

  function updateFamilyIndexPreviewText() {
    const indexEl = document.getElementById("customPreviewIndex");
    const base = getEffectivePreviewProduct();
    if (!indexEl) return;
    const family = Array.isArray(currentFamilyProducts) ? currentFamilyProducts : [];
    const allIndexes = family
      .map((item) => String(item && item.product && item.product.index ? item.product.index : "").trim())
      .filter(Boolean);
    if (!allIndexes.length && base && base.index) allIndexes.push(String(base.index).trim());
    const uniqueIndexes = Array.from(new Set(allIndexes));
    indexEl.textContent = uniqueIndexes.length ? uniqueIndexes.join(", ") : "-";
  }

  function ensureBaseFamilyState() {
    const base = currentPreviewProduct;
    if (!base) return;
    familyBaseProduct = base;
    familyBaseImageUrl = currentPreviewImageUrl;
    currentFamilyProducts = [{
      product: base,
      url: familyBaseImageUrl || null
    }];
  }

  function updateFamilyUiStatus(message, tone = "info") {
    const btn = document.getElementById("customAddFamilyProductBtn");
    const lineEl = document.getElementById("customFamilyStatusLine");
    const detailsEl = document.getElementById("customFamilyStatusDetails");
    const boxEl = document.getElementById("customFamilyStatusBox");
    const entries = Array.isArray(currentFamilyProducts) ? currentFamilyProducts : [];
    const indexes = entries
      .map((item) => String(item && item.product && item.product.index ? item.product.index : "").trim())
      .filter(Boolean);
    const uniqueIndexes = Array.from(new Set(indexes));
    const baseIndex = String(familyBaseProduct && familyBaseProduct.index ? familyBaseProduct.index : "").trim();

    if (btn) {
      const count = uniqueIndexes.length;
      btn.textContent = !familyBaseProduct
        ? "Ustaw produkt bazowy (rodzina)"
        : `Dodaj do rodziny (${count}/4)`;
      btn.style.borderColor = familyBaseProduct ? "#0b8f84" : "#334155";
      btn.style.color = familyBaseProduct ? "#0b8f84" : "#0f172a";
      btn.style.background = familyBaseProduct ? "#f0fdfa" : "#ffffff";
    }

    if (lineEl) {
      if (!familyBaseProduct) {
        lineEl.textContent = "Rodzina: brak";
      } else {
        lineEl.textContent = `Rodzina: ${uniqueIndexes.length} produkt(y) • baza ${baseIndex || "-"}`;
      }
    }

    if (detailsEl) {
      if (message) {
        detailsEl.textContent = String(message);
      } else if (!familyBaseProduct) {
        detailsEl.textContent = "Kliknij przycisk, aby ustawić produkt bazowy rodziny.";
      } else if (uniqueIndexes.length) {
        detailsEl.textContent = `Dodane indeksy: ${uniqueIndexes.join(", ")}. Wybierz kolejny produkt z listy i kliknij przycisk.`;
      } else {
        detailsEl.textContent = "Rodzina aktywna. Wybierz kolejny produkt i kliknij przycisk.";
      }
    }

    if (boxEl) {
      let border = "#d7dfec";
      let bg = "#fff";
      if (tone === "success") {
        border = "#86efac";
        bg = "#f0fdf4";
      } else if (tone === "error") {
        border = "#fca5a5";
        bg = "#fef2f2";
      } else if (familyBaseProduct) {
        border = "#99f6e4";
        bg = "#f0fdfa";
      }
      boxEl.style.borderColor = border;
      boxEl.style.background = bg;
    }
  }

  function applyPreviewLayoutMode(isSingleDirectMode) {
    const track = document.getElementById("customPreviewImagesTrack");
    const nameEl = document.getElementById("customPreviewName");
    const indexEl = document.getElementById("customPreviewIndex");
    const packageInfoEl = document.getElementById("customPreviewPackageInfo");
    const flagEl = document.getElementById("customPreviewFlag");
    const priceCircle = document.getElementById("customPreviewPriceCircle");
    const barcodeWrap = document.getElementById("customPreviewBarcodeWrap");

    if (track) {
      if (isSingleDirectMode) {
        track.style.left = "6%";
        track.style.top = "10.5%";
        track.style.width = "82%";
        track.style.height = "37%";
      } else {
        track.style.left = "0%";
        track.style.top = "4%";
        track.style.width = "48%";
        track.style.height = "83%";
      }
      track.style.overflow = "hidden";
      track.querySelectorAll("img").forEach((img) => {
        if (!(img instanceof HTMLImageElement)) return;
        if (isSingleDirectMode) {
          img.style.transform = "none";
          img.style.transformOrigin = "center center";
          img.style.objectFit = "contain";
          img.style.objectPosition = "center center";
        } else if (!img.style.transform) {
          img.style.transform = "scale(1.08)";
          img.style.transformOrigin = "left top";
        }
      });
    }

    if (nameEl) {
      if (isSingleDirectMode) {
        nameEl.style.left = "35%";
        nameEl.style.top = "56%";
        nameEl.style.width = "38%";
        nameEl.style.fontSize = "8.4px";
        nameEl.style.fontWeight = "700";
        nameEl.style.color = "#1f3560";
      } else {
        nameEl.style.left = "49%";
        nameEl.style.top = "50%";
        nameEl.style.width = "47%";
        nameEl.style.fontSize = "10px";
        nameEl.style.fontWeight = "600";
        nameEl.style.color = "#111827";
      }
    }

    if (indexEl) {
      if (isSingleDirectMode) {
        indexEl.style.left = "35%";
        indexEl.style.top = "67.8%";
        indexEl.style.fontSize = "12px";
        indexEl.style.color = "#1f3560";
      } else {
        indexEl.style.left = "48.7%";
        indexEl.style.top = "62%";
        indexEl.style.fontSize = "7px";
        indexEl.style.color = "#111827";
      }
      indexEl.style.fontStyle = "italic";
    }

    if (packageInfoEl) {
      if (isSingleDirectMode) {
        packageInfoEl.style.left = "35%";
        packageInfoEl.style.top = "72%";
        packageInfoEl.style.fontSize = "12px";
        packageInfoEl.style.color = "#1f3560";
      } else {
        packageInfoEl.style.left = "48.7%";
        packageInfoEl.style.top = "65.2%";
        packageInfoEl.style.fontSize = "7px";
        packageInfoEl.style.color = "#334155";
      }
    }

    if (flagEl) {
      if (isSingleDirectMode) {
        flagEl.style.left = "35%";
        flagEl.style.top = "78.8%";
        flagEl.style.width = "18%";
        flagEl.style.height = "2.6%";
      } else {
        flagEl.style.left = "49%";
        flagEl.style.top = "72%";
        flagEl.style.width = "34%";
        flagEl.style.height = "3%";
      }
    }

    if (priceCircle) {
      if (isSingleDirectMode) {
        priceCircle.style.left = "3.5%";
        priceCircle.style.top = "57%";
      } else {
        priceCircle.style.left = "22%";
        priceCircle.style.top = "70%";
      }
    }

    if (barcodeWrap) {
      if (isSingleDirectMode) {
        barcodeWrap.style.left = "53%";
        barcodeWrap.style.top = "79.2%";
        barcodeWrap.style.width = "38%";
        barcodeWrap.style.height = "11%";
      } else {
        barcodeWrap.style.left = "40%";
        barcodeWrap.style.top = "76%";
        barcodeWrap.style.width = "49%";
        barcodeWrap.style.height = "22%";
      }
    }
  }

  function renderModulePreview(product, imageUrl) {
    const nameEl = document.getElementById("customPreviewName");
    const indexEl = document.getElementById("customPreviewIndex");
    const packageInfoEl = document.getElementById("customPreviewPackageInfo");
    const imageEl = document.getElementById("customPreviewImage");
    const mainEl = document.getElementById("customPreviewPriceMain");
    const decEl = document.getElementById("customPreviewPriceDec");
    const unitEl = document.getElementById("customPreviewPriceUnit");
    const priceRowEl = document.getElementById("customPreviewPriceRow");
    const barcodeEl = document.getElementById("customPreviewBarcode");
    const barcodeWrap = document.getElementById("customPreviewBarcodeWrap");
    const priceCircle = document.getElementById("customPreviewPriceCircle");
    const flagEl = document.getElementById("customPreviewFlag");

    if (!nameEl || !indexEl || !mainEl || !decEl || !unitEl || !barcodeEl) return;
    if (!product) {
      nameEl.textContent = "";
      indexEl.textContent = "";
      if (packageInfoEl) packageInfoEl.textContent = "";
      mainEl.textContent = "0";
      decEl.textContent = "00";
      unitEl.textContent = `${getEffectiveCurrencySymbol(null, "£")} / SZT.`;
      mainEl.style.color = customPriceTextColor || "#ffffff";
      decEl.style.color = customPriceTextColor || "#ffffff";
      unitEl.style.color = customPriceTextColor || "#ffffff";
      if (priceRowEl) {
        priceRowEl.style.justifyContent = customPriceTextAlign === "right" ? "flex-end" : (customPriceTextAlign === "center" ? "center" : "flex-start");
      }
      barcodeEl.innerHTML = "";
      renderFamilyImagesTrack();
      return;
    }

    renderFamilyImagesTrack();
    const isSingleDirectPreview = !!DIRECT_CUSTOM_MODULE_MODE && !(Array.isArray(currentFamilyProducts) && currentFamilyProducts.length > 1);
    applyPreviewLayoutMode(isSingleDirectPreview);
    nameEl.textContent = getDisplayName(product);
    indexEl.textContent = product.index || "-";
    if (packageInfoEl) packageInfoEl.textContent = buildPackageInfoText(product);
    if (Array.isArray(currentFamilyProducts) && currentFamilyProducts.length > 1) {
      updateFamilyIndexPreviewText();
    }

    const price = formatPrice(product.netto);
    const currencySymbol = getEffectiveCurrencySymbol(product, price.currency);
    const metaAlign = normalizeAlignOption(product?.TEXT_ALIGN || customMetaTextAlign, "left");
    const metaFont = normalizeFontOption(product?.TEXT_FONT_FAMILY || customMetaFontFamily, "Arial");
    const metaColor = String(product?.TEXT_COLOR || customMetaTextColor || "#1f3560");
    const metaBold = boolAttrToFlag(product?.TEXT_BOLD ?? customMetaTextBold);
    const metaUnderline = boolAttrToFlag(product?.TEXT_UNDERLINE ?? customMetaTextUnderline);
    const priceFont = normalizeFontOption(product?.PRICE_FONT_FAMILY || customPriceFontFamily, "Arial");
    const priceBold = boolAttrToFlag(product?.PRICE_TEXT_BOLD ?? customPriceTextBold);
    const priceUnderline = boolAttrToFlag(product?.PRICE_TEXT_UNDERLINE ?? customPriceTextUnderline);
    const priceAlign = normalizeAlignOption(product?.PRICE_TEXT_ALIGN || customPriceTextAlign, "left");

    nameEl.style.fontFamily = metaFont;
    indexEl.style.fontFamily = metaFont;
    if (packageInfoEl) packageInfoEl.style.fontFamily = metaFont;
    nameEl.style.color = metaColor;
    indexEl.style.color = metaColor;
    if (packageInfoEl) packageInfoEl.style.color = metaColor;
    nameEl.style.fontWeight = metaBold ? "700" : "500";
    indexEl.style.fontWeight = metaBold ? "700" : "700";
    if (packageInfoEl) packageInfoEl.style.fontWeight = metaBold ? "700" : "600";
    nameEl.style.textDecoration = metaUnderline ? "underline" : "none";
    indexEl.style.textDecoration = metaUnderline ? "underline" : "none";
    if (packageInfoEl) packageInfoEl.style.textDecoration = metaUnderline ? "underline" : "none";
    nameEl.style.textAlign = metaAlign;
    indexEl.style.textAlign = metaAlign;
    if (packageInfoEl) packageInfoEl.style.textAlign = metaAlign;

    mainEl.textContent = price.main;
    decEl.textContent = price.dec;
    const priceUnitSuffix = isWeightProduct(product) ? "KG" : "SZT.";
    unitEl.textContent = `${currencySymbol} / ${priceUnitSuffix}`;
    mainEl.style.color = customPriceTextColor || "#ffffff";
    decEl.style.color = customPriceTextColor || "#ffffff";
    unitEl.style.color = customPriceTextColor || "#ffffff";
    mainEl.style.fontFamily = priceFont;
    decEl.style.fontFamily = priceFont;
    unitEl.style.fontFamily = priceFont;
    mainEl.style.fontWeight = priceBold ? "800" : "600";
    decEl.style.fontWeight = priceBold ? "700" : "500";
    unitEl.style.fontWeight = priceBold ? "700" : "500";
    mainEl.style.textDecoration = priceUnderline ? "underline" : "none";
    decEl.style.textDecoration = priceUnderline ? "underline" : "none";
    unitEl.style.textDecoration = priceUnderline ? "underline" : "none";
    if (priceRowEl) {
      priceRowEl.style.justifyContent = priceAlign === "right" ? "flex-end" : (priceAlign === "center" ? "center" : "flex-start");
      if (isSingleDirectPreview) {
        const hasImageBadgePreview = String(customPriceBadgeStyleId || "solid") !== "solid";
        const isTnzBadgePreview = String(customPriceBadgeStyleId || "").includes("tnz");
        const isGranatBadgePreview = String(customPriceBadgeStyleId || "").includes("granatowe");
        priceRowEl.style.padding = "0 10px 0 10px";
        if (priceAlign === "right") {
          priceRowEl.style.transform = isTnzBadgePreview
            ? "translate(8px, 7px)"
            : (isGranatBadgePreview ? "translate(4px, 5px)" : (hasImageBadgePreview ? "translate(2px, 5px)" : "translate(0px, 3px)"));
        } else if (priceAlign === "center") {
          priceRowEl.style.transform = isTnzBadgePreview
            ? "translate(19px, 7px)"
            : (isGranatBadgePreview ? "translate(11px, 5px)" : (hasImageBadgePreview ? "translate(8px, 5px)" : "translate(4px, 3px)"));
        } else {
          priceRowEl.style.transform = isTnzBadgePreview
            ? "translate(28px, 7px)"
            : (isGranatBadgePreview ? "translate(18px, 5px)" : (hasImageBadgePreview ? "translate(14px, 5px)" : "translate(8px, 3px)"));
        }
      } else {
        priceRowEl.style.padding = "0 8px";
        if (hasImageBadgePreview) {
          const isTnzBadgePreview = String(customPriceBadgeStyleId || "").includes("tnz");
          const isGranatBadgePreview = String(customPriceBadgeStyleId || "").includes("granatowe");
          if (priceAlign === "right") {
            priceRowEl.style.transform = isGranatBadgePreview ? "translate(10px, 3px)" : (isTnzBadgePreview ? "translate(4px, 3px)" : "translate(2px, 2px)");
          } else if (priceAlign === "center") {
            priceRowEl.style.transform = isGranatBadgePreview ? "translate(16px, 3px)" : (isTnzBadgePreview ? "translate(8px, 3px)" : "translate(5px, 2px)");
          } else {
            priceRowEl.style.transform = isGranatBadgePreview ? "translate(22px, 3px)" : (isTnzBadgePreview ? "translate(12px, 3px)" : "translate(7px, 2px)");
          }
        } else {
          priceRowEl.style.transform = "none";
        }
      }
    }

    // Skalowanie ceny proporcjonalnie do podglądu (bliżej stylu eleganckiego 1:1).
    if (priceCircle) {
      const card = document.getElementById("customPreviewCard");
      const hasImageBadgePreview = String(customPriceBadgeStyleId || "solid") !== "solid";
      const base = card
        ? Math.max(isSingleDirectPreview ? 78 : 68, Math.round(card.clientWidth * (isSingleDirectPreview ? (hasImageBadgePreview ? 0.275 : 0.24) : 0.18)))
        : 84;
      const scale = Number.isFinite(customPriceTextScale) ? customPriceTextScale : 1;
      priceCircle.style.width = `${base}px`;
      priceCircle.style.height = `${base}px`;
      const badgeBgUrl = getSelectedPriceBadgeBackgroundUrl();
      if (customPriceBadgeStyleId && customPriceBadgeStyleId !== "solid" && badgeBgUrl) {
        const isGranatBadgePreview = String(customPriceBadgeStyleId || "").includes("granatowe");
        const isTnzBadgePreview = String(customPriceBadgeStyleId || "").includes("tnz");
        priceCircle.style.background = "transparent";
        priceCircle.style.backgroundImage = `url("${badgeBgUrl}")`;
        priceCircle.style.backgroundRepeat = "no-repeat";
        priceCircle.style.backgroundPosition = "center";
        if (isSingleDirectPreview) {
          priceCircle.style.backgroundSize = "contain";
        } else {
          priceCircle.style.backgroundSize = isGranatBadgePreview ? "124%" : (isTnzBadgePreview ? "114%" : "116%");
        }
      } else {
        priceCircle.style.backgroundImage = "none";
        priceCircle.style.background = customPriceCircleColor || "#d71920";
      }
      mainEl.style.fontSize = `${Math.max(12, Math.round(base * (isSingleDirectPreview ? 0.475 : 0.38) * scale))}px`;
      decEl.style.fontSize = `${Math.max(8, Math.round(base * 0.14 * scale))}px`;
      unitEl.style.fontSize = `${Math.max(7, Math.round(base * (isSingleDirectPreview ? 0.095 : 0.11) * scale))}px`;
      unitEl.style.whiteSpace = "nowrap";
      unitEl.style.letterSpacing = isSingleDirectPreview ? "-0.1px" : "0";
      if (isSingleDirectPreview) {
        unitEl.style.transform = "translateY(-1px)";
      } else {
        unitEl.style.transform = "none";
      }
    }

    const eanDigits = scientificToPlain(product.ean);
    barcodeEl.innerHTML = "";
    if (flagEl) {
      flagEl.style.display = customPreviewVisibility.showFlag ? "flex" : "none";
    }
    if (barcodeWrap) {
      barcodeWrap.style.display = customPreviewVisibility.showBarcode ? "block" : "none";
    }
    if (customPreviewVisibility.showBarcode && window.JsBarcode && eanDigits) {
      try {
        window.JsBarcode(barcodeEl, eanDigits, {
          format: "EAN13",
          displayValue: true,
          fontSize: 10,
          height: 54,
          width: 1.45,
          margin: 0,
          background: "transparent"
        });
        // JsBarcode potrafi nadpisac atrybuty SVG; wymuszamy osadzenie 1:1 w kontenerze.
        barcodeEl.removeAttribute("width");
        barcodeEl.removeAttribute("height");
        barcodeEl.style.width = "100%";
        barcodeEl.style.height = "100%";
        barcodeEl.style.display = "block";
      } catch (e) {
        barcodeEl.innerHTML = "";
      }
    }
  }

  function getActiveCatalogPage() {
    if (!Array.isArray(window.pages) || window.pages.length === 0) return null;
    return window.pages.find((p) => p.stage === document.activeStage) || window.pages[0];
  }

  function buildCatalogProductFromCustom(product) {
    if (!product) return null;
    const base = getEffectivePreviewProduct() || product;
    const name = getDisplayName(base);
    const ean = scientificToPlain(base.ean);
    const countryRaw = String(base?.raw?.["text-left 3"] || "RUMUNIA").trim();
    const includeBarcode = !!customPreviewVisibility.showBarcode;
    const includeFlag = !!customPreviewVisibility.showFlag;
    const family = Array.isArray(currentFamilyProducts) ? currentFamilyProducts : [];
    const familyIndexes = family
      .map((item) => String(item && item.product && item.product.index ? item.product.index : "").trim())
      .filter(Boolean);
    const uniqueFamilyIndexes = Array.from(new Set(familyIndexes));
    const mergedIndex = uniqueFamilyIndexes.length
      ? uniqueFamilyIndexes.join(", ")
      : String(base.index || "").trim();
    const familyImageUrls = family
      .map((item) => String(item && item.url ? item.url : "").trim())
      .filter(Boolean);
    const imageLayouts = buildExportImageLayouts(base.index, mergedIndex, familyImageUrls);
    const selectedPriceBadgeStyle = getSelectedPriceBadgeStyleMeta();
    const priceBadgeImageUrl = getSelectedPriceBadgeBackgroundUrl();
    return {
      INDEKS: mergedIndex,
      NAZWA: name || "-",
      JEDNOSTKA: String(base.packageUnit || "SZT").trim() || "SZT",
      CUSTOM_PACKAGE_VALUE: String(base.packageValue || "").trim(),
      CUSTOM_PACKAGE_UNIT: String(base.packageUnit || "").trim(),
      CUSTOM_PACKAGE_INFO_TEXT: buildPackageInfoText(base),
      CENA: String(base.netto || "0.00").trim() || "0.00",
      PRICE_BG_COLOR: customPriceCircleColor || "#d71920",
      PRICE_BG_STYLE_ID: selectedPriceBadgeStyle?.id || "solid",
      PRICE_BG_IMAGE_URL: priceBadgeImageUrl || "",
      PRICE_TEXT_COLOR: customPriceTextColor || "#ffffff",
      PRICE_TEXT_SCALE: Number.isFinite(customPriceTextScale) ? customPriceTextScale : 1,
      PRICE_CURRENCY_SYMBOL: customCurrencySymbol === "€" ? "€" : "£",
      PRICE_FONT_FAMILY: normalizeFontOption(customPriceFontFamily, "Arial"),
      PRICE_TEXT_BOLD: !!customPriceTextBold,
      PRICE_TEXT_UNDERLINE: !!customPriceTextUnderline,
      PRICE_TEXT_ALIGN: normalizeAlignOption(customPriceTextAlign, "left"),
      TEXT_FONT_FAMILY: normalizeFontOption(customMetaFontFamily, "Arial"),
      TEXT_COLOR: String(customMetaTextColor || "#1f3560"),
      TEXT_BOLD: !!customMetaTextBold,
      TEXT_UNDERLINE: !!customMetaTextUnderline,
      TEXT_ALIGN: normalizeAlignOption(customMetaTextAlign, "left"),
      FAMILY_IMAGE_URLS: familyImageUrls,
      CUSTOM_IMAGE_LAYOUTS: imageLayouts,
      "KOD EAN": includeBarcode ? (ean || "") : "",
      TNZ: String(base?.raw?.["text-right"] || "").trim(),
      LOGO: String(base?.raw?.["text-left 2"] || "").trim(),
      KRAJPOCHODZENIA: includeFlag ? (countryRaw || "RUMUNIA") : ""
    };
  }

  function addCurrentProductToCatalog() {
    const product = currentPreviewProduct;
    if (!product) {
      if (typeof window.showAppToast === "function") window.showAppToast("Najpierw wybierz produkt.", "error");
      return;
    }
    const page = getActiveCatalogPage();
    if (!page) {
      if (typeof window.showAppToast === "function") window.showAppToast("Najpierw utwórz stronę katalogu.", "error");
      return;
    }
    const stage = page.stage;
    snapshotPreviewLayoutsForExport();
    const modal = document.getElementById("customStyleModal");
    if (modal) modal.style.display = "none";
    if (!stage) return;

    const placementPages = (Array.isArray(window.pages) ? window.pages : [])
      .filter((p) => p && p.stage && typeof p.stage.on === "function");
    const placementStages = placementPages.map((p) => p.stage);
    const placementContainers = placementStages
      .map((s) => (typeof s.container === "function" ? s.container() : null))
      .filter(Boolean);

    placementContainers.forEach((c) => { c.style.cursor = "crosshair"; });
    // Blokujemy auto-drag grup podczas trybu "kliknij miejsce wstawienia",
    // bo ten handler potrafi przejąć klik i nie dochodzi do onPlace.
    window.__customPlacementActive = true;
    isCustomPlacementActive = true;
    if (typeof window.showAppToast === "function") {
      window.showAppToast("Kliknij na stronie miejsce wstawienia produktu.", "success");
    }

    const detachPlacement = () => {
      placementStages.forEach((s) => s.off("mousedown.customPlaceProduct touchstart.customPlaceProduct"));
      placementContainers.forEach((c) => { c.style.cursor = "default"; });
      document.removeEventListener("keydown", onEsc, true);
      window.__customPlacementActive = false;
      isCustomPlacementActive = false;
      if (!window.__customPlacementActive) {
        // Snapshot jest ważny tylko dla najbliższego wstawienia.
        setTimeout(() => {
          pendingPreviewExportLayouts = null;
        }, 120000);
      }
    };

    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      detachPlacement();
      if (typeof window.showAppToast === "function") {
        window.showAppToast("Anulowano wstawianie produktu.", "error");
      }
    };

    const onPlace = async (e) => {
      e.cancelBubble = true;
      const clickedStage = e?.target?.getStage?.() || stage;
      const page = placementPages.find((p) => p.stage === clickedStage) || getActiveCatalogPage();
      const pointer = clickedStage?.getPointerPosition?.() || null;
      detachPlacement();
      if (!pointer || !page || !page.stage || !page.layer) return;
      const loadingStartedAt = Date.now();
      let loadingOverlayClosed = false;
      const loadingSafetyTimer = setTimeout(() => hideCustomAddLoading(), 9000);
      const closeLoadingOverlay = () => {
        if (loadingOverlayClosed) return;
        loadingOverlayClosed = true;
        clearTimeout(loadingSafetyTimer);
        const elapsed = Date.now() - loadingStartedAt;
        const minVisibleMs = 420;
        const waitLeft = Math.max(0, minVisibleMs - elapsed);
        setTimeout(() => hideCustomAddLoading(), waitLeft);
      };
      showCustomAddLoading("Trwa dodawanie produktu do katalogu...");

      const mode = window.LAYOUT_MODE === "layout8" ? "layout8" : "layout6";
      if (!Array.isArray(page.products)) page.products = [];

      const collectOccupiedSlots = () => {
        const slots = new Set();
        if (Array.isArray(page.products)) {
          page.products.forEach((p, i) => {
            if (p) slots.add(i);
          });
        }
        if (Array.isArray(page.slotObjects)) {
          page.slotObjects.forEach((obj, i) => {
            if (obj) slots.add(i);
          });
        }
        if (page.layer && typeof page.layer.find === "function") {
          page.layer.find((n) => n && n.getAttr).forEach((n) => {
            const si = Number(n.getAttr("slotIndex"));
            const psi = Number(n.getAttr("preservedSlotIndex"));
            if (Number.isFinite(si) && si >= 0) slots.add(si);
            if (Number.isFinite(psi) && psi >= 0) slots.add(psi);
          });
        }
        return slots;
      };

      const occupiedSlots = collectOccupiedSlots();
      let slotIndex = page.products.length;
      if (occupiedSlots.size) {
        const maxUsed = Math.max(...Array.from(occupiedSlots));
        slotIndex = Math.max(page.products.length, maxUsed + 1);
      }
      while (occupiedSlots.has(slotIndex)) slotIndex += 1;
      // Styl własny: nigdy nie nadpisujemy istniejących modułów.
      // Nowy produkt zawsze dostaje nowy, wolny slot na końcu.

      function getManagedGroupSlot(group) {
        if (!group || !group.getAttr) return null;
        const direct = group.getAttr("slotIndex");
        if (Number.isFinite(direct)) return direct;
        const preserved = group.getAttr("preservedSlotIndex");
        if (Number.isFinite(preserved)) return preserved;
        return null;
      }

      function clearSlotBindingRecursive(node) {
        if (!node || !node.setAttr) return;
        node.setAttr("slotIndex", null);
        if (node.getChildren) node.getChildren().forEach(clearSlotBindingRecursive);
      }

      function preserveManagedGroupsBeforeRedraw() {
        const saved = [];
        const slots = new Set();
        if (!page || !page.layer) return saved;
        const groups = page.layer.find((n) =>
          n instanceof Konva.Group &&
          n.getAttr &&
          n.getAttr("isUserGroup") &&
          n.getAttr("isAutoSlotGroup")
        );
        groups.forEach((g) => {
          const slot = getManagedGroupSlot(g);
          if (!Number.isFinite(slot)) return;
          slots.add(slot);
          const clone = g.clone({ listening: true, draggable: true });
          clearSlotBindingRecursive(clone);
          clone.setAttr("isAutoSlotGroup", true);
          clone.setAttr("preservedSlotIndex", slot);
          clone.setAttr("slotIndex", null);
          saved.push({ slot, group: clone });
          g.destroy();
        });
        page._customProtectedSlots = slots;
        return saved;
      }

      function restoreManagedGroupsAfterRedraw(savedGroups, newSlot) {
        if (!Array.isArray(savedGroups) || !page || !page.layer) return;
        savedGroups.forEach(({ slot, group }) => {
          if (!Number.isFinite(slot) || !group) return;
          if (slot === newSlot) return;
          page.layer.find((n) => n && n.getAttr && n.getAttr("slotIndex") === slot).forEach((n) => n.destroy());
          page.layer.add(group);
        });
        page._customProtectedSlots = null;
      }

      const family = Array.isArray(currentFamilyProducts) ? currentFamilyProducts : [];
      const familyImageUrls = family
        .map((item) => String(item && item.url ? item.url : "").trim())
        .filter(Boolean);
      const effectiveImageUrl = getEffectivePreviewImageUrl();
      const preloadTargets = familyImageUrls.length > 1
        ? familyImageUrls
        : [effectiveImageUrl].filter(Boolean);
      await Promise.allSettled([
        preloadImageUrls(preloadTargets, 1800),
        waitMs(220)
      ]);

      let catalogEntry = null;
      let preservedGroups = [];
      while (page.products[slotIndex]) slotIndex += 1;
      if (!Array.isArray(page.slotObjects)) page.slotObjects = [];
      if (!Array.isArray(page.barcodeObjects)) page.barcodeObjects = [];
      if (!Array.isArray(page.barcodePositions)) page.barcodePositions = [];
      if (!Array.isArray(page.boxScales)) page.boxScales = [];
      if (!page.settings || typeof page.settings !== "object") page.settings = {};
      const currentIndexSizeSetting = Number(page.settings.indexSize);
      if (Number.isFinite(currentIndexSizeSetting) && currentIndexSizeSetting > 0) {
        page.settings.indexSize = Math.max(8, Math.round(currentIndexSizeSetting * 0.62));
      }

      const attachSlotNodesToGroup = (group, targetSlot) => {
        if (!group || !page || !page.layer) return;
        const toAttach = page.layer.find((n) => {
          if (!n || !n.getAttr) return false;
          if (n.getAttr("slotIndex") !== targetSlot) return false;
          if (n === group) return false;
          const parent = n.getParent ? n.getParent() : null;
          if (parent === group) return false;
          if (parent && parent.getAttr && parent.getAttr("isUserGroup")) return false;
          if (n.getAttr("isName")) return true;
          if (n.getAttr("isIndex")) return true;
          if (n.getAttr("isProductImage")) return true;
          if (n.getAttr("isBarcode")) return true;
          if (n.getAttr("isCountryBadge")) return true;
          if (n.getAttr("isPriceGroup")) return true;
          if (n.getAttr("isCustomPackageInfo")) return true;
          return false;
        });
        toAttach.forEach((node) => {
          const abs = node.getAbsolutePosition ? node.getAbsolutePosition() : null;
          if (node.getAttr && node.getAttr("_wasDraggableBeforeUserGroup") == null) {
            node.setAttr("_wasDraggableBeforeUserGroup", !!node.draggable?.());
          }
          if (typeof node.draggable === "function") node.draggable(false);
          node.moveTo(group);
          if (abs && node.setAbsolutePosition) node.setAbsolutePosition(abs);
        });
      };

      const animateInsertedGroup = (group) => {
        if (!group || !window.Konva || !window.Konva.Tween) return;
        if (group.getAttr && group.getAttr("customInsertAnimated")) return;
        const baseScaleX = Number.isFinite(group.scaleX?.()) ? group.scaleX() : 1;
        const baseScaleY = Number.isFinite(group.scaleY?.()) ? group.scaleY() : 1;
        group.setAttr("customInsertAnimated", true);
        group.opacity(0.15);
        group.scaleX(baseScaleX * 0.95);
        group.scaleY(baseScaleY * 0.95);
        const tween = new window.Konva.Tween({
          node: group,
          duration: 0.26,
          opacity: 1,
          scaleX: baseScaleX,
          scaleY: baseScaleY,
          easing: window.Konva.Easings?.EaseOut || undefined
        });
        tween.play();
      };

      const placeGroupAtPointer = () => {
        const grouped = page.layer.findOne((n) =>
          n instanceof Konva.Group &&
          n.getAttr &&
          n.getAttr("isUserGroup") &&
          n.getAttr("isAutoSlotGroup") &&
          (n.getAttr("slotIndex") === slotIndex || n.getAttr("preservedSlotIndex") === slotIndex)
        );
        if (!grouped || !pointer) return;
        const rect = grouped.getClientRect({ relativeTo: page.layer });
        const stageW = page.stage?.width?.() || 0;
        const stageH = page.stage?.height?.() || 0;
        const targetRectX = Math.max(0, Math.min(Math.max(0, stageW - rect.width), pointer.x - rect.width / 2));
        const targetRectY = Math.max(0, Math.min(Math.max(0, stageH - rect.height), pointer.y - rect.height / 2));

        // Ustawiamy pozycję przez delte prostokąta (nie bezpośrednio group.x/y),
        // bo grupa po auto-grupowaniu ma dzieci w globalnych koordynatach.
        const dx = targetRectX - rect.x;
        const dy = targetRectY - rect.y;
        grouped.x((grouped.x() || 0) + dx);
        grouped.y((grouped.y() || 0) + dy);

        page.selectedNodes = [grouped];
        page.transformer?.nodes?.([grouped]);
        page.layer.batchDraw();
        page.transformerLayer?.batchDraw?.();
      };

      const autoGroupSlot = (targetSlot, keepSelected = false) => {
        if (!page || !page.layer || typeof page.groupSelectedNodes !== "function") return;
        const existingGroup = page.layer.findOne((n) =>
          n instanceof Konva.Group &&
          n.getAttr &&
          n.getAttr("isUserGroup") &&
          n.getAttr("isAutoSlotGroup") &&
          (n.getAttr("slotIndex") === targetSlot || n.getAttr("preservedSlotIndex") === targetSlot)
        );
        if (existingGroup) {
          attachSlotNodesToGroup(existingGroup, targetSlot);
          if (keepSelected) {
            page.selectedNodes = [existingGroup];
            page.transformer?.nodes?.([existingGroup]);
            animateInsertedGroup(existingGroup);
          }
          page.layer.batchDraw();
          page.transformerLayer?.batchDraw?.();
          return;
        }
        const nodes = page.layer.find((n) => {
          if (!n || !n.getAttr) return false;
          if (n.getAttr("slotIndex") !== targetSlot) return false;
          if (n.getAttr("isName")) return true;
          if (n.getAttr("isIndex")) return true;
          if (n.getAttr("isProductImage")) return true;
          if (n.getAttr("isBarcode")) return true;
          if (n.getAttr("isCountryBadge")) return true;
          if (n.getAttr("isPriceGroup")) return true;
          if (n.getAttr("isCustomPackageInfo")) return true;
          return false;
        });
        if (!Array.isArray(nodes) || nodes.length < 2) return;
        page.selectedNodes = nodes;
        page.transformer?.nodes?.(nodes);
        page.groupSelectedNodes();
        const grouped = Array.isArray(page.selectedNodes) ? page.selectedNodes[0] : null;
        if (grouped && grouped.getAttr) {
          grouped.setAttr("isAutoSlotGroup", true);
          grouped.setAttr("preservedSlotIndex", targetSlot);
          clearSlotBindingRecursive(grouped);
          grouped.setAttr("slotIndex", null);
          attachSlotNodesToGroup(grouped, targetSlot);
          if (keepSelected) {
            animateInsertedGroup(grouped);
          } else {
            page.selectedNodes = [];
            page.transformer?.nodes?.([]);
          }
        }
        page.layer.batchDraw();
        page.transformerLayer?.batchDraw?.();
      };

      const isIndexLikeNode = (node) => {
        if (!node || !node.getAttr) return false;
        if (node.getAttr("isIndex")) return true;
        const txt = typeof node.text === "function" ? String(node.text() || "") : "";
        return txt.trim().toLowerCase().startsWith("indeks:");
      };

      const stripIndexLabel = (value) => {
        const txt = String(value || "").trim();
        if (!txt) return "-";
        return txt.replace(/^indeks\s*:\s*/i, "").trim() || "-";
      };

      const tuneIndexNode = (node) => {
        if (!node || !node.getAttr || !node.setAttr) return;
        if (!isIndexLikeNode(node)) return;
        if (typeof node.text === "function") {
          const rawText = String(node.text() || "");
          const cleanText = stripIndexLabel(rawText);
          if (cleanText !== rawText) node.text(cleanText);
        }
        if (node.getAttr("_customIndexFontTuned")) return;
        if (typeof node.fontSize !== "function") return;

        const currentSize = Number(node.fontSize());
        if (!Number.isFinite(currentSize) || currentSize <= 0) return;

        const nextSize = Math.max(7, Math.round(currentSize * 0.52));
        node.fontSize(nextSize);
        if (typeof node.fontStyle === "function") node.fontStyle("italic");
        if (typeof node.width === "function") {
          const currentW = Number(node.width());
          if (Number.isFinite(currentW) && currentW > 0) node.width(Math.max(currentW, 120));
        }
        if (typeof node.height === "function") {
          node.height(Math.max(10, Math.round(nextSize * 1.2)));
        }
        if (typeof node.scaleX === "function") node.scaleX(1);
        if (typeof node.scaleY === "function") node.scaleY(1);
        node.setAttr("_customIndexFontTuned", true);
      };

      const tuneIndexTextForSlot = (targetSlot) => {
        if (!page || !page.layer) return;

        // Przypadek przed grupowaniem / bez grupy: tekst ma slotIndex.
        page.layer.find((n) => n && n.getAttr && isIndexLikeNode(n) && n.getAttr("slotIndex") === targetSlot)
          .forEach(tuneIndexNode);

        // Przypadek po auto-grupowaniu: dzieci mogą stracić slotIndex, więc szukamy po grupie slotu.
        const grouped = page.layer.find((n) =>
          n instanceof Konva.Group &&
          n.getAttr &&
          n.getAttr("isUserGroup") &&
          n.getAttr("isAutoSlotGroup") &&
          (n.getAttr("slotIndex") === targetSlot || n.getAttr("preservedSlotIndex") === targetSlot)
        );
        grouped.forEach((g) => {
          if (!g || !g.find) return;
          g.find((n) => n && n.getAttr && isIndexLikeNode(n)).forEach(tuneIndexNode);
        });

        page.layer.batchDraw();
        page.transformerLayer?.batchDraw?.();
      };

      const bindIndexEditingNode = (node) => {
        if (!node || !node.getAttr || !node.setAttr) return;
        if (!isIndexLikeNode(node)) return;
        if (node.getAttr("_customIndexEditBound")) return;

        const rebindFn = (typeof window.rebindEditableTextForClone === "function")
          ? window.rebindEditableTextForClone
          : null;
        const bindFn = (typeof window.enableEditableText === "function")
          ? window.enableEditableText
          : null;

        try {
          if (rebindFn) {
            rebindFn(node, page);
          } else if (bindFn) {
            // Czyścimy tylko eventy tekstowe, a potem podpinamy pełną edycję inline.
            if (typeof node.off === "function") {
              node.off("dblclick dbltap click tap transform transformend");
            }
            bindFn(node, page);
          }
          node.setAttr("_customIndexEditBound", true);
        } catch (_err) {
          // Brak twardego faila – UI ma dalej działać.
        }
      };

      const isEditableModuleTextNode = (node) => {
        if (!node || !node.getAttr) return false;
        if (!window.Konva || !(node instanceof window.Konva.Text)) return false;
        if (isIndexLikeNode(node)) return true;
        return !!node.getAttr("isName");
      };

      const bindNoopEditFontGuardNode = (node) => {
        if (!isEditableModuleTextNode(node) || !node.setAttr) return;
        if (node.getAttr("_customNoopEditGuardBound")) return;

        const saveSnapshot = () => {
          try {
            const abs = node.getAbsolutePosition ? node.getAbsolutePosition() : null;
            node.setAttr("_customNoopEditSnapshot", {
              text: typeof node.text === "function" ? String(node.text() || "") : "",
              fontSize: typeof node.fontSize === "function" ? Number(node.fontSize()) : null,
              width: typeof node.width === "function" ? Number(node.width()) : null,
              height: typeof node.height === "function" ? Number(node.height()) : null,
              scaleX: typeof node.scaleX === "function" ? Number(node.scaleX()) : null,
              scaleY: typeof node.scaleY === "function" ? Number(node.scaleY()) : null,
              x: abs && Number.isFinite(abs.x) ? abs.x : null,
              y: abs && Number.isFinite(abs.y) ? abs.y : null
            });
          } catch (_err) {}
        };

        const restoreIfNoTextChange = () => {
          try {
            if (window.isEditingText) return false;
            const snap = node.getAttr ? node.getAttr("_customNoopEditSnapshot") : null;
            if (!snap) return true;
            if (typeof node.isDestroyed === "function" && node.isDestroyed()) return true;
            const currentText = typeof node.text === "function" ? String(node.text() || "") : "";
            if (currentText !== String(snap.text || "")) {
              node.setAttr("_customNoopEditSnapshot", null);
              return true;
            }
            if (Number.isFinite(snap.fontSize) && typeof node.fontSize === "function") node.fontSize(snap.fontSize);
            if (Number.isFinite(snap.width) && typeof node.width === "function") node.width(snap.width);
            if (Number.isFinite(snap.height) && typeof node.height === "function") node.height(snap.height);
            if (Number.isFinite(snap.scaleX) && typeof node.scaleX === "function") node.scaleX(snap.scaleX);
            if (Number.isFinite(snap.scaleY) && typeof node.scaleY === "function") node.scaleY(snap.scaleY);
            if (Number.isFinite(snap.x) && Number.isFinite(snap.y) && typeof node.setAbsolutePosition === "function") {
              node.setAbsolutePosition({ x: snap.x, y: snap.y });
            }
            node.setAttr("_customNoopEditSnapshot", null);
            page.layer?.batchDraw?.();
            page.transformerLayer?.batchDraw?.();
            return true;
          } catch (_err) {
            return true;
          }
        };

        const startEditWatch = () => {
          const watchId = (Number(node.getAttr("_customNoopEditWatchId")) || 0) + 1;
          node.setAttr("_customNoopEditWatchId", watchId);

          let sawEditing = !!window.isEditingText;
          let ticks = 0;
          const maxTicks = 400; // ok. 40s

          const poll = () => {
            if (!node || (typeof node.isDestroyed === "function" && node.isDestroyed())) return;
            if (Number(node.getAttr("_customNoopEditWatchId")) !== watchId) return;
            ticks += 1;

            if (window.isEditingText) {
              sawEditing = true;
            } else if (sawEditing) {
              restoreIfNoTextChange();
              return;
            } else if (ticks <= 3) {
              // klik bez edycji: szybka próba, bez czekania 40s
              restoreIfNoTextChange();
            }

            if (ticks >= maxTicks) {
              restoreIfNoTextChange();
              return;
            }
            setTimeout(poll, 100);
          };

          setTimeout(poll, 0);
        };

        if (typeof node.on === "function") {
          node.on("mousedown.customNoopEditGuard touchstart.customNoopEditGuard", saveSnapshot);
          node.on("click.customNoopEditGuard tap.customNoopEditGuard", startEditWatch);
          node.on("dblclick.customNoopEditGuard dbltap.customNoopEditGuard", startEditWatch);
        }

        node.setAttr("_customNoopEditGuardBound", true);
      };

      const startSafeInlineTextEdit = (node) => {
        if (!node || typeof node.text !== "function") return;
        if (window.isEditingText) return;
        if (node.getParent && node.getParent().getAttr && node.getParent().getAttr("isPriceGroup")) return;

        const layer = page.layer;
        const tr = page.transformer;
        const originalAbs = node.getAbsolutePosition ? node.getAbsolutePosition() : { x: node.x?.() || 0, y: node.y?.() || 0 };
        const original = {
          text: String(node.text() || ""),
          fontSize: typeof node.fontSize === "function" ? Number(node.fontSize()) : null,
          width: typeof node.width === "function" ? Number(node.width()) : null,
          height: typeof node.height === "function" ? Number(node.height()) : null,
          scaleX: typeof node.scaleX === "function" ? Number(node.scaleX()) : null,
          scaleY: typeof node.scaleY === "function" ? Number(node.scaleY()) : null,
          x: Number(originalAbs?.x),
          y: Number(originalAbs?.y)
        };

        window.hideTextToolbar?.();
        window.hideTextPanel?.();
        window.isEditingText = true;
        tr?.hide?.();
        node.hide?.();
        layer?.draw?.();

        const pos = node.absolutePosition ? node.absolutePosition() : { x: node.x?.() || 0, y: node.y?.() || 0 };
        const rect = page.stage?.container?.().getBoundingClientRect?.();
        if (!rect) {
          node.show?.();
          tr?.show?.();
          tr?.forceUpdate?.();
          layer?.draw?.();
          window.isEditingText = false;
          return;
        }

        const absX = rect.left + pos.x + window.scrollX;
        const absY = rect.top + pos.y + window.scrollY;
        const textarea = document.createElement("textarea");
        document.body.appendChild(textarea);

        textarea.value = original.text;
        Object.assign(textarea.style, {
          position: "absolute",
          left: `${absX}px`,
          top: `${absY}px`,
          width: `${Math.max(20, Number(node.width?.() || 0))}px`,
          minHeight: `${Math.max(16, Number(node.height?.() || 0))}px`,
          fontSize: `${Math.max(1, Number(node.fontSize?.() || 12))}px`,
          fontFamily: typeof node.fontFamily === "function" ? node.fontFamily() : "Arial",
          lineHeight: String(typeof node.lineHeight === "function" ? node.lineHeight() : 1.2),
          textAlign: typeof node.align === "function" ? node.align() : "left",
          color: typeof node.fill === "function" ? node.fill() : "#111",
          padding: "2px",
          border: "2px solid #0066ff",
          background: "white",
          resize: "none",
          zIndex: 99999,
          outline: "none",
          overflow: "hidden"
        });

        const localShrinkText = (typeof window.shrinkText === "function")
          ? window.shrinkText
          : (typeof shrinkText === "function" ? shrinkText : null);

        const finish = () => {
          const finalText = String(textarea.value || "");
          const normalizedFinal = finalText || "-";
          const changed = normalizedFinal !== String(original.text || "");

          if (changed) {
            node.text(normalizedFinal);
            if (typeof localShrinkText === "function") {
              localShrinkText(node, 8);
            }
          } else {
            node.text(String(original.text || ""));
            if (Number.isFinite(original.fontSize) && typeof node.fontSize === "function") node.fontSize(original.fontSize);
            if (Number.isFinite(original.width) && typeof node.width === "function") node.width(original.width);
            if (Number.isFinite(original.height) && typeof node.height === "function") node.height(original.height);
            if (Number.isFinite(original.scaleX) && typeof node.scaleX === "function") node.scaleX(original.scaleX);
            if (Number.isFinite(original.scaleY) && typeof node.scaleY === "function") node.scaleY(original.scaleY);
            if (Number.isFinite(original.x) && Number.isFinite(original.y) && typeof node.setAbsolutePosition === "function") {
              node.setAbsolutePosition({ x: original.x, y: original.y });
            }
          }

          node.show?.();
          tr?.show?.();
          tr?.forceUpdate?.();
          layer?.draw?.();
          textarea.remove();
          window.isEditingText = false;
          window.removeEventListener("click", close);
        };

        const close = (e) => {
          if (e.target !== textarea) finish();
        };

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        textarea.style.height = `${textarea.scrollHeight}px`;

        textarea.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finish();
          }
          if (e.key === "Escape") finish();
        });

        textarea.addEventListener("input", () => {
          if (typeof node.text === "function") node.text(textarea.value);
          if (typeof localShrinkText === "function") {
            const newSize = localShrinkText(node, 8);
            if (Number.isFinite(newSize)) textarea.style.fontSize = `${newSize}px`;
          }
          textarea.style.height = "auto";
          textarea.style.height = `${textarea.scrollHeight}px`;
        });

        setTimeout(() => window.addEventListener("click", close), 0);
      };

      const bindSafeInlineTextEditNode = (node) => {
        if (!isEditableModuleTextNode(node) || !node.setAttr || typeof node.on !== "function") return;
        if (node.getAttr("_customSafeInlineTextEditBound")) return;

        // Usuwamy domyślne handlery edycji z importdanych.js dla tego tekstu
        // i podpinamy własne, które nie zmieniają stylu przy braku zmian.
        if (typeof node.off === "function") {
          node.off("click tap dblclick dbltap");
        }

        const onClick = (e) => {
          if (window.isEditingText) return;
          if (e && e.evt && e.evt.shiftKey) return;
          if (node.isDragging && node.isDragging()) return;
          if (node.getParent && node.getParent().getAttr && node.getParent().getAttr("isPriceGroup")) return;

          window.showTextToolbar?.(node);
          window.hideTextPanel?.();

          // Pojedynczy klik tylko zaznacza/pokazuje toolbar.
          // Edycja tekstu wyłącznie na dwuklik, żeby dało się swobodnie przeciągać tekst.
        };

        node.on("click.customSafeInlineTextEdit tap.customSafeInlineTextEdit", onClick);
        node.on("dblclick.customSafeInlineTextEdit dbltap.customSafeInlineTextEdit", () => {
          startSafeInlineTextEdit(node);
        });
        node.setAttr("_customSafeInlineTextEditBound", true);
      };

      const getManagedGroupForSlot = (targetSlot) => {
        if (!page || !page.layer) return null;
        return page.layer.findOne((n) =>
          n instanceof Konva.Group &&
          n.getAttr &&
          n.getAttr("isUserGroup") &&
          n.getAttr("isAutoSlotGroup") &&
          (n.getAttr("slotIndex") === targetSlot || n.getAttr("preservedSlotIndex") === targetSlot)
        ) || null;
      };

      const findIndexNodeForSlot = (targetSlot) => {
        if (!page || !page.layer) return null;
        const direct = page.layer.findOne((n) =>
          n && n.getAttr && isIndexLikeNode(n) && n.getAttr("slotIndex") === targetSlot
        );
        if (direct) return direct;
        const group = getManagedGroupForSlot(targetSlot);
        if (!group || !group.findOne) return null;
        return group.findOne((n) => n && n.getAttr && isIndexLikeNode(n)) || null;
      };

      const findPackageInfoNodeForSlot = (targetSlot) => {
        if (!page || !page.layer) return null;
        const direct = page.layer.findOne((n) =>
          n && n.getAttr && n.getAttr("isCustomPackageInfo") && n.getAttr("slotIndex") === targetSlot
        );
        if (direct) return direct;
        const group = getManagedGroupForSlot(targetSlot);
        if (!group || !group.findOne) return null;
        return group.findOne((n) => n && n.getAttr && n.getAttr("isCustomPackageInfo")) || null;
      };

      const ensurePackageInfoTextForSlot = (targetSlot) => {
        if (!page || !page.layer || !window.Konva) return;
        const productEntry = Array.isArray(page.products) ? page.products[targetSlot] : null;
        const packageText = String(productEntry?.CUSTOM_PACKAGE_INFO_TEXT || "").trim();

        let labelNode = findPackageInfoNodeForSlot(targetSlot);
        if (!packageText) {
          if (labelNode && labelNode.destroy) {
            labelNode.destroy();
            page.layer.batchDraw();
            page.transformerLayer?.batchDraw?.();
          }
          return;
        }

        const indexNode = findIndexNodeForSlot(targetSlot);
        if (!indexNode || typeof indexNode.getAbsolutePosition !== "function") return;
        const idxPos = indexNode.getAbsolutePosition();
        const idxFont = Number(indexNode.fontSize?.()) || 10;
        const idxW = Number(indexNode.width?.()) || 120;
        const idxH = Number(indexNode.height?.()) || Math.round(idxFont * 1.2);

        if (!labelNode) {
          labelNode = new window.Konva.Text({
            x: idxPos.x,
            y: idxPos.y + idxH + 1,
            text: packageText,
            fontSize: Math.max(6, idxFont),
            fill: "#334155",
            fontFamily: typeof indexNode.fontFamily === "function" ? indexNode.fontFamily() : (page.settings?.fontFamily || "Arial"),
            align: typeof indexNode.align === "function" ? indexNode.align() : "left",
            width: Math.max(100, idxW),
            wrap: "none",
            listening: false,
            draggable: false,
            isCustomPackageInfo: true,
            slotIndex: targetSlot
          });
          page.layer.add(labelNode);
        } else {
          labelNode.text(packageText);
          labelNode.fontSize(Math.max(6, idxFont));
          if (typeof labelNode.width === "function") labelNode.width(Math.max(100, idxW));
        }

        if (typeof labelNode.setAbsolutePosition === "function") {
          labelNode.setAbsolutePosition({ x: idxPos.x, y: idxPos.y + idxH + 1 });
        } else {
          labelNode.x(idxPos.x);
          labelNode.y(idxPos.y + idxH + 1);
        }
        labelNode.moveToTop?.();

        const group = getManagedGroupForSlot(targetSlot);
        if (group) attachSlotNodesToGroup(group, targetSlot);

        page.layer.batchDraw();
        page.transformerLayer?.batchDraw?.();
      };

      const collectModuleNodesForSlotSnapshot = (targetSlot) => {
        const out = [];
        const seen = new Set();
        const pushNode = (n) => {
          if (!n || seen.has(n)) return;
          seen.add(n);
          out.push(n);
        };

        const group = getManagedGroupForSlot(targetSlot);
        if (group) {
          pushNode(group);
          if (group.find) {
            group.find((n) => n && n.getAttr && (
              n.getAttr("isName") ||
              n.getAttr("isIndex") ||
              n.getAttr("isProductImage") ||
              n.getAttr("isBarcode") ||
              n.getAttr("isCountryBadge") ||
              n.getAttr("isPriceGroup") ||
              n.getAttr("isCustomPackageInfo")
            )).forEach(pushNode);
          }
          return out;
        }

        if (!page || !page.layer) return out;
        page.layer.find((n) => {
          if (!n || !n.getAttr) return false;
          if (n.getAttr("slotIndex") !== targetSlot) return false;
          return !!(
            n.getAttr("isName") ||
            n.getAttr("isIndex") ||
            n.getAttr("isProductImage") ||
            n.getAttr("isBarcode") ||
            n.getAttr("isCountryBadge") ||
            n.getAttr("isPriceGroup") ||
            n.getAttr("isCustomPackageInfo")
          );
        }).forEach(pushNode);
        return out;
      };

      const resolveSlotFromNode = (node) => {
        let cur = node;
        while (cur) {
          if (cur.getAttr) {
            const si = Number(cur.getAttr("slotIndex"));
            if (Number.isFinite(si) && si >= 0) return si;
            const psi = Number(cur.getAttr("preservedSlotIndex"));
            if (Number.isFinite(psi) && psi >= 0) return psi;
          }
          cur = cur.getParent ? cur.getParent() : null;
        }
        return null;
      };

      const saveModuleLayoutSnapshotForPriceEdit = (priceNode) => {
        const targetSlot = resolveSlotFromNode(priceNode);
        if (!Number.isFinite(targetSlot)) return;
        const nodes = collectModuleNodesForSlotSnapshot(targetSlot);
        const snapshot = nodes.map((n) => {
          const abs = n.getAbsolutePosition ? n.getAbsolutePosition() : null;
          if (!abs || !Number.isFinite(abs.x) || !Number.isFinite(abs.y)) return null;
          return { node: n, x: abs.x, y: abs.y };
        }).filter(Boolean);
        priceNode.setAttr("_customModulePosSnapshot", snapshot);
      };

      const restoreModuleLayoutSnapshotForPriceEdit = (priceNode) => {
        const snapshot = priceNode?.getAttr ? priceNode.getAttr("_customModulePosSnapshot") : null;
        if (!Array.isArray(snapshot) || !snapshot.length) return;
        snapshot.forEach((item) => {
          const n = item && item.node;
          if (!n || (typeof n.isDestroyed === "function" && n.isDestroyed())) return;
          if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) return;
          try {
            if (typeof n.setAbsolutePosition === "function") {
              n.setAbsolutePosition({ x: item.x, y: item.y });
            } else if (typeof n.x === "function" && typeof n.y === "function") {
              n.x(item.x);
              n.y(item.y);
            }
          } catch (_err) {}
        });
        page.layer?.batchDraw?.();
        page.transformerLayer?.batchDraw?.();
      };

      const bindPricePositionLockNode = (node) => {
        if (!node || !node.getAttr || !node.setAttr) return;
        if (!node.getAttr("isPriceGroup")) return;
        if (node.getAttr("_customPricePosLockBound")) return;

        const savePos = () => {
          try {
            saveModuleLayoutSnapshotForPriceEdit(node);
            const abs = node.getAbsolutePosition ? node.getAbsolutePosition() : null;
            if (!abs) return;
            node.setAttr("_customPricePosBeforeEdit", { x: abs.x, y: abs.y });
          } catch (_err) {}
        };

        const restorePos = () => {
          try {
            const saved = node.getAttr ? node.getAttr("_customPricePosBeforeEdit") : null;
            if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return;
            if (typeof node.setAbsolutePosition === "function") {
              node.setAbsolutePosition({ x: saved.x, y: saved.y });
            } else if (typeof node.x === "function" && typeof node.y === "function") {
              node.x(saved.x);
              node.y(saved.y);
            }
            page.layer?.batchDraw?.();
            page.transformerLayer?.batchDraw?.();
          } catch (_err) {}
        };

        if (typeof node.on === "function") {
          node.on("mousedown.customPricePosLock touchstart.customPricePosLock", savePos);
          node.on("dblclick.customPricePosLock dbltap.customPricePosLock", () => {
            // Po prompt + przeliczeniu stylu cena potrafi "skoczyć".
            // Przywracamy pozycję całego modułu kilka razy, bo część stylowań jest opóźniona.
            [0, 40, 120, 260, 520].forEach((ms) => setTimeout(() => {
              restoreModuleLayoutSnapshotForPriceEdit(node);
              restorePos();
            }, ms));
          });
        }

        node.setAttr("_customPricePosLockBound", true);
      };

      const ensureIndexEditingForSlot = (targetSlot) => {
        if (!page || !page.layer) return;
        page.layer.find((n) => n && n.getAttr && isIndexLikeNode(n) && n.getAttr("slotIndex") === targetSlot)
          .forEach(bindIndexEditingNode);
        const grouped = page.layer.find((n) =>
          n instanceof Konva.Group &&
          n.getAttr &&
          n.getAttr("isUserGroup") &&
          n.getAttr("isAutoSlotGroup") &&
          (n.getAttr("slotIndex") === targetSlot || n.getAttr("preservedSlotIndex") === targetSlot)
        );
        grouped.forEach((g) => {
          if (!g || !g.find) return;
          g.find((n) => n && n.getAttr && isIndexLikeNode(n)).forEach(bindIndexEditingNode);
        });
      };

      const ensureNoopEditFontGuardForSlot = (targetSlot) => {
        if (!page || !page.layer) return;
        page.layer.find((n) =>
          n && n.getAttr &&
          n.getAttr("slotIndex") === targetSlot &&
          (n.getAttr("isName") || isIndexLikeNode(n))
        ).forEach(bindNoopEditFontGuardNode);

        const grouped = page.layer.find((n) =>
          n instanceof Konva.Group &&
          n.getAttr &&
          n.getAttr("isUserGroup") &&
          n.getAttr("isAutoSlotGroup") &&
          (n.getAttr("slotIndex") === targetSlot || n.getAttr("preservedSlotIndex") === targetSlot)
        );
        grouped.forEach((g) => {
          if (!g || !g.find) return;
          g.find((n) => n && n.getAttr && (n.getAttr("isName") || isIndexLikeNode(n))).forEach(bindNoopEditFontGuardNode);
        });
      };

      const ensureSafeInlineTextEditForSlot = (targetSlot) => {
        if (!page || !page.layer) return;
        page.layer.find((n) =>
          n && n.getAttr &&
          n.getAttr("slotIndex") === targetSlot &&
          (n.getAttr("isName") || isIndexLikeNode(n))
        ).forEach(bindSafeInlineTextEditNode);

        const grouped = page.layer.find((n) =>
          n instanceof Konva.Group &&
          n.getAttr &&
          n.getAttr("isUserGroup") &&
          n.getAttr("isAutoSlotGroup") &&
          (n.getAttr("slotIndex") === targetSlot || n.getAttr("preservedSlotIndex") === targetSlot)
        );
        grouped.forEach((g) => {
          if (!g || !g.find) return;
          g.find((n) => n && n.getAttr && (n.getAttr("isName") || isIndexLikeNode(n))).forEach(bindSafeInlineTextEditNode);
        });
      };

      const ensurePricePositionLockForSlot = (targetSlot) => {
        if (!page || !page.layer) return;
        page.layer.find((n) => n && n.getAttr && n.getAttr("isPriceGroup") && n.getAttr("slotIndex") === targetSlot)
          .forEach(bindPricePositionLockNode);
        const grouped = page.layer.find((n) =>
          n instanceof Konva.Group &&
          n.getAttr &&
          n.getAttr("isUserGroup") &&
          n.getAttr("isAutoSlotGroup") &&
          (n.getAttr("slotIndex") === targetSlot || n.getAttr("preservedSlotIndex") === targetSlot)
        );
        grouped.forEach((g) => {
          if (!g || !g.find) return;
          g.find((n) => n && n.getAttr && n.getAttr("isPriceGroup")).forEach(bindPricePositionLockNode);
        });
      };

      const regroupNewSlotOnly = () => autoGroupSlot(slotIndex, true);

      if (DIRECT_CUSTOM_MODULE_MODE) {
        catalogEntry = buildCatalogProductFromCustom(product);
        page.products[slotIndex] = catalogEntry;
        page.slotObjects[slotIndex] = null;

        const added = await addDirectCustomModuleToPage(page, slotIndex, pointer, catalogEntry, {
          effectiveImageUrl
        });

        if (added) {
          ensurePricePositionLockForSlot(slotIndex);
          ensureIndexEditingForSlot(slotIndex);
          ensureNoopEditFontGuardForSlot(slotIndex);
          ensureSafeInlineTextEditForSlot(slotIndex);
          ensurePackageInfoTextForSlot(slotIndex);
          [80, 220, 520, 900, 1300].forEach((ms) => setTimeout(() => {
            ensurePricePositionLockForSlot(slotIndex);
            ensureIndexEditingForSlot(slotIndex);
            ensureNoopEditFontGuardForSlot(slotIndex);
            ensureSafeInlineTextEditForSlot(slotIndex);
            ensurePackageInfoTextForSlot(slotIndex);
          }, ms));
          document.activeStage = page.stage;
          window.dispatchEvent(new CustomEvent("canvasModified", { detail: page.stage }));
          window.projectOpen = true;
          window.projectDirty = true;
          if (typeof window.showAppToast === "function") {
            window.showAppToast(`Dodano moduł (direct) do strony (slot ${slotIndex + 1}).`, "success");
          }
        } else if (typeof window.showAppToast === "function") {
          window.showAppToast("Nie udało się dodać modułu direct.", "error");
        }

        closeLoadingOverlay();
        familyBaseProduct = null;
        familyBaseImageUrl = null;
        currentFamilyProducts = [];
        updateFamilyUiStatus("Rodzina wyczyszczona po dodaniu modułu do katalogu.", "info");
        currentPreviewProduct = null;
        currentPreviewImageUrl = null;
        pendingPreviewExportLayouts = null;
        return;
      }

      const finalize = () => {
        if (typeof window.applyCatalogStyle === "function") {
          window.applyCatalogStyle("styl_elegancki");
        } else {
          window.CATALOG_STYLE = "styl_elegancki";
        }
        // Rysuj tylko nowy slot – bez pełnego redraw (mniejsza zależność od importdanych, brak „rozjeżdżania”)
        if (typeof window.redrawCatalogPageForCustomStyle === "function") {
          page._drawOnlySlot = slotIndex;
          window.redrawCatalogPageForCustomStyle(page);
        }
        if (typeof window.applyCatalogStyleVisual === "function") {
          window.applyCatalogStyleVisual("styl_elegancki");
          setTimeout(() => window.applyCatalogStyleVisual("styl_elegancki"), 120);
          setTimeout(() => window.applyCatalogStyleVisual("styl_elegancki"), 320);
          setTimeout(() => window.applyCatalogStyleVisual("styl_elegancki"), 900);
        }
        restoreManagedGroupsAfterRedraw(preservedGroups, slotIndex);
        ensurePricePositionLockForSlot(slotIndex);
        ensureIndexEditingForSlot(slotIndex);
        ensureNoopEditFontGuardForSlot(slotIndex);
        ensureSafeInlineTextEditForSlot(slotIndex);
        tuneIndexTextForSlot(slotIndex);
        ensurePackageInfoTextForSlot(slotIndex);
        [80, 220, 520, 900, 1300, 1800, 2600, 3400, 4200].forEach((ms) => setTimeout(() => {
          ensurePricePositionLockForSlot(slotIndex);
          ensureIndexEditingForSlot(slotIndex);
          ensureNoopEditFontGuardForSlot(slotIndex);
          ensureSafeInlineTextEditForSlot(slotIndex);
          tuneIndexTextForSlot(slotIndex);
          ensurePackageInfoTextForSlot(slotIndex);
        }, ms));
        [220, 520, 900, 1300, 1800].forEach((ms) => setTimeout(regroupNewSlotOnly, ms));
        [620, 980, 1400, 1900].forEach((ms) => setTimeout(placeGroupAtPointer, ms));
        document.activeStage = page.stage;
        window.dispatchEvent(new CustomEvent("canvasModified", { detail: page.stage }));
        window.projectOpen = true;
        window.projectDirty = true;
        if (typeof window.showAppToast === "function") {
          window.showAppToast(`Dodano produkt do strony (slot ${slotIndex + 1}).`, "success");
        }
        closeLoadingOverlay();
      };

      catalogEntry = buildCatalogProductFromCustom(product);
      page.products[slotIndex] = catalogEntry;
      preservedGroups = preserveManagedGroupsBeforeRedraw();

      if (familyImageUrls.length > 1) {
        page.slotObjects[slotIndex] = null;
        finalize();
      } else if (effectiveImageUrl && window.Konva && typeof window.Konva.Image.fromURL === "function") {
        const img = await loadKonvaImageFromUrl(effectiveImageUrl, 2600);
        page.slotObjects[slotIndex] = img || null;
        finalize();
      } else {
        page.slotObjects[slotIndex] = null;
        finalize();
      }

      familyBaseProduct = null;
      familyBaseImageUrl = null;
      currentFamilyProducts = [];
      updateFamilyUiStatus("Rodzina wyczyszczona po dodaniu produktu do katalogu.", "info");
      currentPreviewProduct = null;
      currentPreviewImageUrl = null;
      pendingPreviewExportLayouts = null;
    };

    document.addEventListener("keydown", onEsc, true);
    placementStages.forEach((s) => s.on("mousedown.customPlaceProduct touchstart.customPlaceProduct", onPlace));
  }

  function rankAndFilter(products, query) {
    const q = normalizeText(query);
    if (!q) return products.slice(0, SEARCH_RENDER_LIMIT).map((p) => ({ p, score: 0 }));

    const qTokens = q.split(" ").filter(Boolean);
    const out = [];

    for (const p of products) {
      const idx = p.indexNorm || "";
      const nm = p.nameNorm || "";
      let score = 0;

      if (idx === q) score += 1000;
      else if (idx.startsWith(q)) score += 700;
      else if (idx.includes(q)) score += 450;

      if (nm === q) score += 420;
      else if (nm.startsWith(q)) score += 320;
      else if (nm.includes(q)) score += 220;

      if (qTokens.length > 1 && qTokens.every((t) => nm.includes(t) || idx.includes(t))) {
        score += 140;
      }

      if (score > 0) out.push({ p, score });
    }

    out.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.p.name.localeCompare(b.p.name, "pl", { sensitivity: "base" });
    });

    return out.slice(0, SEARCH_RENDER_LIMIT);
  }

  function attachInteractions(products) {
    const search = document.getElementById("customStyleSearch");
    const select = document.getElementById("customStyleSelect");
    const info = document.getElementById("customStyleInfo");
    const addBtn = document.getElementById("customAddProductBtn");
    const saveDraftBtn = document.getElementById("customSaveDraftBtn");
    const draftListEl = document.getElementById("customDraftModulesList");
    const openDraftTrayBtn = document.getElementById("customOpenDraftTrayBtn");
    const showFlagToggle = document.getElementById("customShowFlagToggle");
    const showBarcodeToggle = document.getElementById("customShowBarcodeToggle");
    const showFlagToggleMark = document.getElementById("customShowFlagToggleMark");
    const showBarcodeToggleMark = document.getElementById("customShowBarcodeToggleMark");
    const priceColorInput = document.getElementById("customPriceColorInput");
    const priceStyleSelect = document.getElementById("customPriceStyleSelect");
    const priceTextColorInput = document.getElementById("customPriceTextColorInput");
    const currencySelect = document.getElementById("customCurrencySelect");
    const metaFontSelect = document.getElementById("customMetaFontSelect");
    const metaTextColorInput = document.getElementById("customMetaTextColorInput");
    const metaBoldToggle = document.getElementById("customMetaBoldToggle");
    const metaUnderlineToggle = document.getElementById("customMetaUnderlineToggle");
    const metaAlignSelect = document.getElementById("customMetaAlignSelect");
    const priceFontSelect = document.getElementById("customPriceFontSelect");
    const priceBoldToggle = document.getElementById("customPriceBoldToggle");
    const priceUnderlineToggle = document.getElementById("customPriceUnderlineToggle");
    const priceAlignSelect = document.getElementById("customPriceAlignSelect");
    const priceSizeMinusBtn = document.getElementById("customPriceSizeMinusBtn");
    const priceSizePlusBtn = document.getElementById("customPriceSizePlusBtn");
    const priceSizeValue = document.getElementById("customPriceSizeValue");
    const imageUploadInput = document.getElementById("customImageUploadInput");
    const addFamilyProductBtn = document.getElementById("customAddFamilyProductBtn");
    if (!search || !select || !info) return;
    if (addBtn) addBtn.onclick = () => addCurrentProductToCatalog();
    const productsById = new Map((Array.isArray(products) ? products : []).map((p) => [String(p.id), p]));
    const draftBridgeListeners = new Set();

    const getCurrentEditorSnapshot = () => {
      const previewProduct = getEffectivePreviewProduct() || currentPreviewProduct;
      if (!previewProduct) return null;
      const family = Array.isArray(currentFamilyProducts) ? currentFamilyProducts : [];
      const familyThumbUrl = family
        .map((item) => String(item?.url || "").trim())
        .find(Boolean) || "";
      const previewUrl = familyThumbUrl || getEffectivePreviewImageUrl() || currentPreviewImageUrl || "";
      const involved = new Set([String(previewProduct.id || "")]);
      family.forEach((item) => {
        const id = String(item?.product?.id || "");
        if (id) involved.add(id);
      });
      const nameOverrides = {};
      involved.forEach((id) => {
        if (customNameOverrides.has(id)) nameOverrides[id] = customNameOverrides.get(id);
      });
      return {
        id: `draft-${Date.now()}-${++customDraftModuleSeq}`,
        createdAt: Date.now(),
        productId: String(previewProduct.id || ""),
        productIndex: String(previewProduct.index || ""),
        productName: String(getDisplayName(previewProduct) || ""),
        previewImageUrl: String(previewUrl || ""),
        familyBaseProductId: String(familyBaseProduct?.id || ""),
        familyBaseImageUrl: String(familyBaseImageUrl || ""),
        familyProducts: family.map((item) => ({
          productId: String(item?.product?.id || ""),
          url: String(item?.url || "")
        })),
        nameOverrides,
        settings: {
          customPriceCircleColor,
          customPriceBadgeStyleId,
          customPriceTextColor,
          customCurrencySymbol,
          customPriceTextScale,
          customMetaFontFamily,
          customMetaTextColor,
          customMetaTextBold,
          customMetaTextUnderline,
          customMetaTextAlign,
          customPriceFontFamily,
          customPriceTextBold,
          customPriceTextUnderline,
          customPriceTextAlign,
          showFlag: !!customPreviewVisibility.showFlag,
          showBarcode: !!customPreviewVisibility.showBarcode
        }
      };
    };

    const applyAllControlValuesFromState = () => {
      if (showFlagToggleMark) applyToggleMark(showFlagToggleMark, !!customPreviewVisibility.showFlag);
      if (showBarcodeToggleMark) applyToggleMark(showBarcodeToggleMark, !!customPreviewVisibility.showBarcode);
      if (priceColorInput) priceColorInput.value = customPriceCircleColor || "#d71920";
      if (priceStyleSelect) priceStyleSelect.value = customPriceBadgeStyleId || "solid";
      if (priceTextColorInput) priceTextColorInput.value = customPriceTextColor || "#ffffff";
      if (currencySelect) currencySelect.value = customCurrencySymbol === "€" ? "€" : "£";
      if (priceSizeValue) priceSizeValue.textContent = `${Math.round((Number(customPriceTextScale) || 1) * 100)}%`;
      if (metaFontSelect) metaFontSelect.value = normalizeFontOption(customMetaFontFamily, "Arial");
      if (metaTextColorInput) metaTextColorInput.value = customMetaTextColor || "#1f3560";
      if (metaBoldToggle) applyMiniToggleButton(metaBoldToggle, !!customMetaTextBold);
      if (metaUnderlineToggle) applyMiniToggleButton(metaUnderlineToggle, !!customMetaTextUnderline);
      if (metaAlignSelect) metaAlignSelect.value = normalizeAlignOption(customMetaTextAlign, "left");
      if (priceFontSelect) priceFontSelect.value = normalizeFontOption(customPriceFontFamily, "Arial");
      if (priceBoldToggle) applyMiniToggleButton(priceBoldToggle, !!customPriceTextBold);
      if (priceUnderlineToggle) applyMiniToggleButton(priceUnderlineToggle, !!customPriceTextUnderline);
      if (priceAlignSelect) priceAlignSelect.value = normalizeAlignOption(customPriceTextAlign, "left");
    };

    const renderDraftModulesList = () => {
      if (!draftListEl) return;
      if (!Array.isArray(customDraftModules) || !customDraftModules.length) {
        draftListEl.innerHTML = `<div style="font-size:10px;color:#64748b;">Brak zapisanych modułów roboczych.</div>`;
        draftBridgeListeners.forEach((fn) => {
          try { fn([]); } catch (_err) {}
        });
        return;
      }
      draftListEl.innerHTML = customDraftModules.map((draft, idx) => {
        const p = productsById.get(String(draft.productId || ""));
        const title = escapeHtml(String(draft.productName || ((p && getDisplayName(p)) || `Produkt ${idx + 1}`)));
        const index = escapeHtml(String(draft.productIndex || p?.index || "-"));
        const familyThumb = (Array.isArray(draft.familyProducts) ? draft.familyProducts : [])
          .map((item) => String(item?.url || "").trim())
          .find(Boolean);
        const thumb = escapeHtml(String(familyThumb || draft.previewImageUrl || ""));
        const familyCount = Math.max(1, Array.isArray(draft.familyProducts) ? draft.familyProducts.length : 1);
        const familyThumbs = (Array.isArray(draft.familyProducts) ? draft.familyProducts : [])
          .map((item) => String(item?.url || "").trim())
          .filter(Boolean)
          .slice(0, 4);
        const thumbMarkup = familyThumbs.length > 1
          ? `<div style="width:68px;height:48px;border:1px solid #dbe4ef;border-radius:6px;background:#fff;padding:2px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2px;box-sizing:border-box;overflow:hidden;">
              ${familyThumbs.map((src) => `<div style="border:1px solid #eef2f7;border-radius:4px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="${escapeHtml(src)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`).join("")}
            </div>`
          : `<div style="width:68px;height:48px;border:1px solid #dbe4ef;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;">
              ${thumb ? `<img src="${thumb}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">` : `<span style="font-size:9px;color:#94a3b8;">brak</span>`}
            </div>`;
        const metaFont = escapeHtml(String(draft.settings?.customMetaFontFamily || "Arial"));
        const priceFont = escapeHtml(String(draft.settings?.customPriceFontFamily || "Arial"));
        const metaAlign = escapeHtml(String(draft.settings?.customMetaTextAlign || "left"));
        const priceAlign = escapeHtml(String(draft.settings?.customPriceTextAlign || "left"));
        const curr = escapeHtml(String(draft.settings?.customCurrencySymbol || "£"));
        const styleName = escapeHtml((PRICE_BADGE_STYLE_OPTIONS.find((o) => o.id === draft.settings?.customPriceBadgeStyleId)?.label) || "Kolor koła");
        return `
          <div data-draft-id="${escapeHtml(draft.id)}" style="display:grid;grid-template-columns:68px 1fr auto;gap:8px;align-items:start;border:1px solid #e2e8f0;border-radius:8px;padding:6px;background:#f8fafc;">
            ${thumbMarkup}
            <div style="min-width:0;">
              <div style="font-size:10px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">[${index}] ${title}</div>
              <div style="font-size:9px;color:#475569;margin-top:2px;">Rodzina: ${familyCount} • Waluta: ${curr} • Cena: ${styleName}</div>
              <div style="font-size:9px;color:#64748b;margin-top:2px;">Teksty: ${metaFont}, ${metaAlign}${draft.settings?.customMetaTextBold ? ", B" : ""}${draft.settings?.customMetaTextUnderline ? ", U" : ""}</div>
              <div style="font-size:9px;color:#64748b;">Cena: ${priceFont}, ${priceAlign}${draft.settings?.customPriceTextBold ? ", B" : ""}${draft.settings?.customPriceTextUnderline ? ", U" : ""}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <button data-action="edit" type="button" style="border:1px solid #0b8f84;background:#f0fdfa;color:#0b8f84;border-radius:6px;padding:4px 8px;font-size:10px;font-weight:700;cursor:pointer;">Edytuj</button>
              <button data-action="delete" type="button" style="border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:6px;padding:4px 8px;font-size:10px;cursor:pointer;">Usuń</button>
            </div>
          </div>
        `;
      }).join("");
      draftBridgeListeners.forEach((fn) => {
        try { fn((customDraftModules || []).slice()); } catch (_err) {}
      });
    };

    const restoreDraftToEditor = (draft) => {
      if (!draft) return;
      const s = draft.settings || {};
      customPriceCircleColor = String(s.customPriceCircleColor || customPriceCircleColor || "#d71920");
      customPriceBadgeStyleId = String(s.customPriceBadgeStyleId || customPriceBadgeStyleId || "solid");
      customPriceTextColor = String(s.customPriceTextColor || customPriceTextColor || "#ffffff");
      customCurrencySymbol = String(s.customCurrencySymbol || customCurrencySymbol || "£") === "€" ? "€" : "£";
      customPriceTextScale = Number.isFinite(Number(s.customPriceTextScale)) ? Number(s.customPriceTextScale) : (customPriceTextScale || 1);
      customMetaFontFamily = normalizeFontOption(s.customMetaFontFamily || customMetaFontFamily, "Arial");
      customMetaTextColor = String(s.customMetaTextColor || customMetaTextColor || "#1f3560");
      customMetaTextBold = !!s.customMetaTextBold;
      customMetaTextUnderline = !!s.customMetaTextUnderline;
      customMetaTextAlign = normalizeAlignOption(s.customMetaTextAlign || customMetaTextAlign, "left");
      customPriceFontFamily = normalizeFontOption(s.customPriceFontFamily || customPriceFontFamily, "Arial");
      customPriceTextBold = !!s.customPriceTextBold;
      customPriceTextUnderline = !!s.customPriceTextUnderline;
      customPriceTextAlign = normalizeAlignOption(s.customPriceTextAlign || customPriceTextAlign, "left");
      customPreviewVisibility.showFlag = !!s.showFlag;
      customPreviewVisibility.showBarcode = !!s.showBarcode;
      Object.entries(draft.nameOverrides || {}).forEach(([id, value]) => {
        if (id) customNameOverrides.set(String(id), String(value || ""));
      });

      const baseProduct = productsById.get(String(draft.familyBaseProductId || "")) || null;
      familyBaseProduct = baseProduct;
      familyBaseImageUrl = String(draft.familyBaseImageUrl || "");
      currentFamilyProducts = (Array.isArray(draft.familyProducts) ? draft.familyProducts : [])
        .map((item) => ({
          product: productsById.get(String(item?.productId || "")) || null,
          url: String(item?.url || "")
        }))
        .filter((item) => item.product);

      const targetProduct = productsById.get(String(draft.productId || "")) || null;
      currentPreviewProduct = targetProduct;
      currentPickerProduct = targetProduct;
      currentPreviewImageUrl = String(draft.previewImageUrl || "");
      currentPickerImageUrl = currentPreviewImageUrl;
      if (targetProduct && currentPreviewImageUrl) {
        customResolvedImageUrls.set(String(targetProduct.id), currentPreviewImageUrl);
      }
      if (select && targetProduct) select.value = String(targetProduct.id);
      updateInfo(info, targetProduct, products.length, products.length, Number.isFinite(rendered?.length) ? rendered.length : products.length);
      bindEditableName(targetProduct);
      applyAllControlValuesFromState();
      updateFamilyUiStatus("Wczytano moduł roboczy do edycji.", "success");
      if (targetProduct) renderProductImagePreview(targetProduct);
      renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      if (typeof window.showAppToast === "function") window.showAppToast("Wczytano moduł roboczy do podglądu.", "success");
    };

    if (saveDraftBtn) {
      saveDraftBtn.onclick = () => {
        const snap = getCurrentEditorSnapshot();
        if (!snap) {
          if (typeof window.showAppToast === "function") window.showAppToast("Najpierw wybierz produkt do podglądu.", "error");
          return;
        }
        customDraftModules = Array.isArray(customDraftModules) ? customDraftModules.slice() : [];
        customDraftModules.unshift(snap);
        customDraftModules = customDraftModules.slice(0, 24);
        renderDraftModulesList();
        if (typeof window.showAppToast === "function") window.showAppToast("Dodano moduł do listy roboczej.", "success");
      };
    }
    if (openDraftTrayBtn) {
      openDraftTrayBtn.onclick = () => {
        ensureStylWlasnyHelperScriptLoaded();
        const modal = document.getElementById("customStyleModal");
        if (modal) modal.style.display = "none";
        if (window.CustomStyleDraftTrayUI && typeof window.CustomStyleDraftTrayUI.open === "function") {
          window.CustomStyleDraftTrayUI.open();
        } else {
          window.dispatchEvent(new CustomEvent("customStyleDraftTrayOpenRequest"));
        }
      };
    }

    const placeDraftSnapshotDirectToPage = async (draftId, payload = {}) => {
      const draft = (Array.isArray(customDraftModules) ? customDraftModules : []).find((d) => String(d?.id || "") === String(draftId || ""));
      if (!draft) return { ok: false, error: "draft_not_found" };
      const stageRef = payload.stage || null;
      const page = (Array.isArray(window.pages) ? window.pages : []).find((p) => p && (p.stage === stageRef || p.number === payload.pageNumber)) || getActiveCatalogPage();
      const pointer = payload.pointer && Number.isFinite(payload.pointer.x) && Number.isFinite(payload.pointer.y) ? payload.pointer : null;
      if (!page || !page.stage || !page.layer || !pointer) return { ok: false, error: "page_or_pointer_missing" };

      restoreDraftToEditor(draft);
      const product = currentPreviewProduct;
      if (!product) return { ok: false, error: "product_restore_failed" };

      if (!Array.isArray(page.products)) page.products = [];
      if (!Array.isArray(page.slotObjects)) page.slotObjects = [];
      const occupiedSlots = new Set();
      page.products.forEach((p, i) => { if (p) occupiedSlots.add(i); });
      page.slotObjects.forEach((o, i) => { if (o) occupiedSlots.add(i); });
      if (page.layer && typeof page.layer.find === "function") {
        page.layer.find((n) => n && n.getAttr).forEach((n) => {
          const si = Number(n.getAttr("slotIndex"));
          const psi = Number(n.getAttr("preservedSlotIndex"));
          if (Number.isFinite(si) && si >= 0) occupiedSlots.add(si);
          if (Number.isFinite(psi) && psi >= 0) occupiedSlots.add(psi);
        });
      }
      let slotIndex = page.products.length;
      if (occupiedSlots.size) slotIndex = Math.max(slotIndex, Math.max(...Array.from(occupiedSlots)) + 1);
      while (occupiedSlots.has(slotIndex) || page.products[slotIndex]) slotIndex += 1;

      const family = Array.isArray(currentFamilyProducts) ? currentFamilyProducts : [];
      const familyImageUrls = family.map((item) => String(item?.url || "").trim()).filter(Boolean);
      const effectiveImageUrl = getEffectivePreviewImageUrl();
      const preloadTargets = familyImageUrls.length > 1 ? familyImageUrls : [effectiveImageUrl].filter(Boolean);
      await Promise.allSettled([preloadImageUrls(preloadTargets, 1400), waitMs(80)]);

      const catalogEntry = buildCatalogProductFromCustom(product);
      page.products[slotIndex] = catalogEntry;
      page.slotObjects[slotIndex] = null;

      const added = await addDirectCustomModuleToPage(page, slotIndex, pointer, catalogEntry, {
        effectiveImageUrl
      });
      if (!added) return { ok: false, error: "direct_add_failed" };

      document.activeStage = page.stage;
      window.dispatchEvent(new CustomEvent("canvasModified", { detail: page.stage }));
      window.projectOpen = true;
      window.projectDirty = true;

      customDraftModules = (Array.isArray(customDraftModules) ? customDraftModules : []).filter((d) => String(d?.id || "") !== String(draftId || ""));
      renderDraftModulesList();
      if (typeof window.showAppToast === "function") window.showAppToast("Przeciągnięto moduł na stronę katalogu.", "success");
      return { ok: true, slotIndex };
    };

    window.CustomStyleDraftBridge = {
      getDrafts: () => (Array.isArray(customDraftModules) ? customDraftModules.slice() : []),
      subscribe(listener) {
        if (typeof listener !== "function") return () => {};
        draftBridgeListeners.add(listener);
        try { listener((customDraftModules || []).slice()); } catch (_err) {}
        return () => draftBridgeListeners.delete(listener);
      },
      openDraftInEditor: (draftId) => {
        const draft = (Array.isArray(customDraftModules) ? customDraftModules : []).find((d) => String(d?.id || "") === String(draftId || ""));
        if (!draft) return false;
        const modal = document.getElementById("customStyleModal");
        if (modal) modal.style.display = "flex";
        if (window.CustomStyleDraftTrayUI && typeof window.CustomStyleDraftTrayUI.close === "function") {
          try { window.CustomStyleDraftTrayUI.close(); } catch (_err) {}
        }
        restoreDraftToEditor(draft);
        return true;
      },
      removeDraft: (draftId) => {
        const before = Array.isArray(customDraftModules) ? customDraftModules.length : 0;
        customDraftModules = (Array.isArray(customDraftModules) ? customDraftModules : []).filter((d) => String(d?.id || "") !== String(draftId || ""));
        renderDraftModulesList();
        return (customDraftModules.length !== before);
      },
      dropDraftToPage: placeDraftSnapshotDirectToPage,
      requestOpenTray: () => {
        if (window.CustomStyleDraftTrayUI && typeof window.CustomStyleDraftTrayUI.open === "function") window.CustomStyleDraftTrayUI.open();
      }
    };
    if (draftListEl) {
      draftListEl.onclick = (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("button[data-action]") : null;
        const row = e.target && e.target.closest ? e.target.closest("[data-draft-id]") : null;
        if (!btn || !row) return;
        const id = String(row.getAttribute("data-draft-id") || "");
        if (!id) return;
        const draft = (Array.isArray(customDraftModules) ? customDraftModules : []).find((d) => String(d?.id || "") === id);
        if (!draft) return;
        const action = String(btn.getAttribute("data-action") || "");
        if (action === "edit") {
          restoreDraftToEditor(draft);
          return;
        }
        if (action === "delete") {
          customDraftModules = (Array.isArray(customDraftModules) ? customDraftModules : []).filter((d) => String(d?.id || "") !== id);
          renderDraftModulesList();
        }
      };
    }
    renderDraftModulesList();
    if (info) {
      info.onclick = (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("#customImportImageBtn") : null;
        if (!btn || !imageUploadInput) return;
        if (!currentPreviewProduct) return;
        imageUploadInput.dataset.productId = currentPreviewProduct.id;
        imageUploadInput.value = "";
        imageUploadInput.click();
      };
    }
    if (imageUploadInput) {
      imageUploadInput.onchange = () => {
        const file = imageUploadInput.files && imageUploadInput.files[0];
        if (!file) return;
        const targetId = imageUploadInput.dataset.productId || currentPreviewProduct?.id || "";
        if (!targetId) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          if (!dataUrl.startsWith("data:image/")) return;
          customImageOverrides.set(targetId, dataUrl);
          const targetProduct = products.find((p) => p.id === targetId) || currentPreviewProduct;
          if (targetProduct) {
            currentPreviewProduct = targetProduct;
            renderProductImagePreview(targetProduct);
          }
        };
        reader.readAsDataURL(file);
      };
    }
    const applyToggleMark = (markEl, enabled) => {
      if (!markEl) return;
      markEl.textContent = enabled ? "✓" : "✕";
      markEl.style.color = enabled ? "#0b8f84" : "#b91c1c";
      markEl.style.borderColor = enabled ? "#0b8f84" : "#b91c1c";
    };
    const applyMiniToggleButton = (btn, enabled) => {
      if (!btn) return;
      btn.style.borderColor = enabled ? "#0b8f84" : "#d7dfec";
      btn.style.background = enabled ? "#f0fdfa" : "#fff";
      btn.style.color = enabled ? "#0b8f84" : "#0f172a";
    };
    if (showFlagToggle) {
      applyToggleMark(showFlagToggleMark, !!customPreviewVisibility.showFlag);
      showFlagToggle.onclick = () => {
        customPreviewVisibility.showFlag = !customPreviewVisibility.showFlag;
        applyToggleMark(showFlagToggleMark, !!customPreviewVisibility.showFlag);
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (showBarcodeToggle) {
      applyToggleMark(showBarcodeToggleMark, !!customPreviewVisibility.showBarcode);
      showBarcodeToggle.onclick = () => {
        customPreviewVisibility.showBarcode = !customPreviewVisibility.showBarcode;
        applyToggleMark(showBarcodeToggleMark, !!customPreviewVisibility.showBarcode);
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (priceColorInput) {
      priceColorInput.value = customPriceCircleColor || "#d71920";
      priceColorInput.oninput = () => {
        customPriceCircleColor = priceColorInput.value || "#d71920";
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (priceStyleSelect) {
      priceStyleSelect.value = customPriceBadgeStyleId || "solid";
      priceStyleSelect.onchange = () => {
        customPriceBadgeStyleId = String(priceStyleSelect.value || "solid");
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (priceTextColorInput) {
      priceTextColorInput.value = customPriceTextColor || "#ffffff";
      priceTextColorInput.oninput = () => {
        customPriceTextColor = priceTextColorInput.value || "#ffffff";
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (metaFontSelect) {
      metaFontSelect.value = normalizeFontOption(customMetaFontFamily, "Arial");
      metaFontSelect.onchange = () => {
        customMetaFontFamily = normalizeFontOption(metaFontSelect.value, "Arial");
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (metaTextColorInput) {
      metaTextColorInput.value = customMetaTextColor || "#1f3560";
      metaTextColorInput.oninput = () => {
        customMetaTextColor = metaTextColorInput.value || "#1f3560";
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (metaBoldToggle) {
      applyMiniToggleButton(metaBoldToggle, !!customMetaTextBold);
      metaBoldToggle.onclick = () => {
        customMetaTextBold = !customMetaTextBold;
        applyMiniToggleButton(metaBoldToggle, !!customMetaTextBold);
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (metaUnderlineToggle) {
      applyMiniToggleButton(metaUnderlineToggle, !!customMetaTextUnderline);
      metaUnderlineToggle.onclick = () => {
        customMetaTextUnderline = !customMetaTextUnderline;
        applyMiniToggleButton(metaUnderlineToggle, !!customMetaTextUnderline);
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (metaAlignSelect) {
      metaAlignSelect.value = normalizeAlignOption(customMetaTextAlign, "left");
      metaAlignSelect.onchange = () => {
        customMetaTextAlign = normalizeAlignOption(metaAlignSelect.value, "left");
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (priceFontSelect) {
      priceFontSelect.value = normalizeFontOption(customPriceFontFamily, "Arial");
      priceFontSelect.onchange = () => {
        customPriceFontFamily = normalizeFontOption(priceFontSelect.value, "Arial");
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (priceBoldToggle) {
      applyMiniToggleButton(priceBoldToggle, !!customPriceTextBold);
      priceBoldToggle.onclick = () => {
        customPriceTextBold = !customPriceTextBold;
        applyMiniToggleButton(priceBoldToggle, !!customPriceTextBold);
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (priceUnderlineToggle) {
      applyMiniToggleButton(priceUnderlineToggle, !!customPriceTextUnderline);
      priceUnderlineToggle.onclick = () => {
        customPriceTextUnderline = !customPriceTextUnderline;
        applyMiniToggleButton(priceUnderlineToggle, !!customPriceTextUnderline);
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (priceAlignSelect) {
      priceAlignSelect.value = normalizeAlignOption(customPriceTextAlign, "left");
      priceAlignSelect.onchange = () => {
        customPriceTextAlign = normalizeAlignOption(priceAlignSelect.value, "left");
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    if (currencySelect) {
      currencySelect.value = customCurrencySymbol === "€" ? "€" : "£";
      currencySelect.onchange = () => {
        customCurrencySymbol = String(currencySelect.value || "£").trim() === "€" ? "€" : "£";
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      };
    }
    const setPriceScale = (next) => {
      const rounded = Math.round(next * 100) / 100;
      customPriceTextScale = Math.max(0.6, Math.min(1.8, rounded));
      if (priceSizeValue) priceSizeValue.textContent = `${Math.round(customPriceTextScale * 100)}%`;
      renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
    };
    if (priceSizeValue) priceSizeValue.textContent = `${Math.round(customPriceTextScale * 100)}%`;
    if (priceSizeMinusBtn) priceSizeMinusBtn.onclick = () => setPriceScale(customPriceTextScale - 0.05);
    if (priceSizePlusBtn) priceSizePlusBtn.onclick = () => setPriceScale(customPriceTextScale + 0.05);
    updateFamilyUiStatus();
    if (addFamilyProductBtn) {
      addFamilyProductBtn.onclick = () => {
        if (!currentPreviewProduct) return;
        if (!familyBaseProduct) {
          ensureBaseFamilyState();
          updateFamilyUiStatus(`Ustawiono bazę rodziny: ${currentPreviewProduct?.index || "-"}. Wybierz inny produkt i kliknij ponownie.`, "success");
          renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
          if (typeof window.showAppToast === "function") {
            window.showAppToast("Ustawiono produkt bazowy rodziny. Wybierz inny produkt i kliknij ponownie.", "success");
          }
          return;
        }
        const picked = currentPreviewProduct;
        if (familyBaseProduct && picked.id === familyBaseProduct.id) {
          updateFamilyUiStatus("Ten sam produkt jest już bazą rodziny. Wybierz inny produkt z listy.", "error");
          if (typeof window.showAppToast === "function") {
            window.showAppToast("Wybierz inny produkt, aby dodać go do rodziny.", "error");
          }
          return;
        }
        resolveProductImageUrl(picked, (url) => {
          const family = Array.isArray(currentFamilyProducts) ? currentFamilyProducts.slice() : [];
          const exists = family.some((item) => item && item.product && item.product.id === picked.id);
          if (exists) {
            updateFamilyUiStatus(`Produkt ${picked.index || ""} jest już dodany do rodziny.`, "error");
            if (typeof window.showAppToast === "function") {
              window.showAppToast("Ten produkt jest już dodany do rodziny.", "error");
            }
            return;
          }
          family.push({ product: picked, url: url || null });
          currentFamilyProducts = family;
          updateFamilyUiStatus(`Dodano do rodziny: ${picked.index || "-"}.`, "success");
          renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
        });
      };
    }

    let filtered = products.slice();
    let rendered = filtered.slice(0, SEARCH_RENDER_LIMIT);
    let debounceTimer = null;

    const applyFilter = () => {
      const q = String(search.value || "");
      const ranked = rankAndFilter(products, q);
      rendered = ranked.map((r) => r.p);
      filtered = normalizeText(q) ? products.filter((p) => {
        const qq = normalizeText(q);
        return p.nameNorm.includes(qq) || p.indexNorm.includes(qq);
      }) : products.slice();

      renderSelect(select, rendered);

      const selected = rendered[0] || null;
      if (selected) select.value = selected.id;
      updateInfo(info, selected, products.length, filtered.length, rendered.length);
      bindEditableName(selected);
      currentPreviewProduct = selected || null;
      currentPickerProduct = selected || null;
      currentPickerImageUrl = currentPreviewImageUrl;
      updateFamilyUiStatus(
        familyBaseProduct
          ? `Wybrany produkt: ${selected?.index || "-"}. Kliknij "Dodaj do rodziny", aby dodać go do aktywnej rodziny.`
          : "Kliknij przycisk, aby ustawić wybrany produkt jako bazę rodziny.",
        "info"
      );
      if (!familyBaseProduct) {
        renderModulePreview(currentPreviewProduct, currentPreviewImageUrl);
      } else {
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      }
      if (selected) renderProductImagePreview(selected);
    };

    const onSelectChange = () => {
      const id = select.value;
      const selected = rendered.find((p) => p.id === id) || rendered[0] || null;
      updateInfo(info, selected, products.length, filtered.length, rendered.length);
      bindEditableName(selected);
      currentPreviewProduct = selected || null;
      currentPickerProduct = selected || null;
      currentPickerImageUrl = currentPreviewImageUrl;
      updateFamilyUiStatus(
        familyBaseProduct
          ? `Wybrany produkt: ${selected?.index || "-"}. Kliknij "Dodaj do rodziny", aby dodać go do aktywnej rodziny.`
          : "Kliknij przycisk, aby ustawić wybrany produkt jako bazę rodziny.",
        "info"
      );
      if (!familyBaseProduct) {
        renderModulePreview(currentPreviewProduct, currentPreviewImageUrl);
      } else {
        renderModulePreview(getEffectivePreviewProduct(), getEffectivePreviewImageUrl());
      }
      if (selected) renderProductImagePreview(selected);
    };

    search.oninput = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilter, 120);
    };
    search.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyFilter();
      }
    };
    select.onchange = onSelectChange;

    applyFilter();
  }

  window.openCustomStyleCreator = async function () {
    ensureStylWlasnyHelperScriptLoaded();
    ensureModal();

    const modal = document.getElementById("customStyleModal");
    const info = document.getElementById("customStyleInfo");
    if (!modal) return;

    modal.style.display = "flex";

    if (info) info.textContent = "Ładowanie produktów...";

    try {
      const products = await loadProducts();
      attachInteractions(products);
    } catch (err) {
      if (info) {
        info.innerHTML = `
          <div style="color:#b91c1c;font-weight:700;">Nie udało się pobrać bazy danych.</div>
          <div style="margin-top:6px;color:#64748b;">Szczegóły: ${String(err && err.message ? err.message : err)}</div>
        `;
      }
    }
  };

  function bindSidebarTrigger() {
    const trigger = document.getElementById("addCatalogProductsBtn");
    if (!trigger) return;

    const isCatalogContextReady = () => {
      const editorView = document.getElementById("editorView");
      const startView = document.getElementById("startProjectsView");
      const editorVisible = !!editorView && window.getComputedStyle(editorView).display !== "none";
      const startVisible = !!startView && window.getComputedStyle(startView).display !== "none";
      const hasPages = Array.isArray(window.pages) && window.pages.length > 0;
      return editorVisible && !startVisible && hasPages;
    };

    const updateTriggerState = () => {
      const enabled = isCatalogContextReady();
      trigger.style.opacity = enabled ? "1" : "0.45";
      trigger.style.cursor = enabled ? "pointer" : "not-allowed";
      trigger.setAttribute(
        "title",
        enabled
          ? "Dodaj produkty do katalogu"
          : "Najpierw dodaj pustą stronę lub zaimportuj Excel"
      );
    };

    updateTriggerState();

    const pagesContainer = document.getElementById("pagesContainer");
    if (pagesContainer && "MutationObserver" in window) {
      const observer = new MutationObserver(updateTriggerState);
      observer.observe(pagesContainer, { childList: true, subtree: false });
    }
    const editorView = document.getElementById("editorView");
    if (editorView && "MutationObserver" in window) {
      const observer = new MutationObserver(updateTriggerState);
      observer.observe(editorView, { attributes: true, attributeFilter: ["style", "class"] });
    }
    const startView = document.getElementById("startProjectsView");
    if (startView && "MutationObserver" in window) {
      const observer = new MutationObserver(updateTriggerState);
      observer.observe(startView, { attributes: true, attributeFilter: ["style", "class"] });
    }
    window.addEventListener("pageshow", updateTriggerState);
    window.addEventListener("focus", updateTriggerState);

    trigger.addEventListener("click", () => {
      updateTriggerState();
      if (!isCatalogContextReady()) {
        if (typeof window.showAppToast === "function") {
          window.showAppToast("Najpierw dodaj pustą stronę lub zaimportuj plik Excel.", "error");
        }
        return;
      }
      if (typeof window.openCustomStyleCreator === "function") {
        window.openCustomStyleCreator();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindSidebarTrigger);
  } else {
    bindSidebarTrigger();
  }

  window.CUSTOM_STYLE_CODE = STYLE_CUSTOM;
})();
