// eangenerator.js – PEŁNA, POPRAWIONA WERSJA
// ✔ kolor działa
// ✔ obramowanie ZNIKA po kliknięciu obok
// ✔ brak konfliktów z importdanych.js

(function () {
  if (window.eanGeneratorLoaded) return;
  window.eanGeneratorLoaded = true;

  let eanModal = null;
  let pendingBarcodeUrl = null;
  let addMode = false;
  let globalTransformer = null;

  // ================= INIT =================
  function init() {
    const btn = document.querySelector('.sidebar-item[title="Kod EAN"]');
    if (!btn || btn._eanBound) return;
    btn._eanBound = true;
    btn.addEventListener('click', openEanModal);
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener('excelImported', () => setTimeout(init, 200));

  // ================= MODAL =================
  function openEanModal() {
    if (!window.pages || pages.length === 0) {
      alert("Najpierw zaimportuj Excel lub dodaj stronę!");
      return;
    }

    if (eanModal) {
      eanModal.style.display = "block";
      eanModal.querySelector("#eanInput")?.focus();
      return;
    }

    eanModal = document.createElement("div");
    eanModal.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:#fff;padding:20px;width:340px;border-radius:12px;
      box-shadow:0 8px 25px rgba(0,0,0,.25);
      z-index:20000;font-family:Arial;
    `;

    eanModal.innerHTML = `
      <h3 style="margin:0 0 12px;text-align:center;">Generator EAN</h3>
      <input id="eanInput" type="text" maxlength="13"
        placeholder="wpisz 8 lub 13 cyfr"
        style="width:100%;padding:8px;font-size:16px;border-radius:6px;border:1px solid #999;">
      <div id="eanPreview"
        style="margin:14px 0;min-height:70px;background:#f3f3f3;border-radius:6px;
               display:flex;align-items:center;justify-content:center;">
      </div>
      <button id="makeBarcode"
        style="width:100%;padding:10px;background:#007cba;border:none;
               border-radius:8px;color:#fff;cursor:pointer;">
        Generuj i wstaw
      </button>
      <button id="closeEan"
        style="margin-top:6px;width:100%;padding:10px;border-radius:8px;">
        Anuluj
      </button>
    `;

    document.body.appendChild(eanModal);

    const input = eanModal.querySelector("#eanInput");
    const preview = eanModal.querySelector("#eanPreview");

    input.focus();
    input.addEventListener("input", () => showPreview(input.value, preview));

    eanModal.querySelector("#makeBarcode").onclick = () => {
      const code = input.value.trim();
      if (!/^\d{8}$/.test(code) && !/^\d{13}$/.test(code)) {
        alert("Kod musi mieć 8 lub 13 cyfr!");
        return;
      }
      generateBarcode(code, (url) => {
        if (!url) return alert("Błąd generowania EAN!");
        pendingBarcodeUrl = url;
        eanModal.style.display = "none";
        enableAddMode();
      });
    };

    eanModal.querySelector("#closeEan").onclick = () => {
      eanModal.style.display = "none";
    };
  }

  // ================= PREVIEW =================
  function showPreview(code, container) {
    container.innerHTML = "";
    if (!(/^\d{8}$/.test(code) || /^\d{13}$/.test(code))) {
      container.innerHTML = `<span style="color:#c00;">Błędny format</span>`;
      return;
    }
    const c = document.createElement("canvas");
    try {
      JsBarcode(c, code, {
        format: code.length === 8 ? "EAN8" : "EAN13",
        width: 2,
        height: 50,
        displayValue: true,
        background: "transparent",
        lineColor: "#000"
      });
      container.appendChild(c);
    } catch {
      container.innerHTML = `<span style="color:#c00;">Błąd</span>`;
    }
  }

  // ================= GENERATOR =================
  function generateBarcode(code, cb) {
    const c = document.createElement("canvas");
    try {
      JsBarcode(c, code, {
        format: code.length === 8 ? "EAN8" : "EAN13",
        width: 2.5,
        height: 70,
        displayValue: true,
        background: "transparent",
        lineColor: "#000"
      });
      cb(c.toDataURL("image/png"));
    } catch {
      cb(null);
    }
  }

  // ================= ADD MODE =================
  function enableAddMode() {
    addMode = true;
    pages.forEach(page => {
      const stage = page.stage;
      stage.container().style.cursor = "crosshair";

      stage.on("mousedown.ean", () => {
        if (!addMode || !pendingBarcodeUrl) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
        insertBarcode(stage, pos.x, pos.y);
        disableAddMode();
      });
    });
  }

  function disableAddMode() {
    addMode = false;
    pendingBarcodeUrl = null;
    pages.forEach(page => {
      const stage = page.stage;
      stage.container().style.cursor = "default";
      stage.off("mousedown.ean");
    });
  }

  // ================= INSERT BARCODE =================
  function insertBarcode(stage, x, y) {
    const layer = stage.children[0];
    const img = new Image();
    const originalCopy = pendingBarcodeUrl.slice(); // 🔥 kluczowe

    img.onload = () => {
      const konvaImg = new Konva.Image({
        image: img,
        x,
        y,
        scaleX: 0.6,
        scaleY: 0.6,
        draggable: true,
        listening: true
      });

      konvaImg.setAttrs({
        isBarcode: true,
        barcodeOriginalSrc: originalCopy,
        barcodeColor: "#000000"
      });

      layer.add(konvaImg);

      // 🔥 używaj GŁÓWNEGO transformera (jak wszystkie inne elementy)
      const page = pages.find(p => p.stage === stage);
      if (page) {
        page.selectedNodes = [konvaImg];
        page.transformer.nodes([konvaImg]);
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
        document.activeStage = stage;
      } else {
        layer.batchDraw();
      }
    };
    img.src = originalCopy;
  }

  // ================= TRANSFORMER =================
  function attachTransformer(stage, node) {
    const layer = stage.children[0];

    if (globalTransformer) {
      globalTransformer.nodes([]);
      globalTransformer.destroy();
      globalTransformer = null;
    }

    globalTransformer = new Konva.Transformer({
      nodes: [node],
      enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
      rotateEnabled: false,
      borderStroke: "#00c4b4",
      anchorFill: "#00c4b4"
    });

    layer.add(globalTransformer);
    layer.batchDraw();

    // klik w barcode → pokazuj uchwyty
    node.on("mousedown.eanSelect", (e) => {
      e.cancelBubble = true;
      globalTransformer.nodes([node]);
      layer.batchDraw();
    });

    // 🔥 KLIK POZA BARCODE → USUŃ OBRAMOWANIE
    stage.off("mousedown.eanClear");
    stage.on("mousedown.eanClear", (e) => {
      if (e.target !== node) {
        globalTransformer.nodes([]);
        layer.batchDraw();
      }
    });

    // delete
    document.addEventListener("keydown", (e) => {
      if (e.key === "Delete" && globalTransformer?.nodes()[0] === node) {
        node.destroy();
        globalTransformer.nodes([]);
        layer.batchDraw();
      }
    });
  }

})();
