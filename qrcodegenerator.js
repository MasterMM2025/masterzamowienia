// qrcodegenerator.js – QR CODE (STABILNA WERSJA)
// ✔ identyczny UX jak EAN
// ✔ brak glitchy przy resize
// ✔ scale → width/height
// ✔ stabilny transformer
// ✔ brak konfliktów

(function () {
  if (window.qrGeneratorLoaded) return;
  window.qrGeneratorLoaded = true;

  let qrModal = null;
  let pendingQRUrl = null;
  let addMode = false;
  let globalTransformer = null;

  // ================= INIT =================
  function init() {
    const btn = document.querySelector('.sidebar-item[title="Kod QR"]');
    if (!btn || btn._qrBound) return;
    btn._qrBound = true;
    btn.addEventListener('click', openQRModal);
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener('excelImported', () => setTimeout(init, 200));

  // ================= MODAL =================
  function openQRModal() {
    if (!window.pages || pages.length === 0) {
      alert("Najpierw zaimportuj Excel lub dodaj stronę!");
      return;
    }

    if (qrModal) {
      qrModal.style.display = "block";
      qrModal.querySelector("#qrInput")?.focus();
      return;
    }

    qrModal = document.createElement("div");
    qrModal.style.cssText = `
      position:fixed;
      top:50%;left:50%;
      transform:translate(-50%,-50%);
      background:#fff;
      padding:20px;
      width:360px;
      border-radius:12px;
      box-shadow:0 8px 25px rgba(0,0,0,.25);
      z-index:20000;
      font-family:Arial;
    `;

    qrModal.innerHTML = `
      <h3 style="margin:0 0 12px;text-align:center;">Generator QR Code</h3>

      <input id="qrInput" type="text"
        placeholder="wklej link lub tekst"
        style="width:100%;padding:8px;font-size:15px;
               border-radius:6px;border:1px solid #999;">

      <div id="qrPreview"
        style="margin:14px 0;
               min-height:120px;
               background:#f3f3f3;
               border-radius:6px;
               display:flex;
               align-items:center;
               justify-content:center;">
      </div>

      <button id="makeQR"
        style="width:100%;
               padding:10px;
               background:#007cba;
               border:none;
               border-radius:8px;
               color:#fff;
               cursor:pointer;">
        Generuj i wstaw
      </button>

      <button id="closeQR"
        style="margin-top:6px;
               width:100%;
               padding:10px;
               border-radius:8px;">
        Anuluj
      </button>
    `;

    document.body.appendChild(qrModal);

    const input = qrModal.querySelector("#qrInput");
    const preview = qrModal.querySelector("#qrPreview");

    input.focus();
    input.addEventListener("input", () => showPreview(input.value, preview));

    qrModal.querySelector("#makeQR").onclick = () => {
      const text = input.value.trim();
      if (!text) {
        alert("Wklej link lub tekst!");
        return;
      }

      generateQR(text, (url) => {
        if (!url) return alert("Błąd generowania QR!");
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
      colorDark: "#000",
      colorLight: "#fff",
      correctLevel: QRCode.CorrectLevel.M
    });

    container.appendChild(div);
  }

  // ================= GENERATOR =================
  function generateQR(text, cb) {
    const div = document.createElement("div");

    try {
      new QRCode(div, {
        text,
        width: 400,     // 🔥 DUŻY QR = brak blur
        height: 400,
        colorDark: "#000",
        colorLight: "#fff",
        correctLevel: QRCode.CorrectLevel.M
      });

      const canvas = div.querySelector("canvas");
      cb(canvas.toDataURL("image/png"));
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

      stage.on("mousedown.qr", () => {
        if (!addMode || !pendingQRUrl) return;
        const pos = stage.getPointerPosition();
        if (!pos) return;
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
      stage.off("mousedown.qr");
    });
  }

  // ================= INSERT QR =================
  function insertQR(stage, x, y) {
    const layer = stage.children[0];
    const img = new Image();
    const originalCopy = pendingQRUrl.slice();

    img.onload = () => {
      const konvaImg = new Konva.Image({
        image: img,
        x,
        y,
        width: img.width * 0.4,   // 🔥 SCALE PRZEZ WIDTH
        height: img.height * 0.4,
        scaleX: 1,
        scaleY: 1,
        draggable: true,
        listening: true
      });

      konvaImg.setAttrs({
        isQRCode: true,
        qrOriginalSrc: originalCopy
      });

      layer.add(konvaImg);
      layer.batchDraw();

      attachTransformer(stage, konvaImg);
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

    // 🔥 KLUCZOWE: SCALE → WIDTH / HEIGHT
    globalTransformer.on("transform", () => {
      const n = globalTransformer.nodes()[0];
      if (!n) return;

      const scaleX = n.scaleX();
      const scaleY = n.scaleY();

      n.width(Math.max(20, n.width() * scaleX));
      n.height(Math.max(20, n.height() * scaleY));

      n.scaleX(1);
      n.scaleY(1);
      layer.batchDraw();
    });

    node.on("mousedown.qrSelect", (e) => {
      e.cancelBubble = true;
      globalTransformer.nodes([node]);
      layer.batchDraw();
    });

    stage.off("mousedown.qrClear");
    stage.on("mousedown.qrClear", (e) => {
      if (e.target !== node) {
        globalTransformer.nodes([]);
        layer.batchDraw();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Delete" && globalTransformer?.nodes()[0] === node) {
        node.destroy();
        globalTransformer.nodes([]);
        layer.batchDraw();
      }
    });
  }

})();
