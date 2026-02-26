(function () {
  const TRAY_ID = "customStyleDraftTray";
  let trayInitialized = false;
  let unsubscribe = null;
  let subscribedBridge = null;
  let currentDrafts = [];
  let dragDraftId = null;
  let lastRenderedDraftCount = 0;

  function getBridge() {
    return window.CustomStyleDraftBridge || null;
  }

  function ensureTray() {
    if (document.getElementById(TRAY_ID)) return document.getElementById(TRAY_ID);
    const el = document.createElement("div");
    el.id = TRAY_ID;
    el.style.cssText = [
      "position:fixed",
      "top:88px",
      "right:18px",
      "width:304px",
      "height:min(72vh,620px)",
      "max-height:72vh",
      "background:#ffffff",
      "border:1px solid #dbe4ef",
      "border-radius:14px",
      "box-shadow:0 18px 42px rgba(15,23,42,.16)",
      "z-index:1000002",
      "display:none",
      "flex-direction:column",
      "overflow:hidden",
      "font-family:Inter,Arial,sans-serif"
    ].join(";");

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 10px 8px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
        <div>
          <div style="font-size:12px;font-weight:800;color:#0f172a;line-height:1.2;">Produkty do dodania</div>
          <div style="font-size:9px;color:#64748b;margin-top:2px;">Przeciągnij na stronę katalogu</div>
        </div>
        <button id="${TRAY_ID}_close" type="button" style="border:1px solid #dbe4ef;background:#fff;color:#1f2937;font-size:15px;line-height:1;padding:6px 8px;border-radius:8px;cursor:pointer;">✕</button>
      </div>
      <div id="${TRAY_ID}_count" style="padding:7px 10px 3px;border-bottom:0;background:#ffffff;font-size:10px;color:#334155;font-weight:700;">
        Pozostało: 0 produktów
      </div>
      <div style="padding:3px 10px 7px;border-bottom:1px solid #e5e7eb;background:#ffffff;font-size:9px;color:#64748b;">
        Po upuszczeniu moduł znika z kolejki.
      </div>
      <div id="${TRAY_ID}_list" style="flex:1;overflow:auto;padding:10px;display:grid;gap:8px;">
        <div style="font-size:10px;color:#64748b;">Brak elementów.</div>
      </div>
    `;
    document.body.appendChild(el);

    const closeBtn = document.getElementById(`${TRAY_ID}_close`);
    if (closeBtn) closeBtn.onclick = () => hideTray();
    return el;
  }

  function showTray() {
    const el = ensureTray();
    el.style.display = "flex";
    attachStageDropTargets();
    bindBridge();
    const bridge = getBridge();
    if (bridge && typeof bridge.getDrafts === "function") {
      renderDrafts(bridge.getDrafts());
    } else {
      renderDrafts(currentDrafts);
    }
  }

  function hideTray() {
    const el = document.getElementById(TRAY_ID);
    if (el) el.style.display = "none";
  }

  function isTrayOpen() {
    const el = document.getElementById(TRAY_ID);
    return !!el && el.style.display !== "none";
  }

  function renderDrafts(drafts) {
    currentDrafts = Array.isArray(drafts) ? drafts.slice() : [];
    const nextCount = currentDrafts.length;
    const countEl = document.getElementById(`${TRAY_ID}_count`);
    if (countEl) {
      countEl.textContent = `Pozostało: ${nextCount} ${nextCount === 1 ? "produkt" : (nextCount >= 2 && nextCount <= 4 ? "produkty" : "produktów")}`;
    }
    const list = document.getElementById(`${TRAY_ID}_list`);
    if (!list) return;
    if (!currentDrafts.length) {
      list.innerHTML = `<div style="font-size:10px;color:#64748b;">Brak elementów w kolejce.</div>`;
      if (lastRenderedDraftCount > 0 && isTrayOpen()) {
        setTimeout(() => {
          if ((currentDrafts || []).length === 0) hideTray();
        }, 80);
      }
      lastRenderedDraftCount = 0;
      return;
    }
    const buildThumbMarkup = (draft) => {
      const familyThumbs = (Array.isArray(draft?.familyProducts) ? draft.familyProducts : [])
        .map((item) => String(item?.url || "").trim())
        .filter(Boolean)
        .slice(0, 4);
      if (familyThumbs.length > 1) {
        const cells = familyThumbs.map((src) => `
          <div style="border:1px solid #e2e8f0;border-radius:5px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;">
            <img src="${escapeHtml(src)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">
          </div>
        `).join("");
        return `
          <div style="width:88px;height:58px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:3px;box-sizing:border-box;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3px;overflow:hidden;">
            ${cells}
          </div>
        `;
      }
      const singleThumb = familyThumbs[0] || String(draft?.previewImageUrl || "").trim();
      return `
        <div style="width:88px;height:58px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          ${singleThumb ? `<img src="${escapeHtml(singleThumb)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">` : `<span style="font-size:9px;color:#94a3b8;">brak</span>`}
        </div>
      `;
    };
    list.innerHTML = currentDrafts.map((draft) => {
      const familyThumb = (Array.isArray(draft?.familyProducts) ? draft.familyProducts : [])
        .map((item) => String(item?.url || "").trim())
        .find(Boolean);
      const thumb = String(familyThumb || draft?.previewImageUrl || "").trim();
      const title = String(draft?.nameOverrides?.[draft?.productId] || draft?.productName || "").trim();
      const index = String(draft?.productIndex || "").trim();
      const familyCount = Math.max(1, Array.isArray(draft?.familyProducts) ? draft.familyProducts.length : 1);
      const currency = String(draft?.settings?.customCurrencySymbol || "£");
      return `
        <div data-draft-id="${escapeHtml(String(draft.id || ""))}" draggable="true"
             style="display:grid;grid-template-columns:88px 1fr;gap:10px;align-items:center;border:1px solid #dbe4ef;border-radius:10px;padding:8px;background:#fff;cursor:grab;">
          ${buildThumbMarkup(draft)}
          <div style="min-width:0;">
            <div style="font-size:11px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(index ? `[${index}] ${title || draft?.productId || ""}` : (title || draft?.productId || ""))}</div>
            <div style="font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Rodzina: ${familyCount} • ${escapeHtml(currency)}</div>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-draft-id]").forEach((item) => {
      item.addEventListener("dragstart", (e) => {
        dragDraftId = String(item.getAttribute("data-draft-id") || "");
        item.style.opacity = "0.55";
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", dragDraftId);
          e.dataTransfer.setData("application/x-custom-style-draft", dragDraftId);
        }
      });
      item.addEventListener("dragend", () => {
        dragDraftId = null;
        item.style.opacity = "1";
      });
      item.addEventListener("dblclick", () => {
        const bridge = getBridge();
        if (!bridge || typeof bridge.openDraftInEditor !== "function") return;
        bridge.openDraftInEditor(String(item.getAttribute("data-draft-id") || ""));
      });
    });
    lastRenderedDraftCount = nextCount;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function bindBridge() {
    const bridge = getBridge();
    if (!bridge) return;
    if (subscribedBridge && bridge !== subscribedBridge && unsubscribe) {
      try { unsubscribe(); } catch (_err) {}
      unsubscribe = null;
      subscribedBridge = null;
    }
    if (unsubscribe && subscribedBridge === bridge) return;
    if (typeof bridge.subscribe === "function") {
      unsubscribe = bridge.subscribe((drafts) => {
        renderDrafts(drafts);
      });
      subscribedBridge = bridge;
    } else if (typeof bridge.getDrafts === "function") {
      renderDrafts(bridge.getDrafts());
      subscribedBridge = bridge;
    }
  }

  function attachStageDropTargets() {
    if (trayInitialized) return;
    trayInitialized = true;

    const onDragOver = (e) => {
      if (!dragDraftId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };

    const onDrop = async (e, page) => {
      if (!dragDraftId) return;
      e.preventDefault();
      const bridge = getBridge();
      if (!bridge || typeof bridge.dropDraftToPage !== "function") return;
      const stage = page?.stage;
      if (!stage) return;
      try {
        if (typeof stage.setPointersPositions === "function") stage.setPointersPositions(e);
      } catch (_err) {}
      const container = stage.container ? stage.container() : null;
      const rect = container ? container.getBoundingClientRect() : null;
      const pointer = stage.getPointerPosition?.() || (rect ? {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      } : null);
      if (!pointer) return;
      const res = await bridge.dropDraftToPage(dragDraftId, {
        stage,
        pageNumber: page.number,
        pointer
      });
      if (!res || res.ok !== true) return;
      dragDraftId = null;
    };

    const installForPage = (page) => {
      const stage = page?.stage;
      if (!stage || page._customDraftTrayDropBound) return;
      const container = stage.container ? stage.container() : null;
      if (!container) return;
      page._customDraftTrayDropBound = true;
      container.addEventListener("dragover", onDragOver);
      container.addEventListener("drop", (e) => onDrop(e, page));
    };

    const bindAllPages = () => {
      (Array.isArray(window.pages) ? window.pages : []).forEach(installForPage);
    };
    bindAllPages();

    window.addEventListener("canvasCreated", bindAllPages);
    window.addEventListener("customStyleDraftTrayOpenRequest", () => showTray());
  }

  function init() {
    ensureTray();
    bindBridge();
    attachStageDropTargets();
  }

  window.CustomStyleDraftTrayUI = {
    open: showTray,
    close: hideTray,
    isOpen: isTrayOpen,
    refresh() {
      const bridge = getBridge();
      if (bridge?.getDrafts) renderDrafts(bridge.getDrafts());
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
