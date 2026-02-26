(function () {
  const STYLE_CUSTOM = "styl_wlasny";
  const DATA_URL = "https://raw.githubusercontent.com/MasterMM2025/masterzamowienia/main/baza%20danych%20-%20rumunia.json";

  let cachedProducts = null;
  let loadingPromise = null;
  const SEARCH_RENDER_LIMIT = 300;
  const IMAGE_BUCKET_BASE = "https://firebasestorage.googleapis.com/v0/b/pdf-creator-f7a8b.firebasestorage.app/o/";
  const IMAGE_FOLDER = "zdjecia - World food";
  const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
  let currentPreviewProduct = null;
  let currentPreviewImageUrl = null;
  const customNameOverrides = new Map();

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
          </div>

          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#f8fafc;">
            <div style="font-size:11px;font-weight:700;color:#0f172a;margin-bottom:8px;">Podgląd modułu 1:1 (styl elegancki)</div>
            <div id="customPreviewCard" style="position:relative;width:100%;aspect-ratio:1.38/1;background:#ffffff;border:1px solid #dbe4ef;border-radius:12px;overflow:hidden;">
              <img id="customPreviewImage" alt="Podgląd produktu" style="position:absolute;left:0%;top:4%;width:48%;height:83%;object-fit:contain;">
              <div id="customPreviewName" style="position:absolute;left:49%;top:50%;width:47%;font-size:10px;line-height:1.02;font-weight:600;color:#111827;text-align:left;"></div>
              <div id="customPreviewIndex" style="position:absolute;left:49%;top:62%;font-size:11px;font-weight:700;color:#111827;"></div>
              <div id="customPreviewFlag" style="position:absolute;left:49%;top:72%;width:34%;height:3%;display:flex;border-radius:2px;overflow:hidden;border:1px solid rgba(0,0,0,.08);">
                <span style="flex:1;background:#22409a;"></span>
                <span style="flex:1;background:#f3d31f;"></span>
                <span style="flex:1;background:#c4003a;"></span>
              </div>
              <div id="customPreviewPriceCircle" style="position:absolute;left:22%;top:58%;width:84px;height:84px;border-radius:50%;background:#d71920;display:flex;align-items:center;justify-content:center;color:#fff;z-index:2;">
                <div style="display:flex;align-items:center;gap:5px;">
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
              <button
                id="customAddProductBtn"
                type="button"
                style="border:1px solid #0b8f84;background:#0fb5a8;color:#fff;border-radius:10px;padding:8px 12px;font-size:11px;font-weight:700;cursor:pointer;"
              >
                Dodaj produkt do katalogu
              </button>
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
        renderModulePreview(currentPreviewProduct, currentPreviewImageUrl);
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
      img.onload = () => onReady(url);
      img.onerror = tryNext;
      img.src = url;
    };
    tryNext();
  }

  function renderProductImagePreview(product) {
    const box = document.getElementById("customStyleImageBox");
    if (!box) return;
    box.textContent = "szukam...";
    box.style.color = "#94a3b8";
    const stamp = `${product?.id || ""}-${Date.now()}`;
    box.setAttribute("data-stamp", stamp);

    loadImageWithFallback(product?.index, (url) => {
      const current = document.getElementById("customStyleImageBox");
      if (!current || current.getAttribute("data-stamp") !== stamp) return;
      if (!url) {
        current.textContent = "brak";
        current.style.color = "#94a3b8";
        currentPreviewImageUrl = null;
        renderModulePreview(currentPreviewProduct, null);
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
      renderModulePreview(currentPreviewProduct, currentPreviewImageUrl);
    });
  }

  function renderModulePreview(product, imageUrl) {
    const nameEl = document.getElementById("customPreviewName");
    const indexEl = document.getElementById("customPreviewIndex");
    const imageEl = document.getElementById("customPreviewImage");
    const mainEl = document.getElementById("customPreviewPriceMain");
    const decEl = document.getElementById("customPreviewPriceDec");
    const unitEl = document.getElementById("customPreviewPriceUnit");
    const barcodeEl = document.getElementById("customPreviewBarcode");
    const barcodeWrap = document.getElementById("customPreviewBarcodeWrap");
    const priceCircle = document.getElementById("customPreviewPriceCircle");

    if (!nameEl || !indexEl || !imageEl || !mainEl || !decEl || !unitEl || !barcodeEl) return;
    if (!product) {
      nameEl.textContent = "";
      indexEl.textContent = "";
      imageEl.removeAttribute("src");
      mainEl.textContent = "0";
      decEl.textContent = "00";
      unitEl.textContent = "£ / SZT.";
      barcodeEl.innerHTML = "";
      return;
    }

    nameEl.textContent = getDisplayName(product);
    indexEl.textContent = `Indeks: ${product.index || "-"}`;
    if (imageUrl) imageEl.src = imageUrl;
    else imageEl.removeAttribute("src");

    const price = formatPrice(product.netto);
    mainEl.textContent = price.main;
    decEl.textContent = price.dec;
    unitEl.textContent = `${price.currency} / SZT.`;

    // Skalowanie ceny proporcjonalnie do podglądu (bliżej stylu eleganckiego 1:1).
    if (priceCircle) {
      const card = document.getElementById("customPreviewCard");
      const base = card ? Math.max(68, Math.round(card.clientWidth * 0.18)) : 84;
      priceCircle.style.width = `${base}px`;
      priceCircle.style.height = `${base}px`;
      mainEl.style.fontSize = `${Math.max(24, Math.round(base * 0.38))}px`;
      decEl.style.fontSize = `${Math.max(10, Math.round(base * 0.14))}px`;
      unitEl.style.fontSize = `${Math.max(8, Math.round(base * 0.11))}px`;
    }

    const eanDigits = scientificToPlain(product.ean);
    barcodeEl.innerHTML = "";
    if (barcodeWrap) {
      barcodeWrap.style.left = "40%";
      barcodeWrap.style.top = "76%";
      barcodeWrap.style.width = "49%";
      barcodeWrap.style.height = "22%";
    }
    if (window.JsBarcode && eanDigits) {
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
    const name = getDisplayName(product);
    const ean = scientificToPlain(product.ean);
    const countryRaw = String(product?.raw?.["text-left 3"] || "RUMUNIA").trim();
    return {
      INDEKS: String(product.index || "").trim(),
      NAZWA: name || "-",
      JEDNOSTKA: String(product.packageUnit || "SZT").trim() || "SZT",
      CENA: String(product.netto || "0.00").trim() || "0.00",
      "KOD EAN": ean || "",
      TNZ: String(product?.raw?.["text-right"] || "").trim(),
      LOGO: String(product?.raw?.["text-left 2"] || "").trim(),
      KRAJPOCHODZENIA: countryRaw || "RUMUNIA"
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
    const modal = document.getElementById("customStyleModal");
    if (modal) modal.style.display = "none";
    if (!stage) return;

    const container = stage.container();
    if (container) container.style.cursor = "crosshair";
    if (typeof window.showAppToast === "function") {
      window.showAppToast("Kliknij na stronie miejsce wstawienia produktu.", "success");
    }

    const detachPlacement = () => {
      stage.off("mousedown.customPlaceProduct touchstart.customPlaceProduct");
      if (container) container.style.cursor = "default";
      document.removeEventListener("keydown", onEsc, true);
    };

    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      detachPlacement();
      if (typeof window.showAppToast === "function") {
        window.showAppToast("Anulowano wstawianie produktu.", "error");
      }
    };

    const onPlace = (e) => {
      e.cancelBubble = true;
      const pointer = stage.getPointerPosition();
      detachPlacement();
      if (!pointer) return;

      const mode = window.LAYOUT_MODE === "layout8" ? "layout8" : "layout6";
      const maxSlots = mode === "layout8" ? 8 : 6;
      if (!Array.isArray(page.products)) page.products = [];

      let slotIndex = page.products.findIndex((p) => !p);
      if (slotIndex < 0) slotIndex = page.products.length;
      if (slotIndex >= maxSlots) {
        if (typeof window.showAppToast === "function") {
          window.showAppToast("Aktualna strona jest pełna. Dodaj nową stronę.", "error");
        }
        return;
      }

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
          const clone = g.clone({ listening: true, draggable: true });
          clearSlotBindingRecursive(clone);
          clone.setAttr("isAutoSlotGroup", true);
          clone.setAttr("preservedSlotIndex", slot);
          clone.setAttr("slotIndex", null);
          saved.push({ slot, group: clone });
          g.destroy();
        });
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
      }

      const preservedGroups = preserveManagedGroupsBeforeRedraw();

      page.products[slotIndex] = buildCatalogProductFromCustom(product);
      if (!Array.isArray(page.slotObjects)) page.slotObjects = [];
      if (!Array.isArray(page.barcodeObjects)) page.barcodeObjects = [];
      if (!Array.isArray(page.barcodePositions)) page.barcodePositions = [];
      if (!Array.isArray(page.boxScales)) page.boxScales = [];

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

      const regroupNewSlotOnly = () => autoGroupSlot(slotIndex, true);

      const finalize = () => {
        if (typeof window.applyCatalogStyle === "function") {
          window.applyCatalogStyle("styl_elegancki");
        } else {
          window.CATALOG_STYLE = "styl_elegancki";
        }
        if (typeof window.redrawCatalogPageForCustomStyle === "function") {
          window.redrawCatalogPageForCustomStyle(page);
        }
        if (typeof window.applyCatalogStyleVisual === "function") {
          window.applyCatalogStyleVisual("styl_elegancki");
          setTimeout(() => window.applyCatalogStyleVisual("styl_elegancki"), 120);
          setTimeout(() => window.applyCatalogStyleVisual("styl_elegancki"), 320);
          setTimeout(() => window.applyCatalogStyleVisual("styl_elegancki"), 900);
        }
        restoreManagedGroupsAfterRedraw(preservedGroups, slotIndex);
        [220, 520, 900, 1300, 1800].forEach((ms) => setTimeout(regroupNewSlotOnly, ms));
        [620, 980, 1400, 1900].forEach((ms) => setTimeout(placeGroupAtPointer, ms));
        document.activeStage = page.stage;
        window.dispatchEvent(new CustomEvent("canvasModified", { detail: page.stage }));
        window.projectOpen = true;
        window.projectDirty = true;
        if (typeof window.showAppToast === "function") {
          window.showAppToast(`Dodano produkt do strony (slot ${slotIndex + 1}).`, "success");
        }
      };

      if (currentPreviewImageUrl && window.Konva && typeof window.Konva.Image.fromURL === "function") {
        window.Konva.Image.fromURL(currentPreviewImageUrl, (img) => {
          page.slotObjects[slotIndex] = img || null;
          finalize();
        });
      } else {
        page.slotObjects[slotIndex] = null;
        finalize();
      }
    };

    document.addEventListener("keydown", onEsc, true);
    stage.on("mousedown.customPlaceProduct touchstart.customPlaceProduct", onPlace);
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
    if (!search || !select || !info) return;
    if (addBtn) addBtn.onclick = () => addCurrentProductToCatalog();

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
      renderModulePreview(currentPreviewProduct, currentPreviewImageUrl);
      if (selected) renderProductImagePreview(selected);
    };

    const onSelectChange = () => {
      const id = select.value;
      const selected = rendered.find((p) => p.id === id) || rendered[0] || null;
      updateInfo(info, selected, products.length, filtered.length, rendered.length);
      bindEditableName(selected);
      currentPreviewProduct = selected || null;
      renderModulePreview(currentPreviewProduct, currentPreviewImageUrl);
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
