// eangenerator.js – KOD EAN W KONVA.JS

(function () {
  if (window.eanGeneratorLoaded) return;
  window.eanGeneratorLoaded = true;

  let eanModal = null;
  let pendingBarcodeUrl = null;
  let addMode = false;

  function init() {
    const btn = document.querySelector('.sidebar-item[title="Kod EAN"]');
    if (!btn || btn._listener) return;

    btn._listener = true;
    btn.addEventListener('click', openEanModal);
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener('excelImported', () => setTimeout(init, 200));

  // === MODAL ===
  function openEanModal() {
    if (!pages || pages.length === 0) {
      alert("Najpierw zaimportuj Excel lub dodaj stronę!");
      return;
    }

    if (eanModal) {
      eanModal.style.display = "block";
      document.getElementById("eanInput")?.focus();
      return;
    }

    eanModal = document.createElement('div');
    eanModal.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: white; padding: 20px; width: 340px;
      border-radius: 10px; z-index: 20000;
      box-shadow: 0 8px 25px rgba(0,0,0,0.25); font-family: Inter;
    `;

    eanModal.innerHTML = `
      <h3 style="margin:0 0 12px; text-align:center;">Generator EAN</h3>

      <input id="eanInput" type="text" maxlength="13"
             placeholder="wpisz 8 lub 13 cyfr"
             style="width:100%; font-size:16px; padding:8px; border-radius:6px; border:1px solid #999;">

      <div id="eanPreview" style="text-align:center; margin:14px 0; min-height:70px; background:#f3f3f3; border-radius:6px;"></div>

      <button id="makeBarcode" style="width: 100%; padding:10px; background:#007cba; border:none; border-radius:6px; color:white; cursor:pointer;">
        Generuj i wstaw
      </button>

      <button id="closeEan" style="margin-top:6px; width:100%; padding:10px; border-radius:6px;">Anuluj</button>
    `;

    document.body.appendChild(eanModal);

    let input = eanModal.querySelector("#eanInput");
    let preview = eanModal.querySelector("#eanPreview");

    input.focus();
    input.addEventListener("input", () => showPreview(input.value, preview));

    document.getElementById("makeBarcode").onclick = () => {
      const code = input.value.trim();
      if (!/^\d{8}$/.test(code) && !/^\d{13}$/.test(code)) return alert("Kod musi mieć 8 lub 13 cyfr!");

      generateBarcode(code, (url) => {
        if (!url) return alert("Błąd generowania EAN!");

        pendingBarcodeUrl = url;
        eanModal.style.display = "none";
        enableAddMode();
      });
    };

    document.getElementById("closeEan").onclick = () => eanModal.style.display = "none";
  }

  // === PREVIEW CANVAS ===
  function showPreview(code, container) {
    if (!(/^\d{8}$/.test(code) || /^\d{13}$/.test(code))) {
      container.innerHTML = `<p style="color:#c00;">Błąd formatu</p>`;
      return;
    }

    const c = document.createElement("canvas");
    try {
      JsBarcode(c, code, {
        format: code.length === 8 ? 'EAN8' : 'EAN13',
        width: 2,
        height: 50,
        displayValue: true,
        background: "transparent"
      });
      container.innerHTML = "";
      container.appendChild(c);
    } catch {
      container.innerHTML = `<p style="color:#c00;">Błąd</p>`;
    }
  }

  // === GENEROWANIE PNG ===
  function generateBarcode(code, cb) {
    const c = document.createElement("canvas");
    try {
      JsBarcode(c, code, {
        format: code.length === 8 ? 'EAN8' : 'EAN13',
        width: 2.5,
        height: 70,
        displayValue: true,
        background: "transparent"
      });
      cb(c.toDataURL("image/png"));
    } catch {
      cb(null);
    }
  }

  // === TRYB DODAWANIA ===
  function enableAddMode() {
    addMode = true;

    pages.forEach(page => {
      const stage = page.stage;
      stage.container().style.cursor = "crosshair";

      const handler = (e) => {
        if (!addMode || !pendingBarcodeUrl) return;

        const pos = stage.getPointerPosition();
        if (!pos) return;

        insertBarcodeOnStage(stage, pos.x, pos.y);
        disableAddMode(stage);
      };

      stage.on("mousedown.ean", handler);
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

  // === TWORZENIE KONVA.IMAGE ===
  function insertBarcodeOnStage(stage, x, y) {
    const layer = stage.children[0];

    let img = new Image();
    img.onload = () => {
      const scale = 0.6;
      const konvaImg = new Konva.Image({
        image: img,
        x: x,
        y: y,
        draggable: true,
        scaleX: scale,
        scaleY: scale,
        name: "eanBarcode"
      });

      layer.add(konvaImg);
      layer.draw();

      addTransformers(stage, konvaImg);
    };
    img.src = pendingBarcodeUrl;
  }

  // === GLOBALNY TRANSFORMER DLA EAN ===
let globalTransformer = null;

// === OBSŁUGA TRANSFORMERA ===
function addTransformers(stage, node) {
  const layer = stage.children[0];

  // Usuń stary transformer, jeśli był
  if (globalTransformer && globalTransformer.getStage()) {
    globalTransformer.nodes([]);
    globalTransformer.destroy();
  }

  // Tworzymy nowy transformer
  globalTransformer = new Konva.Transformer({
    nodes: [node],
    enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    rotateEnabled: false,
    borderStroke: "#00c4b4",
    anchorFill: "#00c4b4",
    name: "eanTransformer"
  });

  layer.add(globalTransformer);
  layer.draw();

  // Kliknięcie obiektu → aktywuje transformer
  node.on("click", () => {
    globalTransformer.nodes([node]);
    layer.draw();
  });

  // Kliknięcie tła → ukrywa transformer
  stage.on("click", (e) => {
    if (e.target === stage) {
      globalTransformer.nodes([]);
      layer.draw();
    }
  });

  // Usuwanie Delete → usuwa EAN i transformer
  document.addEventListener("keydown", (e) => {
    if (e.key === "Delete" &&
        globalTransformer.nodes()[0] === node) {
      node.destroy();
      globalTransformer.nodes([]);
      layer.draw();
    }
  });

  // Ruch / Skala → odśwież ekrany
  node.on("dragmove transform", () => layer.draw());
}
// Jeśli obiekt zostanie usunięty — usuń transformer natychmiast
node.on("destroy", () => {
  if (globalTransformer) {
    globalTransformer.nodes([]);
    globalTransformer.destroy();
    globalTransformer = null;
    layer.draw();
  }
});

})();
