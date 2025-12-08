// ========================================================================
// importdanych.js – WERSJA FINALNA Z IDEALNĄ EDYCJĄ TEKSTU (bez przesunięć!)
// ========================================================================

let allProducts = [];
let pages = [];


const MM_TO_PX = 3.78;
const PAGE_MARGIN = 15 * MM_TO_PX;

window.W = 794 + PAGE_MARGIN * 2;
window.H = 1123 + PAGE_MARGIN * 2;

let ML = 14 + PAGE_MARGIN; 
let MT = 140 + PAGE_MARGIN; 
let MB = 28 + PAGE_MARGIN; 

let COLS = 2;
let ROWS = 3;
let GAP = 6;

const BW = (W - ML * 2 - GAP) / COLS;
const BH = (H - MT - MB - GAP * (ROWS - 1)) / ROWS;

// =======================
// 🔍 ZOOM DLA STRONY
// =======================

let currentZoom = 1.0;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;

function applyZoomToPage(page, scale) {
    const wrapper = page.stage.container().parentElement; 
    if (!wrapper) return;

    wrapper.style.transition = "transform 0.15s ease-out";
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = "top center";

    page.stage.batchDraw();
}

function createZoomSlider() {
    if (document.getElementById("zoomSlider")) return;

    const slider = document.createElement("div");
    slider.id = "zoomSlider";
    slider.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #fff;
        padding: 10px 18px;
        border-radius: 30px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: Arial;
        border: 1px solid #ccc;
    `;

    slider.innerHTML = `
        <button id="zoomOut" style="font-size:24px;border:none;background:none;cursor:pointer;">−</button>
        <input type="range" id="zoomRange" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="0.1" value="1" style="width:160px;">
        <span id="zoomValue" style="font-weight:bold;width:50px;text-align:center;">100%</span>
        <button id="zoomIn" style="font-size:24px;border:none;background:none;cursor:pointer;">+</button>
    `;

    document.body.appendChild(slider);

    const range = document.getElementById("zoomRange");
    const value = document.getElementById("zoomValue");

    function updateZoom(scale) {
        currentZoom = scale;
        range.value = scale;
        value.textContent = Math.round(scale * 100) + "%";
        pages.forEach(p => applyZoomToPage(p, scale));
    }

    document.getElementById("zoomOut").onclick = () => {
        updateZoom(Math.max(ZOOM_MIN, currentZoom - 0.1));
    };

    document.getElementById("zoomIn").onclick = () => {
        updateZoom(Math.min(ZOOM_MAX, currentZoom + 0.1));
    };

    range.oninput = () => {
        updateZoom(parseFloat(range.value));
    };

    document.addEventListener("keydown", e => {
        if (e.ctrlKey && e.key === "0") {
            e.preventDefault();
            updateZoom(1.0);
        }
    });
}



// ========================================================================
// IMPORT EXCEL
// ========================================================================
window.importExcelMultiPage = async function () {
  const file = document.getElementById("excelFile")?.files[0];
  if (!file) return alert("Wybierz plik Excel!");

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }).slice(1);

    allProducts = json
      .map((row) => ({
        INDEKS: String(row[0] || "").trim(),
        NAZWA: String(row[1] || "").trim(),
        CENA: String(row[2] || "").trim(),
        EAN: String(row[3] || "").trim()
      }))
      .filter((p) => p.INDEKS || p.NAZWA);

    clearPages();

    const perPage = COLS * ROWS;
    for (let i = 0; i < allProducts.length; i += perPage) {
      const prods = allProducts.slice(i, i + perPage);
      createPage(Math.floor(i / perPage) + 1, prods);
    }

    document.getElementById("pdfButton").disabled = false;
    document.getElementById("fileLabel").textContent = file.name;
    createZoomSlider();
  } catch (e) {
    alert("Błąd: " + e.message);
  }
};

// ========================================================================
// TWORZENIE STRONY – WERSJA Z OBSŁUGĄ PRZYCISKU „DODAJ STRONĘ”
// ========================================================================
function createPage(n, prods) {

  // ----- HTML strony -----
  const div = document.createElement("div");
  div.className = "page-container";
  div.style.marginBottom = "10px";
  div.innerHTML = `
  <div class="page-toolbar">
      <span class="page-title">Page ${n}</span>

      <div class="page-tools">
          <button class="page-btn move-up">⬆</button>
          <button class="page-btn move-down">⬇</button>
          <button class="page-btn duplicate">⧉</button>
          <button class="page-btn add">＋</button>
          <button class="page-btn delete">🗑</button>
      </div>
  </div>

  <div class="canvas-wrapper"
       style="width:${W}px;height:${H}px;background:#fff;overflow:hidden;position:relative;">
      <div id="k${n}" style="width:${W}px;height:${H}px;"></div>
  </div>
`;


  document.getElementById("pagesContainer").appendChild(div);

  // ----- KONVA stage -----
  const stage = new Konva.Stage({
    container: `k${n}`,
    width: W,
    height: H
  });

  const layer = new Konva.Layer();
  const overlay = new Konva.Layer();
  stage.add(layer);
  stage.add(overlay);

  // ----- OBIEKT STRONY -----
  const page = {
    number: n,
    products: prods,
    stage,
    layer,
    overlay,
    slotImages: Array(prods.length).fill(null),
    barcodeImages: Array(prods.length).fill(null),
    container: div
    
  };
  // === PANEL STRONY – OBSŁUGA PRZYCISKÓW ===
const toolbar = div.querySelector(".page-toolbar");

// usuń stronę
toolbar.querySelector(".delete").onclick = () => {
    if (confirm("Usunąć tę stronę?")) {
        page.stage.destroy();
        div.remove();
        const idx = pages.indexOf(page);
        if (idx > -1) pages.splice(idx, 1);
    }
};

// dodaj stronę poniżej
toolbar.querySelector(".add").onclick = () => {
    window.createEmptyPageUnder(page);
};

// duplikuj stronę (prosta wersja)
toolbar.querySelector(".duplicate").onclick = () => {
    window.createEmptyPageUnder(page);
};

toolbar.querySelector(".move-up").onclick = () => {
    const idx = pages.indexOf(page);
    if (idx <= 0) return;

    const thisDiv = page.container;
    const aboveDiv = pages[idx - 1].container;

    // --- Animacja ---
    thisDiv.classList.add("page-swap");
    aboveDiv.classList.add("page-swap-down");

    setTimeout(() => {
        aboveDiv.before(thisDiv);

        thisDiv.classList.remove("page-swap");
        aboveDiv.classList.remove("page-swap-down");

        syncPagesWithDOM();
        renumberPages();
    }, 250);
};



toolbar.querySelector(".move-down").onclick = () => {
    const idx = pages.indexOf(page);
    if (idx >= pages.length - 1) return;

    const thisDiv = page.container;
    const belowDiv = pages[idx + 1].container;

    // --- Animacja ---
    thisDiv.classList.add("page-swap-down");
    belowDiv.classList.add("page-swap");

    setTimeout(() => {
        belowDiv.after(thisDiv);

        thisDiv.classList.remove("page-swap-down");
        belowDiv.classList.remove("page-swap");

        syncPagesWithDOM();
        renumberPages();
    }, 250);
};




  // zapisujemy stronę
  pages.push(page);

  // rysujemy produkty
  drawPage(page);
enableMultiSelect(page);
  // dodajemy przycisk pod stroną
  addAddButtonUnderPage(page);
  

  return page;
}
// === SYNC KOLEJNOŚCI STRON Z DOM ===
function syncPagesWithDOM() {
    const domPages = [...document.querySelectorAll(".page-container")];

    pages = domPages.map(domPage =>
        pages.find(p => p.container === domPage)
    );
}


// 🔥 W TYM MIEJSCU WKLEJASZ FUNKCJĘ:
function addAddButtonUnderPage(page) {
    if (page.container.querySelector('.add-page-btn-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'add-page-btn-wrapper';
    wrapper.style.cssText = `
        text-align: center;
        margin-top: 25px;
        margin-bottom: 60px;
    `;

    wrapper.innerHTML = `
        <button class="add-page-btn" style="
            background:#007cba;
            color:#fff;
            border:none;
            padding:8px 16px;
            border-radius:6px;
            cursor:pointer;
            font-size:14px;
        ">+ Dodaj stronę</button>
    `;

    page.container.appendChild(wrapper);

    wrapper.querySelector('.add-page-btn').onclick = () => {
        window.createEmptyPageUnder(page);
    };
}

function getTokensInString(text) {
  if (typeof text === "string") {
    var result = [];
    var tokens = text.split(/[\s\n]+/);
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].length > 0) result.push(tokens[i]);
    }
    return result;
  }
  return [];
}

function hasBrokenWords(sourceTokens, renderLines) {
  var combined = "";
  for (var i = 0; i < renderLines.length; i++) {
    combined += (i === 0 ? "" : " ") + renderLines[i].text;
  }

  var a = sourceTokens;
  var b = getTokensInString(combined);

  if (a.length !== b.length) return true;

  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}

function shrinkText(textNode, minFontSize = 8) {
  var sourceTokens = getTokensInString(textNode.attrs.text);
  var brokenWords = hasBrokenWords(sourceTokens, textNode.textArr);

  var textHeight = textNode.textArr.length * textNode.textHeight;
  var textAreaHeight = textNode.height();

  while ((textHeight > textAreaHeight || brokenWords) &&
         textNode.fontSize() > minFontSize) {

    textNode.fontSize(textNode.fontSize() - 1);

    brokenWords = hasBrokenWords(sourceTokens, textNode.textArr);
    textHeight  = textNode.textArr.length * textNode.textHeight;
    textAreaHeight = textNode.height();
  }

  return textNode.fontSize();
}

function createRotationLabel(layer) {
  const label = new Konva.Label({
    opacity: 0,
    visible: false
  });

  const tag = new Konva.Tag({
    fill: "black",
    cornerRadius: 6,
    padding: 6
  });

  const text = new Konva.Text({
    text: "",
    fontSize: 16,
    fill: "white",
    fontFamily: "Arial",
  });

  label.add(tag);
  label.add(text);
  layer.add(label);

  return { label, text };
}
function enableEditableText(node, page, rotationUI) {

  node.originalFontSize = node.fontSize();
  node.originalWidth = node.width();
  node.originalHeight = node.height();
  node.minHeight = node.height();

  const layer = page.layer;

  // Transformer
  const tr = new Konva.Transformer({
    nodes: [node],
    padding: 6,
    rotateEnabled: true,
    keepRatio: false,
    ignoreStroke: true,
    enabledAnchors: [
      'top-left','top-center','top-right',
      'middle-left','middle-right',
      'bottom-left','bottom-center','bottom-right'
    ]
  });
 
  layer.add(tr);
  tr.hide();

  node.on("click", () => {
    tr.nodes([node]);
    tr.show();
    tr.forceUpdate();
  });

  page.stage.on("click", e => {
    if (!e.target.hasName("text-editable")) tr.hide();
  });

  // ROTATION
  node.on("transform", () => {
    const angle = Math.round(node.rotation());
    rotationUI.text.text(angle + "°");

    const abs = node.absolutePosition();
    rotationUI.label.position({
      x: abs.x + node.width() / 2,
      y: abs.y - 40
    });

    rotationUI.label.visible(true);
    rotationUI.label.opacity(1);
    page.overlay.batchDraw();

    const oldPos = node.absolutePosition();

    let newW = node.width() * node.scaleX();
    let newH = node.height() * node.scaleY();

    node.setAttrs({
      width: newW,
      height: newH,
      scaleX: 1,
      scaleY: 1
    });

    let enlarged = false;

    while (true) {
      const prev = node.fontSize();
      node.fontSize(prev + 1);

      const h = node.textArr.length * node.textHeight;
      if (h > newH) { node.fontSize(prev); break; }

      if (hasBrokenWords(getTokensInString(node.text()), node.textArr)) {
        node.fontSize(prev);
        break;
      }

      enlarged = true;
    }

    if (!enlarged) shrinkText(node, 8);

    node.absolutePosition(oldPos);
  });

  node.on("transformend", () => {
    rotationUI.label.to({
      opacity: 0,
      duration: 0.25,
      onFinish: () => rotationUI.label.visible(false)
    });
  });

  // TEXTAREA EDIT
  node.on("dblclick dbltap", function () {

    tr.hide();
    node.hide();
    layer.draw();

    const pos = node.absolutePosition();
    const rect = page.stage.container().getBoundingClientRect();

    const absX = rect.left + pos.x + window.scrollX;
    const absY = rect.top + pos.y + window.scrollY;

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    textarea.value = node.text();
    Object.assign(textarea.style, {
      position: "absolute",
      left: absX + "px",
      top: absY + "px",
      width: node.width() + "px",
      minHeight: node.height() + "px",
      fontSize: node.fontSize() + "px",
      fontFamily: node.fontFamily(),
      lineHeight: node.lineHeight(),
      textAlign: node.align(),
      color: node.fill(),
      padding: "2px",
      border: "2px solid #0066ff",
      background: "white",
      resize: "none",
      zIndex: 99999
    });

    textarea.focus();
    textarea.style.height = textarea.scrollHeight + "px";

    const finish = () => {
      node.text(textarea.value || "-");
      shrinkText(node, 8);
      node.show();
      tr.show();
      tr.forceUpdate();
      layer.draw();
      textarea.remove();
      window.removeEventListener("click", close);
    };

    const close = (e) => { if (e.target !== textarea) finish(); };

    textarea.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(); }
      if (e.key === "Escape") finish();
    });

    textarea.addEventListener("input", () => {
      node.text(textarea.value);
      const newSize = shrinkText(node, 8);
      textarea.style.fontSize = newSize + "px";
      textarea.style.height = textarea.scrollHeight + "px";
    });

    setTimeout(() => window.addEventListener("click", close), 0);
  });
}
// ========================================================================
// UNIVERSAL TRANSFORMER FOR NON-TEXT ELEMENTS
// ========================================================================
// ========================================================================
// UNIVERSAL TRANSFORMER FOR NON-TEXT ELEMENTS + ROTATION DISPLAY
// ========================================================================
function enableTransform(node, page) {

  const layer = page.layer;
  const rotationUI = createRotationLabel(page.overlay);

  const tr = new Konva.Transformer({
    nodes: [node],
    padding: 6,
    rotateEnabled: true,
    keepRatio: false,
    enabledAnchors: [
      'top-left','top-center','top-right',
      'middle-left','middle-right',
      'bottom-left','bottom-center','bottom-right'
    ]
  });

  layer.add(tr);
  tr.hide();

  // WYŚWIETLANIE KĄTA PODCZAS ROTACJI
  node.on("transform", () => {
    const angle = Math.round(node.rotation());

    rotationUI.text.text(angle + "°");

    const abs = node.absolutePosition();
    rotationUI.label.position({
      x: abs.x + node.width() / 2,
      y: abs.y - 40
    });

    rotationUI.label.visible(true);
    rotationUI.label.opacity(1);
    page.overlay.batchDraw();
  });

  node.on("transformend", () => {
    rotationUI.label.to({
      opacity: 0,
      duration: 0.25,
      onFinish: () => rotationUI.label.visible(false)
    });
  });

  // Show transformer
  node.on("click", () => {
    tr.nodes([node]);
    tr.show();
    tr.forceUpdate();
  });

  // Hide when clicked elsewhere
  page.stage.on("click", (e) => {
    if (e.target !== node) tr.hide();
  });
}



// ========================================================================
// RYSOWANIE ELEMENTÓW STRONY – Z PERFEKCYJNĄ EDYCJĄ
// ========================================================================
function drawPage(page) {
  const { layer, products } = page;

  layer.destroyChildren();
  const rotationUI = createRotationLabel(page.overlay);

  products.forEach((p, i) => {

    const xRaw = ML + (i % COLS) * (BW + GAP);
    const LEFT_OFFSET = -40;   // 🔥 przesunięcie w lewo – TAK JAK W POPRZEDNIM KODZIE
    const x = xRaw + LEFT_OFFSET;

    const y = MT + Math.floor(i / COLS) * (BH + GAP);


    // Box
    const box = new Konva.Rect({
  x, y,
  width: BW,
  height: BH,
  fill: "#fff",
  stroke: "#ccc",
  strokeWidth: 2,
  cornerRadius: 5,
  draggable: true,
  name: "box-editable"
});
layer.add(box);
box.moveToBottom();
enableTransform(box, page);




    // === NAZWA PRODUKTU (TEXTBOX CANVA W2) ===
    const nameText = new Konva.Text({
      x: x + 10,
      y: y + 15,
      width: BW - 20,
      height: 60,
      text: p.NAZWA || "-",
      fontSize: 14,
      fontFamily: "Arial",
      fill: "#000",
      align: "center",
      lineHeight: 1.2,
      draggable: true,
      name: "text-editable"
    });

    // zapamiętujemy oryginalne parametry
    nameText.originalFontSize = nameText.fontSize();
    nameText.originalWidth = nameText.width();
    nameText.originalHeight = nameText.height();
    nameText.minHeight = 60;

    layer.add(nameText);

    // auto-shrink po dodaniu
    shrinkText(nameText, 8);

    const tr = new Konva.Transformer({
      nodes: [nameText],
      padding: 6,
      rotateEnabled: true,
      keepRatio: false,
      ignoreStroke: true,
      enabledAnchors: [
        'top-left','top-center','top-right',
        'middle-left','middle-right',
        'bottom-left','bottom-center','bottom-right'
      ]
    });

    layer.add(tr);
    tr.hide();

    nameText.on("transformend", () => {
      rotationUI.label.to({
          opacity: 0,
          duration: 0.25,
          onFinish: () => rotationUI.label.visible(false)
      });
    });

    nameText.on("click", () => {
      tr.nodes([nameText]);
      tr.show();
      tr.forceUpdate();
    });

    page.stage.on("click", (e) => {
      if (!e.target.hasName("text-editable")) tr.hide();
    });

    // <<<=== NOWY, IDEALNY TRANSFORM (CANVA-STYLE) ===>>>
    nameText.on("transform", () => {
// === ROTATION DISPLAY ===
const angle = Math.round(nameText.rotation());

// aktualizacja tekstu
rotationUI.text.text(angle + "°");

// pozycja etykiety nad textboxem
const abs = nameText.absolutePosition();
rotationUI.label.position({
    x: abs.x + nameText.width() / 2,
    y: abs.y - 40
});

// pokaż etykietę
rotationUI.label.visible(true);
rotationUI.label.opacity(1);
page.overlay.batchDraw();

        const oldPos = nameText.absolutePosition();

        // nowe wymiary ramki
        let newW = nameText.width() * nameText.scaleX();
        let newH = nameText.height() * nameText.scaleY();

        // reset skali żeby nie uciekało
        nameText.setAttrs({ 
            width: newW,
            height: newH,
            scaleX: 1,
            scaleY: 1
        });

        // ---- CANVA STYLE ----
        // 1) najpierw próbujemy POWIĘKSZYĆ tekst
        let enlarged = false;
        while (true) {
            const prev = nameText.fontSize();
            nameText.fontSize(prev + 1);

            const textHeight = nameText.textArr.length * nameText.textHeight;

            // wyszedł poza ramkę → cofamy
            if (textHeight > newH) {
                nameText.fontSize(prev);
                break;
            }

            // złamane słowo → cofamy
            if (hasBrokenWords(getTokensInString(nameText.text()), nameText.textArr)) {
                nameText.fontSize(prev);
                break;
            }

            enlarged = true;
        }

        // 2) jeśli nie powiększyliśmy → zmniejszamy
        if (!enlarged) {
            shrinkText(nameText, 8);
        }

        // przywrócenie pozycji (fix uciekania)
        nameText.absolutePosition(oldPos);
    });
    // <<<=== KONIEC NOWEGO TRANSFORMU ===>>>

    // === TRYB EDYCJI TEKSTU (textarea) ===
    nameText.on("dblclick dbltap", function () {
      tr.hide();

      const stage = this.getStage();
      this.hide();
      layer.draw();

      const pos = this.absolutePosition();
      const rect = stage.container().getBoundingClientRect();

      const absX = rect.left + pos.x + window.scrollX;
      const absY = rect.top + pos.y + window.scrollY;

      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);

      textarea.value = this.text();
      Object.assign(textarea.style, {
        position: "absolute",
        left: absX + "px",
        top: absY + "px",
        width: this.width() + "px",
        minHeight: this.height() + "px",
        fontSize: this.fontSize() + "px",
        fontFamily: this.fontFamily(),
        lineHeight: this.lineHeight(),
        textAlign: this.align(),
        color: this.fill(),
        padding: "2px",
        margin: "0",
        border: "2px solid #0066ff",
        background: "rgba(255,255,255,0.98)",
        outline: "none",
        resize: "none",
        boxSizing: "border-box",
        overflow: "hidden",
        zIndex: "99999",
      });

      textarea.focus();
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";

      const finish = () => {
        this.text(textarea.value || "-");
        shrinkText(this, 8);
        this.show();
        tr.show();
        tr.forceUpdate();
        layer.draw();
        textarea.remove();
        window.removeEventListener("click", close);
      };

      const close = (e) => {
        if (e.target !== textarea) finish();
      };

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(); }
        if (e.key === "Escape") finish();
      });

      textarea.addEventListener("input", () => {
        this.text(textarea.value);
        const newSize = shrinkText(this, 8);
        textarea.style.fontSize = newSize + "px";
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      });

      setTimeout(() => window.addEventListener("click", close), 0);
    });

    // Cena
    const priceText = new Konva.Text({
  x: x + 10,
  y: y + 75,
  width: BW - 20,
  text: p.CENA ? `${p.CENA}€` : "",
  fontSize: 18,
  fontFamily: "Arial",
  fill: "#000",
  align: "center",
  name: "text-editable",
  draggable: true
});

layer.add(priceText);
enableEditableText(priceText, page, rotationUI);

    // Indeks
    const indexText = new Konva.Text({
  x: x + 90,
  y: y + BH - 80,
  width: BW - 20,
  text: "Indeks: " + (p.INDEKS || "-"),
  fontSize: 12,
  fontFamily: "Arial",
  fill: "#000",
  align: "center",
  name: "text-editable",
  draggable: true
});
// === KOD KRESKOWY ===
if (p.EAN && p.EAN.trim()) {
  generateBarcode(p.EAN.trim(), (data) => {
    if (!data) return;

    Konva.Image.fromURL(data, (img) => {
      const bw = 140;  // szerokość strefy barcode
      const bh = 40;   // wysokość strefy barcode

      // pozycja w slocie jak w starej wersji
      const bx = x + BW - bw - 30;
      const by = y + BH - bh - 20;

      img.setAttrs({
        x: bx,
        y: by,
        scaleX: 0.65,
        scaleY: 0.65,
        draggable: true,
        name: "barcode-image"
      });

      layer.add(img);
      enableTransform(img, page);
      layer.batchDraw();
    });
  });
}

layer.add(indexText);
enableEditableText(indexText, page, rotationUI);


  });

  layer.batchDraw();
}


function generateBarcode(ean, cb) {
  const key = ean.trim().replace(/\s+/g, '');

  // CACHE – jeśli barcode już był generowany, nie generuj jeszcze raz
  if (window.barcodeCache && window.barcodeCache[key]) {
    return cb(window.barcodeCache[key]);
  }

  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");

  try {
    JsBarcode(c, key, {
      format: "EAN13",
      width: 2.2,
      height: 50,
      displayValue: true,
      fontSize: 16,
      margin: 5,
      marginLeft: 10,
      marginRight: 10,
      marginTop: 10,
      marginBottom: 10,
      flat: false,
      background: "transparent",
      lineColor: "#000"
    });

    // 🔥 USUWANIE BIAŁEGO TŁA → PNG z przezroczystością
    const imageData = ctx.getImageData(0, 0, c.width, c.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const url = c.toDataURL("image/png");

    // zapisz w cache
    if (!window.barcodeCache) window.barcodeCache = {};
    window.barcodeCache[key] = url;

    cb(url);

  } catch (e) {
    console.error("Błąd generowania kodu kreskowego:", e);
    cb(null);
  }
}

// ========================================================================
// IMPORT ZDJĘĆ
// ========================================================================
window.importImagesFromFiles = function () {
  const input = document.getElementById("imageInput");
  const files = input?.files;
  if (!files || files.length === 0) return alert("Wybierz zdjęcia!");
  if (!pages.length) return alert("Najpierw importuj Excel.");

  const map = new Map();

  pages.forEach((page, pi) => {
    page.products.forEach((p, si) => {
      if (!p.INDEKS) return;
      map.set(p.INDEKS.toLowerCase(), { pageIndex: pi, slotIndex: si });
    });
  });

  Array.from(files).forEach((file) => {
    const cleanName = file.name.replace(/\.[^.]+$/, "").toLowerCase();

    for (const [indeks, pos] of map.entries()) {
      if (cleanName.includes(indeks)) {
        const reader = new FileReader();
        reader.onload = (e) => {
          Konva.Image.fromURL(e.target.result, (img) => {
            const page = pages[pos.pageIndex];
            const i = pos.slotIndex;

            const x = ML + (i % COLS) * (BW + GAP) + 20;
            const y = MT + Math.floor(i / COLS) * (BH + GAP) + 70;

            const maxW = BW * 0.6;
            const maxH = BH * 0.5;
            const scale = Math.min(maxW / img.width(), maxH / img.height(), 1);

            img.setAttrs({
  x, y,
  scaleX: scale,
  scaleY: scale,
  draggable: true,
  name: "draggable-image"
});
page.layer.add(img);
enableTransform(img, page);


            page.layer.batchDraw();
          });
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  });

  input.value = "";
};

// ========================================================================
// GENEROWANIE PDF
// ========================================================================
window.generatePDF = async function () {
  if (!pages.length) return alert("Brak stron!");

  const pdf = new jsPDF({
    orientation: "p",
    unit: "px",
    format: [W, H]
  });

  for (let i = 0; i < pages.length; i++) {
    const data = pages[i].stage.toDataURL({
      mimeType: "image/jpeg",
      quality: 1.0,
      pixelRatio: 2
    });

    if (i > 0) pdf.addPage();
    pdf.addImage(data, "JPEG", 0, 0, W, H);
  }

  pdf.save("katalog.pdf");
};

// ========================================================================
function clearPages() {
  pages.forEach((p) => p.stage.destroy());
  pages = [];
  document.getElementById("pagesContainer").innerHTML = "";
}
const pageToolbarStyle = document.createElement("style");
pageToolbarStyle.textContent = `
.page-toolbar {
    width: ${W}px;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #5a6673;
    font-family: Arial;
}

.page-title {
    font-size: 17px;
    font-weight: 600;
}

.page-tools {
    display: flex;
    gap: 8px;
}

.page-btn {
    background: #f1f3f6;
    border: 1px solid #d2d6dc;
    padding: 4px 8px;
    font-size: 14px;
    border-radius: 6px;
    cursor: pointer;
    color: #4b5563;
    transition: 0.15s ease;
}

.page-btn:hover {
    background: #e5e7eb;
    transform: translateY(-1px);
}

.page-btn:active {
    transform: translateY(0);
}
`;

document.head.appendChild(pageToolbarStyle);
// === ANIMACJA PRZESUWANIA STRON ===
const pageMoveAnimationStyle = document.createElement("style");
pageMoveAnimationStyle.textContent = `
.page-container {
    transition: transform 0.25s ease, opacity 0.25s ease;
}

.page-swap {
    transform: translateY(-20px);
    opacity: 0.6;
}

.page-swap-down {
    transform: translateY(20px);
    opacity: 0.6;
}
`;
document.head.appendChild(pageMoveAnimationStyle);

function renumberPages() {
    pages.forEach((p, i) => {
        p.number = i + 1;  // aktualizujemy numer w obiekcie
        const title = p.container.querySelector(".page-title");
        if (title) {
            title.textContent = "Page " + (i + 1); // aktualizacja w UI
        }
    });
}


// === FUNKCJA ANIMUJĄCA PRZESUNIĘCIE STRONY ===
function animatePageSwap(div, direction = "up") {
    if (direction === "up") {
        div.classList.add("page-swap");
    } else {
        div.classList.add("page-swap-down");
    }

    setTimeout(() => {
        div.classList.remove("page-swap", "page-swap-down");
    }, 250);
}
// ========================================================================
// MULTI SELECT – Canva style selection box
// ========================================================================

let selectionRect = null;
let selectionStart = null;
let selectionActive = false;

function enableMultiSelect(page) {
    const stage = page.stage;
    const layer = page.layer;

    // prostokąt selekcji
    selectionRect = new Konva.Rect({
        x: 0, y: 0,
        width: 0, height: 0,
        stroke: "#3399ff",
        strokeWidth: 1,
        dash: [4, 4],
        visible: false
    });

    page.overlay.add(selectionRect);

    stage.on("mousedown", (e) => {
        // kliknięcie na pusty obszar → start ramki
        if (e.target === stage) {
            selectionActive = true;
            const pos = stage.getPointerPosition();
            selectionStart = pos;

            selectionRect.visible(true);
            selectionRect.width(0);
            selectionRect.height(0);
            selectionRect.position(pos);
        }
    });

    stage.on("mousemove", () => {
        if (!selectionActive) return;

        const pos = stage.getPointerPosition();
        const x = Math.min(selectionStart.x, pos.x);
        const y = Math.min(selectionStart.y, pos.y);
        const w = Math.abs(pos.x - selectionStart.x);
        const h = Math.abs(pos.y - selectionStart.y);

        selectionRect.setAttrs({ x, y, width: w, height: h });
        page.overlay.batchDraw();
    });

    stage.on("mouseup", () => {
        if (!selectionActive) return;
        selectionActive = false;

        // wybieramy wszystkie obiekty w ramce
        const box = selectionRect.getClientRect();
        const nodesToSelect = [];

        layer.getChildren().forEach(node => {
            if (node.hasName("text-editable") || node.hasName("draggable-image") || node.hasName("box-editable")) {
                if (Konva.Util.haveIntersection(box, node.getClientRect())) {
                    nodesToSelect.push(node);
                }
            }
        });

        selectionRect.visible(false);

        if (nodesToSelect.length > 1) {
            enableGroupTransform(nodesToSelect, page);
        } else if (nodesToSelect.length === 1) {
            enableTransform(nodesToSelect[0], page);
        }

        page.overlay.batchDraw();
    });
}


// ========================================================================
// TRANSFORMER DLA GRUPY ELEMENTÓW
// ========================================================================
function enableGroupTransform(nodes, page) {

    const layer = page.layer;

    // Usuwamy stare transformatory
    layer.find("Transformer").each(t => t.destroy());

    const tr = new Konva.Transformer({
        nodes: nodes,
        padding: 10,
        rotateEnabled: true,
        keepRatio: false,
    });

    layer.add(tr);
    tr.forceUpdate();
    layer.draw();

    // UMOŻLIWIAMY PRZESUWANIE WSZYSTKICH ZAZNACZONYCH ELEMENTÓW
    nodes.forEach(node => {
        node.draggable(true);

        node.on("dragmove", () => {
            const dx = node.x() - node._lastPos?.x || 0;
            const dy = node.y() - node._lastPos?.y || 0;

            nodes.forEach(n => {
                if (n !== node) {
                    n.x(n.x() + dx);
                    n.y(n.y() + dy);
                }
            });

            nodes.forEach(n => n._lastPos = { x: n.x(), y: n.y() });
        });

        node.on("dragend", () => {
            nodes.forEach(n => delete n._lastPos);
        });
    });
}


importdanychbasic.js