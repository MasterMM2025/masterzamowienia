// qrcodegenerator.js – FINAL FINAL FIX
// ✔ 1 klik = transformer
// ✔ klik poza QR = czyszczenie
// ✔ 100% jak EAN

(function () {
  if (window.qrGeneratorLoaded) return;
  window.qrGeneratorLoaded = true;

  let qrModal = null;
  let pendingQRUrl = null;
  let addMode = false;

  let transformer = null;
  let activeNode = null;

  // ================= INIT =================
  function init() {
    const btn = document.querySelector('.sidebar-item[title="Kod QR"]');
    if (!btn || btn._qrBound) return;
    btn._qrBound = true;
    btn.addEventListener('click', openQRModal);
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("excelImported", () => setTimeout(init, 200));

  // ================= MODAL =================
  function openQRModal() {
    if (!window.pages || pages.length === 0) {
      alert("Najpierw zaimportuj Excel lub dodaj stronę!");
      return;
    }

    if (qrModal) {
      qrModal.style.display = "block";
      return;
    }

    qrModal = document.createElement("div");
    qrModal.style.cssText = `
      position:fixed;top:50%;left:50%;
      transform:translate(-50%,-50%);
      background:#fff;padding:20px;width:360px;
      border-radius:12px;
      box-shadow:0 8px 25px rgba(0,0,0,.25);
      z-index:20000;font-family:Arial;
    `;

    qrModal.innerHTML = `
      <h3 style="margin:0 0 12px;text-align:center;">Generator QR Code</h3>

      <input id="qrInput" type="text"
        placeholder="wklej link lub tekst"
        style="width:100%;padding:8px;font-size:15px;
               border-radius:6px;border:1px solid #999;">

      <div id="qrPreview"
        style="margin:14px 0;min-height:120px;
               background:#f3f3f3;border-radius:6px;
               display:flex;align-items:center;justify-content:center;">
      </div>

      <button id="makeQR"
        style="width:100%;padding:10px;
               background:#007cba;border:none;
               border-radius:8px;color:#fff;cursor:pointer;">
        Generuj i wstaw
      </button>

      <button id="closeQR"
        style="margin-top:6px;width:100%;
               padding:10px;border-radius:8px;">
        Anuluj
      </button>
    `;

    document.body.appendChild(qrModal);

    const input = qrModal.querySelector("#qrInput");
    const preview = qrModal.querySelector("#qrPreview");

    input.addEventListener("input", () => showPreview(input.value, preview));

    qrModal.querySelector("#makeQR").onclick = () => {
      const text = input.value.trim();
      if (!text) return alert("Wklej link lub tekst!");

      generateQR(text, (url) => {
        pendingQRUrl = url;
        qrModal.style.display = "none";
        enableAddMode();
      });
    };

    qrModal.querySelector("#closeQR").onclick = () => {
      qrModal.style.display = "none";
    };
  }

  // ================= PREVIEW =================
  function showPreview(text, container) {
    container.innerHTML = "";
    if (!text) return;

    const div = document.createElement("div");
    new QRCode(div, {
      text,
      width: 110,
      height: 110,
      correctLevel: QRCode.CorrectLevel.M
    });

    container.appendChild(div);
  }

  // ================= GENERATE =================
  function generateQR(text, cb) {
    const div = document.createElement("div");
    new QRCode(div, {
      text,
      width: 400,
      height: 400,
      correctLevel: QRCode.CorrectLevel.M
    });

    const canvas = div.querySelector("canvas");
    cb(canvas.toDataURL("image/png"));
  }

  // ================= ADD MODE =================
  function enableAddMode() {
    addMode = true;

    pages.forEach(page => {
      const stage = page.stage;
      stage.container().style.cursor = "crosshair";

      stage.on("pointerdown.qrAdd", () => {
        if (!addMode || !pendingQRUrl) return;
        const pos = stage.getPointerPosition();
        insertQR(stage, pos.x, pos.y);
        disableAddMode();
      });
    });
  }

  function disableAddMode() {
    addMode = false;
    pendingQRUrl = null;

    pages.forEach(page => {
      const stage = page.stage;
      stage.container().style.cursor = "default";
      stage.off("pointerdown.qrAdd");
    });
  }

  // ================= INSERT =================
  function insertQR(stage, x, y) {
    const layer = stage.children[0];
    const img = new Image();
    const src = pendingQRUrl;

    img.onload = () => {
      const node = new Konva.Image({
        image: img,
        x,
        y,
        width: img.width * 0.4,
        height: img.height * 0.4,
        draggable: true,
        listening: true
      });

      layer.add(node);
      layer.batchDraw();

      attach(stage, node);
    };

    img.src = src;
  }

  // ================= TRANSFORMER =================
  function attach(stage, node) {
    const layer = stage.children[0];

    if (!transformer) {
      transformer = new Konva.Transformer({
        enabledAnchors: [
          "top-left",
          "top-right",
          "bottom-left",
          "bottom-right"
        ],
        rotateEnabled: false,
        borderStroke: "#00c4b4",
        anchorFill: "#00c4b4"
      });
      layer.add(transformer);
    }

    // ✅ JEDEN KLIK = SELEKCJA + TRANSFORMER
    node.on("pointerdown.qrSelect", (e) => {
      e.cancelBubble = true;

      activeNode = node;
      transformer.nodes([node]);
      layer.batchDraw();
    });

    // ✅ KLIK GDZIEKOLWIEK INDZIEJ = CLEAR
    stage.off("pointerdown.qrClear");
    stage.on("pointerdown.qrClear", (e) => {
      if (e.target !== activeNode) {
        transformer.nodes([]);
        activeNode = null;
        layer.batchDraw();
      }
    });

    // ✅ STABILNE SKALOWANIE
    transformer.off("transform.qr");
    transformer.on("transform.qr", () => {
      const n = transformer.nodes()[0];
      if (!n) return;

      const sx = n.scaleX();
      const sy = n.scaleY();

      n.width(Math.max(20, n.width() * sx));
      n.height(Math.max(20, n.height() * sy));

      n.scaleX(1);
      n.scaleY(1);
      layer.batchDraw();
    });

    // DELETE
    document.addEventListener("keydown", (e) => {
      if (e.key === "Delete" && transformer.nodes()[0] === node) {
        node.destroy();
        transformer.nodes([]);
        activeNode = null;
        layer.batchDraw();
      }
    });
  }

})();
