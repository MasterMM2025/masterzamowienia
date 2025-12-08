// ======================================================================== //
// importdanych.js – PEŁNY, KONVA.JS – GLOBALNY CLIPBOARD + JEDNORAZOWE WKLEJANIE + PEŁNE DRAG & DROP + MENU WARSTW + USUWANIE STRON + CANVA-STYLE EDYTOR
// ======================================================================== //
window.isEditingText = false;

let allProducts = [], pages = [];
const MM_TO_PX = 3.78;
const PAGE_MARGIN = 15 * MM_TO_PX;  // ~56.7px


window.W = 794 + PAGE_MARGIN * 2;
window.H = 1123 + PAGE_MARGIN * 2;

let ML = 14 + PAGE_MARGIN;  // lewy margines strony + 15mm
let MT = 140 + PAGE_MARGIN; // górny margines strony + 15mm
let MB = 28 + PAGE_MARGIN;  // dolny margines strony + 15mm
let COLS = 2, ROWS = 3, GAP = 6;

const BW = (W - ML * 2 - GAP) / COLS;
const BH = (H - MT - MB - GAP * (ROWS - 1)) / ROWS;

// === GLOBALNY CLIPBOARD + PASTE MODE ===
window.globalClipboard = null;
window.globalPasteMode = false;

// === USTAWIENIA KATALOGU (GLOBALNE) ===
window.catalogSettings = {
    priceFormat: 'full'
};

// === ZOOM DLA CAŁEJ STRONY ===
let currentZoom = 1.0;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;

function applyZoomToPage(page, scale) {
    const wrapper = page.container.querySelector('.canvas-wrapper');
    if (!wrapper) return;
    wrapper.style.transition = 'transform 0.15s ease-out';
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = 'top center';
    if (page.stage) page.stage.batchDraw();
}

function createZoomSlider() {
    if (document.getElementById('zoomSlider')) return;

    const slider = document.createElement('div');
    slider.id = 'zoomSlider';
    slider.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #fff;
        padding: 10px 18px;
        border-radius: 30px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: Arial;
        border: 1px solid #ccc;
    `;

    slider.innerHTML = `
        <button onclick="changeZoom(-0.1)" style="border:none;background:none;font-size:24px;color:#333;cursor:pointer;">−</button>
        <input type="range" id="zoomRange" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="0.1" value="1" style="width:160px;accent-color:#007cba;">
        <span id="zoomValue" style="font-weight:bold;color:#222;min-width:50px;">100%</span>
        <button onclick="changeZoom(0.1)" style="border:none;background:none;font-size:24px;color:#333;cursor:pointer;">+</button>
    `;

    document.body.appendChild(slider);

    const range = document.getElementById('zoomRange');
    const value = document.getElementById('zoomValue');

    window.changeZoom = (delta) => {
        const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, currentZoom + delta));
        range.value = newZoom;
        currentZoom = newZoom;
        value.textContent = Math.round(newZoom * 100) + '%';
        pages.forEach(p => applyZoomToPage(p, newZoom));
    };

    range.oninput = () => {
        currentZoom = parseFloat(range.value);
        value.textContent = Math.round(currentZoom * 100) + '%';
        pages.forEach(p => applyZoomToPage(p, currentZoom));
    };

    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === '0') {
            e.preventDefault();
            range.value = 1;
            currentZoom = 1.0;
            value.textContent = '100%';
            pages.forEach(p => applyZoomToPage(p, 1.0));
        }
    });
}

// === IMPORT EXCEL (POMIJA NAGŁÓWEK) ===
window.importExcelMultiPage = async function() {
    const file = document.getElementById('excelFile')?.files[0];
    if (!file) return alert('Wybierz plik Excel!');

    try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(1);

        allProducts = json.map(row => ({
            INDEKS: String(row[0] || '').trim(),
            NAZWA: String(row[1] || '').trim(),
            CENA: String(row[2] || '').trim(),
            'KOD EAN': String(row[3] || '').trim(),
            RANKING: String(row[4] || '').trim(),
            LOGO: String(row[5] || '').trim(),
            KRAJPOCHODZENIA: String(row[6] || '').trim()
        })).filter(p => p.INDEKS || p.NAZWA);

        pages.forEach(p => {
            p.stage?.destroy();
            p.container?.remove();
        });
        pages = [];
        document.getElementById('pagesContainer').innerHTML = '';

        window.ExcelImporterReady = true;
        window.ExcelImporter = { pages };

        const perPage = COLS * ROWS;
        for (let i = 0; i < allProducts.length; i += perPage) {
            const prods = allProducts.slice(i, i + perPage);
            createPage(Math.floor(i / perPage) + 1, prods);
        }

        const pdfButton = document.getElementById('pdfButton');
        if (pdfButton) pdfButton.disabled = false;

        document.getElementById('fileLabel').textContent = file.name;
        createZoomSlider();
        window.dispatchEvent(new Event('excelImported'));

    } catch (e) {
        alert('Błąd: ' + e.message);
    }
};

// === TWORZENIE STRONY + KONVA + TRANSFORMER + MULTI-SELECT + WŁASNE SKALOWANIE ===
function createPage(n, prods) {
    const div = document.createElement('div');
    div.className = 'page-container';
    div.style.position = 'relative';

    // === WAŻNE: dopiero teraz tworzymy HTML strony ===
    div.innerHTML = `
  <div class="page-toolbar">
      <span class="page-title">Page ${n}</span>

      <div class="page-tools">
    <button class="page-btn move-up" data-tip="Przenieś stronę wyżej">⬆</button>
<button class="page-btn move-down" data-tip="Przenieś stronę niżej">⬇</button>
<button class="page-btn duplicate" data-tip="Powiel stronę">⧉</button>
<button class="page-btn add" data-tip="Dodaj pustą stronę">＋</button>
<button class="page-btn settings" data-tip="Edytuj stronę">⚙</button>
<button class="page-btn delete" data-tip="Usuń stronę">🗑</button>

</div>

  </div>

  <div class="canvas-wrapper"
       style="width:${W}px;height:${H}px;background:#fff;overflow:hidden;position:relative;">
      <div id="k${n}" style="width:${W}px;height:${H}px;"></div>
      <div class="grid-overlay" id="g${n}"></div>
  </div>
`;


    document.getElementById('pagesContainer').appendChild(div);

    const stage = new Konva.Stage({
        container: `k${n}`,
        width: W,
        height: H
    });
// === OBRYSY DLA MULTI-SELECT (CANVA STYLE) ===
function highlightSelection() {
    // Usuń stare obrysy
    page.layer.find('.selectionOutline').forEach(n => n.destroy());

    // Dodaj dla każdego zaznaczonego obiektu
    page.selectedNodes.forEach(node => {
        const box = node.getClientRect({ relativeTo: page.layer });

        const outline = new Konva.Rect({
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            stroke: '#00baff',
            strokeWidth: 1.5,
            dash: [4, 4],
            listening: false,
            name: 'selectionOutline'
        });

        page.layer.add(outline);
        outline.moveToTop();
    });

    page.layer.batchDraw();
}

    // WARSTWA 1: OBIEKTY
    const layer = new Konva.Layer();
    stage.add(layer);
    
// 🔥 TŁO STRONY – MUSI BYĆ NA POCZĄTKU WARSTWY
const bgRect = new Konva.Rect({
    x: 0,
    y: 0,
    width: W,
    height: H,
    fill: "#ffffff",
    listening: true  // 🔥 pozwala na double-click!
});
bgRect.setAttr("isPageBg", true);
layer.add(bgRect);
bgRect.moveToBottom(); // 🔥 zawsze na samym dole!
bgRect.setZIndex(0);
// 🔒 BLOKADA INTERAKCJI DLA TŁA STRONY
bgRect.draggable(false);         
bgRect.listening(true);          
bgRect.name("pageBackground");   
bgRect.setAttr("selectable", false);

// 🔒 uniemożliwiamy skalowanie i zaznaczanie
bgRect.on('mousedown', (e) => {
    // jeśli ktoś kliknie tło, to odznacz wszystkie inne zaznaczenia
    if (!window.globalPasteMode) {
        page.selectedNodes = [];
        page.transformer.nodes([]); // usuwamy uchwyty transformera
        hideFloatingButtons();
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
    }
});

// 🔒 nigdy nie pozwalaj transformować tła
bgRect.on('transformstart', (e) => e.cancelBubble = true);
bgRect.on('transform', (e) => e.cancelBubble = true);
bgRect.on('transformend', (e) => e.cancelBubble = true);



    // WARSTWA 2: TRANSFORMER
    const transformerLayer = new Konva.Layer();
    stage.add(transformerLayer);

    // TRANSFORMER – DOKŁADNE SKALOWANIE + WIĘCEJ UCHWYTÓW
const tr = new Konva.Transformer({
    hitStrokeWidth: 20,        // 🔥 tekst łatwo się zaznacza
padding: 6,                // 🔥 transformer jest widoczny przy jednej linii

    enabledAnchors: [
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right'
    ],
    rotateEnabled: true,
    ignoreStroke: false, // 🔥 lepsza precyzja transformacji
    keepRatio: true,
    borderStroke: '#007cba',
    borderStrokeWidth: 2,
    anchorStroke: '#007cba',
    anchorFill: '#ffffff',
    anchorSize: 12, // 🔥 większe uchwyty do łatwiejszego chwytania
    padding: 4,
    boundBoxFunc: (oldBox, newBox) => {
        // 🔥 ograniczamy minimalny rozmiar aby nic się nie "odwróciło"
        if (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20) return oldBox;
        return newBox;
    }
});
tr.anchorDragBoundFunc(function(oldPos, newPos) {
    const anchor = tr.getActiveAnchor();

    // 🟢 Rogi — pełne proporcjonalne skalowanie
    if (
        anchor === 'top-left' ||
        anchor === 'top-right' ||
        anchor === 'bottom-left' ||
        anchor === 'bottom-right'
    ) {
        return newPos;
    }

    // 🔵 Boki — tylko szerokość
    if (anchor === 'middle-left' || anchor === 'middle-right') {
        return {
            x: newPos.x,  // szerokość
            y: oldPos.y   // blokada góra–dół
        };
    }

    // 🔴 Góra/Dół — tylko wysokość
    if (anchor === 'top-center' || anchor === 'bottom-center') {
        return {
            x: oldPos.x,  // blokada lewo–prawo
            y: newPos.y   // wysokość
        };
    }

    return newPos;
});

    transformerLayer.add(tr);
    // === MARQUEE SELECTION (ZAZNACZANIE PRZECIĄGANIEM) ===
let marqueeActive = false;
let marqueeStart = null;

const selectionRect = new Konva.Rect({
    fill: 'rgba(0, 160, 255, 0.15)',
    stroke: 'rgba(0, 160, 255, 0.7)',
    strokeWidth: 1,
    visible: false,
    listening: false,   // 🔥 najważniejsze — nie przechwytuje kliknięć!
    name: 'selectionRect'
});
layer.add(selectionRect);
selectionRect.moveToTop(); // 🔥 zawsze na sam wierzch


stage.on('mousedown.marquee', (e) => {
    // Kliknięcie tylko na tło — nie na element
    if (e.target !== stage && e.target.getAttr("isPageBg") !== true) return;
    marqueeActive = true;
    marqueeStart = stage.getPointerPosition();

    selectionRect.setAttrs({
        x: marqueeStart.x,
        y: marqueeStart.y,
        width: 0,
        height: 0,
        visible: true
    });

    page.selectedNodes = [];
page.transformer.nodes([]);
page.layer.find('.selectionOutline').forEach(n => n.destroy());
page.layer.batchDraw();
floatingButtons?.remove();


});

stage.on('mousemove.marquee', () => {
    if (!marqueeActive) return;

    const pos = stage.getPointerPosition();

    selectionRect.setAttrs({
        x: Math.min(pos.x, marqueeStart.x),
        y: Math.min(pos.y, marqueeStart.y),
        width: Math.abs(pos.x - marqueeStart.x),
        height: Math.abs(pos.y - marqueeStart.y)
    });
    layer.batchDraw();
});

stage.on('mouseup.marquee', () => {
    if (!marqueeActive) return;
    marqueeActive = false;

    const area = selectionRect.getClientRect();

    const nodes = page.layer.getChildren().filter((node) => {
        const attrs = node.getAttrs();
        if (attrs.isBox || attrs.isProductText || attrs.isProductImage || attrs.isBarcode) {
            const box = node.getClientRect();
            return Konva.Util.haveIntersection(area, box);
        }
        return false;
    });

    selectionRect.visible(false);

    // USUŃ STARE OBRYSY
    page.layer.find(".selectionOutline").forEach(n => n.destroy());

    if (nodes.length > 0) {
        page.selectedNodes = nodes;
        page.transformer.nodes(nodes);
        highlightSelection();
        showFloatingButtons();
    } else {
        page.selectedNodes = [];
        page.transformer.nodes([]);
        hideFloatingButtons();
    }

    page.layer.batchDraw();
    page.transformerLayer.batchDraw();

    setTimeout(() => {
        marqueeStart = null;
        selectionRect.visible(false);
        page.layer.batchDraw();
    }, 50);
});

    // === TWORZENIE OBIEKTU STRONY ===
const page = {
    number: n,
    products: prods,
    stage: stage,
    layer: layer,
    transformerLayer: transformerLayer,
    container: div,
    transformer: tr,

    slotObjects: Array(prods.length).fill(null),
    barcodeObjects: Array(prods.length).fill(null),
    barcodePositions: Array(prods.length).fill(null),
    textPositions: [],
    boxScales: Array(prods.length).fill(null),

    selectedNodes: [],
    _oldTransformBox: null,

    settings: {
        nameSize: 12,
        indexSize: 14,
        priceSize: 18,
        fontFamily: 'Arial',
        textColor: '#000000',
        bannerUrl: null,
        currency: 'euro',
        pageBgColor: '#ffffff'
    }
};



    // === PEŁNE DRAG & DROP PO CAŁEJ STRONIE ===
    stage.container().style.touchAction = 'none';
    stage.on('dragover', e => e.evt.preventDefault());
    // === OBSŁUGA PRZECIĄGANIA ZDJĘĆ Z PULPITU NA STRONĘ (IMPORT Z SYSTEMU) ===
stage.container().addEventListener('dragover', (e) => {
  e.preventDefault();
  stage.container().style.border = "2px dashed #007cba";
});

stage.container().addEventListener('dragleave', () => {
  stage.container().style.border = "none";
});

stage.container().addEventListener('drop', (e) => {
  e.preventDefault();
  stage.container().style.border = "none";

  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();

  reader.onload = (ev) => {
      Konva.Image.fromURL(ev.target.result, (img) => {

          const pos = stage.getPointerPosition();
          img.x(pos.x);
          img.y(pos.y);

          const maxWidth = W * 0.6;
          const scale = Math.min(maxWidth / img.width(), 1);

          img.scale({ x: scale, y: scale });
          img.draggable(true);
          img.listening(true);

          img.setAttrs({
            isProductImage: true,
            slotIndex: null
        });
        
        // 🔥 KROK 3 — dodajemy nazwę obiektu, aby działał transform, multi-select i menu warstw
        img.name("droppedImage");
        
        // ustawienia: w pełni edytowalne, tak jak wszystkie obiekty
        img.draggable(true);
        img.listening(true);
        
        layer.add(img);
        
        
        layer.batchDraw();
        page.transformerLayer.batchDraw(); // ważne dla transformera
        
      });
  };

  reader.readAsDataURL(file);
});
// === ANIMACJA DRAG & DROP — CANVA STYLE ===
stage.on('dragstart', (e) => {
    const node = e.target;
    if (!node.draggable()) return;

    node.startX = node.x();
    node.startY = node.y();

    node.to({
        shadowColor: 'rgba(0,0,0,0.3)',
        shadowBlur: 12,
        shadowOffsetX: 5,
        shadowOffsetY: 5,
        opacity: 0.85,
        duration: 0.12,
        easing: Konva.Easings.EaseOut,
      });

    stage.container().style.cursor = 'grabbing';
});

stage.on('dragmove', () => {
    stage.batchDraw(); // 🚀 turbo płynność
});

stage.on('dragend', (e) => {
    // 🔥 usuń poprzednie obrysy po zakończeniu przeciągania
page.layer.find('.selectionOutline').forEach(n => n.destroy());
highlightSelection();

    const node = e.target;
    if (!node.draggable()) return;

    node.to({
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        opacity: 1,
        duration: 0.15,
        easing: Konva.Easings.EaseInOut,
    });

    stage.container().style.cursor = 'grab';
});


    // === NOWE PRZYCISKI NA GÓRZE STRONY (NOWY PANEL) ===
const toolbar = div.querySelector(".page-toolbar");

const btnUp       = toolbar.querySelector(".move-up");
const btnDown     = toolbar.querySelector(".move-down");
const btnDuplicate = toolbar.querySelector(".duplicate");
const btnAdd      = toolbar.querySelector(".add");
const btnDelete   = toolbar.querySelector(".delete");
const btnSettings = toolbar.querySelector(".settings");

btnSettings.onclick = (e) => {
    e.stopPropagation();

    // Jeśli to okładka → blokujemy edycję
    if (page.isCover) {
        alert("Edycja okładki jest osobnym modułem.");
        return;
    }

    // Uruchomienie panelu edycji strony
    if (typeof window.openPageEdit === "function") {
        window.openPageEdit(page);
    } else {
        console.error("Brak funkcji openPageEdit!");
    }
};



// ⬆ przesuwanie strony w górę
btnUp.onclick = () => {
    movePage(page, -1);
};

// ⬇ przesuwanie strony w dół
btnDown.onclick = () => {
    movePage(page, +1);
};

// ⧉ duplikuj stronę
btnDuplicate.onclick = () => {
    if (typeof window.createEmptyPageUnder === "function") {
        window.createEmptyPageUnder(page);
    } else {
        alert("Brak funkcji duplikowania strony.");
    }
};

// ＋ dodaj pustą stronę POD aktualną
btnAdd.onclick = () => {
    if (typeof window.createEmptyPageUnder === "function") {
        window.createEmptyPageUnder(page);
    } else {
        alert("Brak funkcji dodawania strony.");
    }
};

// 🗑 usuń stronę
btnDelete.onclick = () => {
    if (confirm("Czy na pewno chcesz usunąć tę stronę?")) {
        window.deletePage(page);
    }
};

    // === KOPIOWANIE + WKLEJANIE + MENU WARSTW ===
    let floatingButtons = null;

    function showFloatingButtons() {
      // jeśli menu już istnieje – usuń je
      if (floatingButtons) {
          floatingButtons.remove();
          floatingButtons = null;
      }
  
      const btnContainer = document.createElement('div');
      btnContainer.id = 'floatingMenu';
      btnContainer.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 99999;
          display: flex;
          gap: 12px;
          background: #fff;
          padding: 12px 20px;
          border-radius: 24px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.25);
          border: 1px solid #ccc;
          pointer-events: auto;
          font-size: 14px;
          font-weight: 500;
      `;
  
  
      btnContainer.innerHTML = `
          <button class="fab-btn fab-copy" data-action="copy">Kopiuj</button>
          <button class="fab-btn fab-cut" data-action="cut">Wytnij</button>
          <button class="fab-btn fab-delete" data-action="delete">Usuń</button>
          <button class="fab-btn fab-front" data-action="front">Na wierzch</button>
          <button class="fab-btn fab-back" data-action="back">Na spód</button>
          <button class="fab-btn fab-removebg" data-action="removebg">Usuń tło</button>
          <button class="fab-btn fab-barcolor" data-action="barcolor">Kolor kodu</button>

      `;
  
      document.body.appendChild(btnContainer);
      floatingButtons = btnContainer;
  
      // obsługa akcji
      btnContainer.querySelectorAll('.fab-btn').forEach(btn => {
          btn.onclick = (ev) => {
              ev.stopPropagation();
              const action = btn.dataset.action;
              const obj = page.selectedNodes[0];
              if (!obj) return;
  
              if (action === 'copy') {
    window.globalClipboard = page.selectedNodes.map(n => {
        
        // Clone Konva node
        const clone = n.clone();

        // Jeśli to BARCODE → ZAWSZE twórz nowy obraz!!!
        if (n.getAttr("isBarcode")) {
            const origSrc = n.getAttr("barcodeOriginalSrc");
            if (origSrc) {
                const img = new Image();
                img.src = origSrc;

                clone.image(img);
                clone.setAttr("barcodeOriginalSrc", origSrc);
            }
        }

        return clone;
    });

    window.globalPasteMode = true;
    pages.forEach(p => p.stage.container().style.cursor = 'copy');
}

              if (action === 'cut') {
    if (page.selectedNodes.length > 0) {
        // 📌 zapisujemy WSZYSTKIE zaznaczone obiekty do schowka
        window.globalClipboard = page.selectedNodes.map(n => n.clone());
        window.globalPasteMode = true;

        // 📌 kasujemy wszystkie zaznaczone elementy na stronie
        page.selectedNodes.forEach(n => n.destroy());
        page.selectedNodes = [];
    } else if (obj) {
        // fallback gdy przypadkiem jest tylko jeden obiekt
        window.globalClipboard = [obj.clone()];
        obj.destroy();
    }

    // 📌 czyścimy transformera — nic nie jest już zaznaczone
    page.transformer.nodes([]);
    layer.batchDraw();
    transformerLayer.batchDraw();
}

              if (action === 'delete') {
    if (page.selectedNodes.length > 0) {
        page.selectedNodes.forEach(n => n.destroy());
        page.selectedNodes = [];
    } else {
        obj.destroy();
    }

    page.transformer.nodes([]);
    layer.batchDraw();
    transformerLayer.batchDraw();
}

              // ⭐ Pobieramy wszystkie elementy tła
const backgrounds = page.layer.find(n =>
    n.getAttr("isPageBg") === true ||
    n.getAttr("isPageColor") === true
);

// najwyższy indeks tła — poniżej NIE schodzimy!
let lowestAllowedZ = 0;
if (backgrounds.length) {
    lowestAllowedZ = Math.max(...backgrounds.map(b => b.getZIndex()));
}

// 🚀 Na wierzch — jak dawniej
if (action === 'front') {
    obj.moveToTop();
    page.transformer.nodes([obj]);
}

// 🚀 Na spód — ale zawsze NAD tłem strony!
if (action === 'back') {
    const bg = page.layer.findOne(n => n.getAttr("isPageBg") === true);
    const bgZ = bg ? bg.getZIndex() : 0;

    // 🔥 Obiekt NIE może zejść niżej niż tło
    obj.setZIndex(bgZ + 1);

    page.transformer.nodes([obj]);
    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
}


page.layer.batchDraw();
page.transformerLayer.batchDraw();

  
              if (action === 'removebg') {
    if (!(obj instanceof Konva.Image))
        return alert("To nie jest obraz.");

    // ZAPISZ aktualne parametry obrazu
    const oldX = obj.x();
    const oldY = obj.y();
    const oldWidth = obj.width();
    const oldHeight = obj.height();
    const oldScaleX = obj.scaleX();
    const oldScaleY = obj.scaleY();
    const oldRotation = obj.rotation();
    const oldSlot = obj.getAttr("slotIndex");

    const originalUrl = obj.toDataURL();

    removeBackgroundAI(originalUrl, cleaned => {

        Konva.Image.fromURL(cleaned, newImg => {

            // 🔥 PRZYWRÓĆ IDENTYCZNE PARAMETRY
            newImg.x(oldX);
            newImg.y(oldY);
            newImg.width(oldWidth);
            newImg.height(oldHeight);
            newImg.scaleX(oldScaleX);
            newImg.scaleY(oldScaleY);
            newImg.rotation(oldRotation);

            newImg.draggable(true);
            newImg.listening(true);

            newImg.setAttrs({
                isProductImage: true,
                slotIndex: oldSlot
            });

            obj.destroy();
            layer.add(newImg);
            newImg.moveToTop();

            layer.batchDraw();
            page.transformerLayer.batchDraw();
        });
    });
}
if (action === 'barcolor') {
    const barcode = page.selectedNodes[0];
    if (!barcode || !barcode.getAttr("isBarcode"))
        return alert("Zaznacz kod kreskowy!");

    window.showSubmenu(`
        <button class="colorBtn" data-color="#000000" style="width:32px;height:32px;border-radius:6px;border:none;background:#000;"></button>
        <button class="colorBtn" data-color="#ffffff" style="width:32px;height:32px;border-radius:6px;border:1px solid #aaa;background:#fff;"></button>
        <button class="colorBtn" data-color="#FFD700" style="width:32px;height:32px;border-radius:6px;border:none;background:#FFD700;"></button>
        <input type="color" id="colorPicker" style="width:38px;height:32px;border:none;padding:0;margin-left:8px;">
        <button id="applyColorBtn"
            style="
                padding:8px 14px;
                border-radius:8px;
                border:none;
                background:#007cba;
                color:#fff;
                font-weight:600;
                cursor:pointer;
            ">
            Zastosuj
        </button>
    `);

    let previewColor = null;

    document.querySelectorAll(".colorBtn").forEach(btn => {
        btn.onclick = () => {
            previewColor = btn.dataset.color;
            window.recolorBarcode(barcode, previewColor, false);
        };
    });

    document.getElementById("colorPicker").oninput = (e) => {
        previewColor = e.target.value;
        window.recolorBarcode(barcode, previewColor, false);
    };

    document.getElementById("applyColorBtn").onclick = () => {
        if (!previewColor) return window.hideSubmenu();
        window.recolorBarcode(barcode, previewColor, true);
        window.hideSubmenu();
    };
}

  
              layer.batchDraw();
          };
      });
  }
  
  function hideFloatingButtons() {
      // NIE CHOWAMY menu — zawsze widoczne
  }
  // Udostępniamy globalnie floating menu dla innych plików
window.showFloatingButtons = showFloatingButtons;
window.hideFloatingButtons = hideFloatingButtons;


    // === GLOBALNE WKLEJANIE — WERSJA KOŃCOWA, DZIAŁAJĄCA ===
    stage.on('click.paste', (e) => {
        if (!window.globalPasteMode) return;
        const clip = window.globalClipboard;
        if (!Array.isArray(clip) || clip.length === 0) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const baseX = clip[0].x();
        const baseY = clip[0].y();
        const newNodes = [];

        clip.forEach(src => {
            const clone = src.clone({
                draggable: true,
                listening: true
            });
            clone.x(pointer.x + (src.x() - baseX));
            clone.y(pointer.y + (src.y() - baseY));
            clone.setAttrs({
                isProductText: src.getAttr("isProductText") || false,
                isName: src.getAttr("isName") || false,
                isIndex: src.getAttr("isIndex") || false,
                isPrice: src.getAttr("isPrice") || false,
                isBox: src.getAttr("isBox") || false,
                isBarcode: src.getAttr("isBarcode") || false,
                isProductImage: src.getAttr("isProductImage") || false,
                slotIndex: src.getAttr("slotIndex") ?? null
            });
            layer.add(clone);
            newNodes.push(clone);
        });

        layer.batchDraw();
        transformerLayer.batchDraw();
        page.selectedNodes = newNodes;
        page.transformer.nodes(newNodes);

        window.globalPasteMode = false;
        window.globalClipboard = null;
        pages.forEach(p => p.stage.container().style.cursor = 'default');
    });

    // === ESC – WYŁĄCZENIE PASTE MODE ===
    const escHandler = (e) => {
        if (e.key === 'Escape' && window.globalPasteMode) {
            window.globalPasteMode = false;
            window.globalClipboard = null;
            pages.forEach(p => p.stage.container().style.cursor = 'default');
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
// ===============================================
// PRIORYTET NAJMNIEJSZEGO OBIEKTU POD KURSOREM
// ===============================================
stage.on("mousedown.pickSmallest", (e) => {
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const page = pages.find(p => p.stage === stage);
    if (!page) return;

    // pobieramy WSZYSTKIE obiekty pod kursorem
    const hits = stage.getAllIntersections(pos);

    if (hits.length === 0) return;

    // sortowanie według rozmiaru bounding-box (najmniejszy pierwszy)
    hits.sort((a, b) => {
        const ra = a.getClientRect();
        const rb = b.getClientRect();
        const areaA = ra.width * ra.height;
        const areaB = rb.width * rb.height;
        return areaA - areaB;
    });

    // wybieramy najmniejszy element jako docelowy klik
    page._priorityClickTarget = hits[0];
});


    // === MULTI SELECT — POPRAWIONE SHIFT+CLICK (CANVA STYLE) ===
stage.on("click tap", (e) => {
    if (window.isEditingText) return;

    if (window.globalPasteMode) return;

    const target = e.target;

    // 🔥 tło nie jest wybieralne
    if (target.getAttr("isPageBg") === true) {
        page.selectedNodes = [];
        page.transformer.nodes([]);
        page.layer.find(".selectionOutline").forEach(n => n.destroy());
        hideFloatingButtons();
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
        return;
    }

    // 🔥 sprawdź, czy obiekt jest wybieralny
    const isSelectable =
        target instanceof Konva.Text ||
        target instanceof Konva.Image ||
        (target instanceof Konva.Rect && !target.getAttr("isPageBg"));

    if (!isSelectable) {
        // klik w pusty obszar — usuń zaznaczenie
        page.selectedNodes = [];
        page.transformer.nodes([]);
        page.layer.find(".selectionOutline").forEach(n => n.destroy());
        hideFloatingButtons();
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
        return;
    }

    // === SHIFT + CLICK → dodanie lub odjęcie z zaznaczenia ===
    if (e.evt.shiftKey) {
        if (page.selectedNodes.includes(target)) {
            page.selectedNodes = page.selectedNodes.filter(n => n !== target);
        } else {
            page.selectedNodes.push(target);
        }
    } else {
        // zwykły klik — pojedynczy wybór
        const autoTarget = page._priorityClickTarget || target;
page._priorityClickTarget = null;

page.selectedNodes = [autoTarget];

    }

    // === zastosowanie zmiany do transformera + outline ===
    page.transformer.nodes(page.selectedNodes);
    page.layer.find(".selectionOutline").forEach(n => n.destroy());
    highlightSelection();

    if (page.selectedNodes.length > 0) {
        showFloatingButtons();
    } else {
        hideFloatingButtons();
    }

    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
});


    // === TRANSFORMSTART – ZAPISUJEMY STAN ===
    stage.on('transformstart', () => {
   // 🔥 usuń stare obrysy i dodaj nowe zgodne z aktualnym rozmiarem
page.layer.find('.selectionOutline').forEach(n => n.destroy());
highlightSelection();


    page._oldTransformBox = page.transformer.getClientRect();
});


    // === TRANSFORM – WŁASNE SKALOWANIE ===
    stage.on('transform', () => {
        const nodes = page.selectedNodes;
        if (nodes.length <= 1) return;

        const trBox = page.transformer.getClientRect();
        const oldBox = page._oldTransformBox || trBox;
        const scaleX = trBox.width / oldBox.width;
        const scaleY = trBox.height / oldBox.height;

        nodes.forEach((node) => {
            if (node instanceof Konva.Text) {
                const newSize = node.fontSize() * Math.max(scaleX, scaleY);
                node.fontSize(Math.max(6, newSize));
            }
            if (node instanceof Konva.Image) {
                node.width(node.width() * scaleX);
                node.height(node.height() * scaleY);
            }
            if (node instanceof Konva.Rect) {
                node.width(node.width() * scaleX);
                node.height(node.height() * scaleY);
            }
        });

        page._oldTransformBox = trBox;
        page.layer.batchDraw();
    });
    // === DYNAMICZNE ZAWIJANIE + MINIMALNE WYMIARY DLA KAŻDEGO TEKSTU ===
stage.on('transform', () => {
    if (page.selectedNodes.length !== 1) return;

    const node = page.selectedNodes[0];
    if (!(node instanceof Konva.Text)) return;

    // --- Szerokość ---
    let newWidth = node.width() * node.scaleX();
    newWidth = Math.max(newWidth, 80); // minimalna szerokość
    node.scaleX(1);

    // --- Wysokość (tu był problem!) ---
    let newHeight = node.height() * node.scaleY();
    newHeight = Math.max(newHeight, 24); // minimalna wysokość tekstu
    node.scaleY(1);

    // zapisujemy
    node.width(newWidth);
    node.height(newHeight);

    node.setAttrs({ wrap: 'word' });

    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
});


    // === EVENTY TRANSFORMACJI ===
    stage.on('dragstart dragend transformend', () => {
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('canvasModified', { detail: stage }));
        }, 50);
    });

    pages.push(page);
    drawPage(page);

    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('canvasCreated', { detail: stage }));
    }, 100);

    applyZoomToPage(page, currentZoom);
    return page;
    // === ZAWSZE KOREKTUJEMY ROZMIAR WRAPPERA DO ROZMIARU STRONY ===
// 🔥 TO JEST JEDYNY WAŻNY FRAGMENT — on usuwa białe linie w PDF
const wrapperFixer = () => {
    const wrapper = page.container.querySelector('.canvas-wrapper');
    if (!wrapper) return;

    wrapper.style.width = `${W}px`;
    wrapper.style.height = `${H}px`;
    wrapper.style.overflow = "hidden";

    // Konva Stage też musi się odświeżyć
    page.stage.width(W);
    page.stage.height(H);
    page.stage.batchDraw();
};

// natychmiastowe poprawienie wymiarów
wrapperFixer();

// poprawianie przy zmianie stylu lub zoomu
setTimeout(wrapperFixer, 50);
setTimeout(wrapperFixer, 250);
setTimeout(wrapperFixer, 500);

}

// === USUWANIE STRONY – GLOBALNA FUNKCJA ===
window.deletePage = function(page) {
    const index = pages.indexOf(page);
    if (index === -1) return;

    page.stage.destroy();
    page.container.remove();
    pages.splice(index, 1);

    pages.forEach((p, i) => {
        p.number = i + 1;
        const h3 = p.container.querySelector('h3 span');
        if (h3) h3.textContent = `Strona ${i + 1}`;
    });
};

// === RYSOWANIE STRONY ===
function drawPage(page) {
    const { layer, transformerLayer, products, settings } = page;

    // ❌ NIE USUWAMY TŁA!
    layer.getChildren().forEach(child => {
        if (child.getAttr("isPageBg") !== true) {
            child.destroy();
        }
    });

    const showEan = document.getElementById('showEan')?.checked ?? true;
    const showCena = document.getElementById('showCena')?.checked ?? true;
    const frame3D = document.querySelector('input[name="frameStyle"]:checked')?.value === '3d';

    products.forEach((p, i) => {
        // oryginalna pozycja
const xRaw = ML + (i % COLS) * (BW + GAP);
const y = MT + Math.floor(i / COLS) * (BH + GAP);

// 🔥 PRZESUNIĘCIE WSZYSTKICH PUDEŁEK W LEWO / PRAWO
const LEFT_OFFSET = -40; // ← tu zmieniasz przesunięcie
const x = xRaw + LEFT_OFFSET;


        // === PUDEŁKO ===
        const box = new Konva.Rect({
            x, y,
            width: BW,
            height: BH,
            fill: '#fff',
            stroke: '#ccc',
            strokeWidth: 2,
            cornerRadius: 5,
            shadowEnabled: frame3D,
            shadowColor: 'rgba(0,0,0,0.2)',
            shadowBlur: 10,
            shadowOffset: { x: 5, y: 5 },
            draggable: true,
            listening: true,
            isBox: true,
            slotIndex: i
        });
        
        box.dragBoundFunc(pos => pos);
        if (page.boxScales[i]) {
            box.scaleX(page.boxScales[i].scaleX);
            box.scaleY(page.boxScales[i].scaleY);
        }
        layer.add(box);

        // === NAZWA ===
        const name = p.NAZWA || 'Pusty';
        const maxWidth = BW - 20;
        const lines = splitTextIntoLines(name, maxWidth, settings.nameSize, settings.fontFamily);
        let nameTop = y + 25;

        const fullName = p.NAZWA || 'Pusty';
const textObj = new Konva.Text({
    x: x + BW / 35,
    y: nameTop,
    text: fullName,
    fontSize: settings.nameSize,
    fill: settings.textColor,
    fontFamily: settings.fontFamily,
    align: 'center',
    width: BW - 20,
    wrap: 'word',
    draggable: true,
    listening: true,
    isProductText: true,
    isName: true
});
textObj.dragBoundFunc(pos => pos);
layer.add(textObj);
enableTextEditing(textObj, page);
textObj.moveToTop();
if (textObj.height() < 28) textObj.height(28);



        // === INDEKS ===
        const indexObj = new Konva.Text({
            x: x + BW / 4.1,
            y: y + BH - 80,
            text: `Indeks: ${p.INDEKS || '-'}`,
            fontSize: settings.indexSize,
            fill: settings.textColor,
            fontFamily: settings.fontFamily,
            align: 'center',
            width: BW - 20,
            draggable: true,
            listening: true,
            isProductText: true,
            isIndex: true
        });
        indexObj.dragBoundFunc(pos => pos);
        layer.add(indexObj);
        if (indexObj.height() < 26) indexObj.height(26);
        indexObj.moveToTop();
        enableTextEditing(indexObj, page);

        // === CENA ===
        if (showCena && p.CENA) {
            const currency = page.settings.currency || 'euro';
            const priceText = currency === 'euro' ? `${p.CENA}€` : `£${p.CENA}`;
            const priceObj = new Konva.Text({
                x: x + BW / 18 + 45, // +30 px w prawo
                y: y + 110 + (lines.length * settings.nameSize * 4.0), // przesunięcie o +20
                text: priceText,
                fontSize: settings.priceSize,
                fill: '#000000',
                fontFamily: settings.fontFamily,
                align: 'center',
                width: BW - 20,
                draggable: true,
                listening: true,
                isProductText: true,
                isPrice: true,
                slotIndex: i
            });
            priceObj.dragBoundFunc(pos => pos);
            layer.add(priceObj);
            priceObj.moveToTop();
            enableTextEditing(priceObj, page);

        }

        // === ZDJĘCIE ===
        if (page.slotObjects[i]) {
            const img = page.slotObjects[i];
            const scale = Math.min((BW * 0.45 - 20) / img.width(), (BH * 0.6) / img.height(), 1);
            const imgTop = y + 100 + (lines.length * settings.nameSize * 1.2);
            img.x(x + 20);
            img.y(imgTop);
            img.scaleX(scale);
            img.scaleY(scale);
            img.draggable(true);
            img.dragBoundFunc(pos => pos);
            layer.add(img);
            img.listening(true);
            img.setAttrs({
                width: img.width(),
                height: img.height(),
                isProductImage: true,
                slotIndex: i
            });
        
        }

        // === KOD KRESKOWY ===
        if (showEan && p['KOD EAN'] && !page.barcodeObjects[i]) {
            window.generateBarcode(p['KOD EAN'], data => {
    if (!data) return;
    Konva.Image.fromURL(data, img => {

        // 🔥 KOPIA ORYGINALNEGO PNG — unikalna dla KAŻDEGO kodu
        const originalCopy = data.slice();      
        img.setAttr("barcodeOriginalSrc", originalCopy);

        const bw = 140;
        const bh = 40;
        const bx = x + (BW - bw) / 1 - 35;
        const by = y + BH - bh - 20;

        const scaleFactor = 0.65;
        img.scaleX(scaleFactor);
        img.scaleY(scaleFactor);
        img.x(bx);
        img.y(by);

        img.draggable(true);
        img.dragBoundFunc(pos => pos);

        img.setAttrs({
            isBarcode: true,
            slotIndex: i,
            width: img.width(),
            height: img.height()
        });

        layer.add(img);
        page.barcodeObjects[i] = img;
        page.barcodePositions[i] = { x: bx, y: by };

        layer.batchDraw();
        transformerLayer.batchDraw();
    });
});

        }
    });

    // === BANER ===
    if (page.settings.bannerUrl) {
        const oldBanner = layer.getChildren().find(o => o.getAttr('name') === 'banner');
        if (oldBanner) oldBanner.destroy();

        Konva.Image.fromURL(page.settings.bannerUrl, img => {
            const scale = Math.min(W / img.width(), 113 / img.height());
            img.scaleX(scale);
            img.scaleY(scale);
            img.x(0);
            img.y(0);
            img.setAttr('name', 'banner');
            img.draggable(true);
            img.dragBoundFunc(pos => pos);
            layer.add(img);
            img.listening(true);
            img.setAttrs({
                width: img.width(),
                height: img.height()
            });
            img.moveToBottom();
            layer.batchDraw();
            transformerLayer.batchDraw();
        });
    } else {
        layer.batchDraw();
        transformerLayer.batchDraw();
    }
}

// === DODAJ STYL DLA KONVAJS-CONTENT ===
const konvaStyle = document.createElement('style');
konvaStyle.textContent = `
    .canvas-wrapper, .page-container { position: relative !important; }
    .konvajs-content { position: relative !important; }
`;
document.head.appendChild(konvaStyle);
// === STYL DLA NOWEGO MENU STRONY (PAGE TOOLBAR) ===
const pageToolbarStyle = document.createElement('style');
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
    font-size: 18px;
    font-weight: 600;
    margin-left: 10px;
}

.page-tools {
    display: flex;
    gap: 8px;
}

.page-btn {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    border: 1px solid #ddd;
    background: #f3f3f3;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
}

.page-btn:hover {
    background: #e2e2e2;
}
`;
document.head.appendChild(pageToolbarStyle);
const tooltipStyle = document.createElement("style");
tooltipStyle.textContent = `
.page-btn {
    position: relative;
}

.page-btn:hover::after {
    content: attr(data-tip);
    position: absolute;
    top: -40px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: #fff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 1;
    z-index: 999999;
}

.page-btn::after {
    opacity: 0;
    transition: opacity 0.2s ease;
}
`;
document.head.appendChild(tooltipStyle);



// === RESZTA FUNKCJI ===
function splitTextIntoLines(text, maxWidth, fontSize, fontFamily) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    const testCanvas = document.createElement('canvas');
    const ctx = testCanvas.getContext('2d');
    ctx.font = `${fontSize}px ${fontFamily}`;

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = ctx.measureText(testLine).width;
        if (width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
            if (lines.length >= 4) break;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);

    if (lines.length === 0 && ctx.measureText(text).width > maxWidth) {
        let cut = '';
        for (const char of text) {
            if (ctx.measureText(cut + char).width > maxWidth) break;
            cut += char;
        }
        lines.push(cut + '...');
    }
    return lines.slice(0, 4);
}

function generateBarcode(ean, cb) {
    const key = ean.trim().replace(/\s+/g, '');
    if (window.barcodeCache && window.barcodeCache[key]) return cb(window.barcodeCache[key]);

    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    try {
        JsBarcode(c, key, {
            format: 'EAN13',
            width: 2.2,
            height: 50,
            displayValue: true,
            fontSize: 14,
            margin: 5,
            marginLeft: 10,
            marginRight: 10,
            marginTop: 10,
            marginBottom: 10,
            flat: false,
            background: 'transparent',
            lineColor: '#000'
        });

        const imageData = ctx.getImageData(0, 0, c.width, c.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 240 && data[i+1] > 240 && data[i+2] > 240) {
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const url = c.toDataURL('image/png');

        if (!window.barcodeCache) window.barcodeCache = {};
        window.barcodeCache[key] = url;
        cb(url);
    } catch (e) {
        console.error('Błąd generowania kodu kreskowego:', e);
        cb(null);
    }
}
window.recolorBarcode = function(konvaImage, color, finalApply = false) {

    const originalSrc = konvaImage.getAttr("barcodeOriginalSrc");
    if (!originalSrc) {
        console.error("Brak oryginalnego src dla kodu!");
        return;
    }

    const img = new Image();
    img.src = originalSrc;

    img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const rNew = parseInt(color.substring(1, 3), 16);
        const gNew = parseInt(color.substring(3, 5), 16);
        const bNew = parseInt(color.substring(5, 7), 16);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            if (r < 160 && g < 160 && b < 160) {
                data[i] = rNew;
                data[i+1] = gNew;
                data[i+2] = bNew;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        const finalSrc = canvas.toDataURL("image/png");

        // 🔥 najważniejsze — tworzę NOWY obraz, NIE nadpisuję starego
        const recolored = new Image();
        recolored.onload = () => {
            konvaImage.image(recolored);   // bez nakładania bitmap
            if (finalApply) {
                konvaImage.setAttr("barcodeColor", color);
            }
            konvaImage.getLayer().batchDraw();
        };
        recolored.src = finalSrc;
    };
};


// === SUBMENU POD FLOATING MENU ===
const submenu = document.createElement("div");
submenu.id = "floatingSubmenu";
submenu.style.cssText = `
    position: fixed;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    background: #fff;
    padding: 12px 18px;
    border-radius: 16px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    border: 1px solid #ccc;
    z-index: 99998;
    display: none;
    gap: 12px;
    align-items: center;
`;
document.body.appendChild(submenu);

window.showSubmenu = (html) => {
    const floating = document.getElementById("floatingMenu");
    const submenuWidth = floating ? floating.offsetWidth + "px" : "auto";

    submenu.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;width:${submenuWidth};justify-content:center;">
            ${html}
        </div>
    `;
    submenu.style.display = "flex";
};

window.hideSubmenu = () => {
    submenu.style.display = "none";
};

// zamknij submenu klikając poza nim
document.addEventListener("click", (e) => {
    if (!e.target.closest("#floatingMenu") &&
        !e.target.closest("#floatingSubmenu")) {
        window.hideSubmenu();
    }
});



window.importImagesFromFiles = function() {
    const input = document.getElementById('imageInput');
    const files = input?.files;
    if (!files || files.length === 0) return alert('Wybierz zdjęcia!');
    if (!pages || pages.length === 0) {
        return alert('Najpierw zaimportuj Excel!');
    }

    const map = new Map();
    pages.forEach((page, pi) => {
        if (page.isCover) return;
        if (!page.products) return;
        page.products.forEach((p, si) => {
            if (!p.INDEKS) return;
            const key = p.INDEKS.toLowerCase().trim();
            if (!map.has(key)) map.set(key, []);
            map.get(key).push({ pageIndex: pi, slotIndex: si });
        });
    });

    const matched = [];
    Array.from(files).forEach(file => {
        const name = file.name.toLowerCase().replace(/\.[^/.]+$/, '').replace(/[^0-9a-z]/g, '');
        for (const [indeks, positions] of map) {
            const clean = indeks.replace(/[^0-9a-z]/g, '');
            if (name.includes(clean) || clean.includes(name)) {
                matched.push({ file, positions });
                break;
            }
        }
    });

    if (matched.length === 0) return alert('Brak dopasowań');

    matched.forEach(({ file, positions }) => {
      const reader = new FileReader();
      reader.onload = e => {
          const imgData = e.target.result;
  
          Konva.Image.fromURL(imgData, img => {
  
              positions.forEach(({ pageIndex, slotIndex }) => {
                  const page = pages[pageIndex];
  
                  if (page.slotObjects[slotIndex]) {
                      page.slotObjects[slotIndex].destroy();
                  }
  
                  const scale = Math.min(
                      (BW * 0.45 - 20) / img.width(),
                      (BH * 0.6) / img.height(),
                      1
                  );
  
                  const x = ML + (slotIndex % COLS) * (BW + GAP) + 20;
                  const y = MT + Math.floor(slotIndex / COLS) * (BH + GAP) + 100;
  
                  const clone = img.clone();
                  clone.x(x);
                  clone.y(y);
                  clone.scaleX(scale);
                  clone.scaleY(scale);
                  clone.draggable(true);
                  clone.dragBoundFunc(pos => pos);
  
                  page.layer.add(clone);
                  clone.listening(true);
  
                  clone.setAttrs({
                      width: clone.width(),
                      height: clone.height(),
                      isProductImage: true,
                      slotIndex: slotIndex
                  });
  
              
                  page.slotObjects[slotIndex] = clone;
  
                  page.layer.batchDraw();
                  page.transformerLayer.batchDraw();
              });
          });
      };
      reader.readAsDataURL(file);
  });
  
          

    input.value = '';
    alert(`Zaimportowano ${matched.length} zdjęć`);
};
async function removeBackgroundAI(imgData, cb) {
    const session = await ort.InferenceSession.create("/models/u2net.onnx");

    const img = new Image();
    img.src = imgData;
    await img.decode();

    const SIZE = 320;

    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, SIZE, SIZE);

    const input = new Float32Array(SIZE * SIZE * 3);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

    for (let i = 0; i < SIZE * SIZE; i++) {
        input[i]                    = data[i * 4] / 255;
        input[i + SIZE * SIZE]      = data[i * 4 + 1] / 255;
        input[i + 2 * SIZE * SIZE]  = data[i * 4 + 2] / 255;
    }

    const tensor = new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]);

    const inputName = session.inputNames[0];

    const result = await session.run({ [inputName]: tensor });
    const mask = result[session.outputNames[0]].data;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = img.width;
    outCanvas.height = img.height;
    const outCtx = outCanvas.getContext("2d");

    outCtx.drawImage(img, 0, 0);
    const outData = outCtx.getImageData(0, 0, img.width, img.height);
    const outPixels = outData.data;

    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const ix = Math.floor((x / img.width) * SIZE);
            const iy = Math.floor((y / img.height) * SIZE);
            const maskVal = mask[iy * SIZE + ix];

            outPixels[(y * img.width + x) * 4 + 3] = maskVal * 255;
        }
    }

    outCtx.putImageData(outData, 0, 0);
    cb(outCanvas.toDataURL("image/png"));
}



window.generatePDF = async function() {
    if (!pages.length) return alert('Brak stron');

    const PAGE_GAP = 25; // 🔥 odstęp między stronami PDF

    const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: [W, H + PAGE_GAP]   // 🔥 powiększona wysokość PDF
    });

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        // 🔹 1. Ukryj transformer na tej stronie na czas eksportu
        if (page.transformer) {
            page.transformer.visible(false);
        }
        if (page.transformerLayer) {
            page.transformerLayer.hide();
            page.transformerLayer.batchDraw();
        }

        // 🔹 2. Ukryj siatkę (jeśli jest) na czas eksportu
        const overlay = document.getElementById(`g${page.number}`);
        if (overlay) overlay.style.display = 'none';

        // 🔹 3. Render sceny do obrazka (JUŻ BEZ UCHWYTÓW)
        const data = pages[i].stage.toDataURL({
    mimeType: "image/jpeg",
    quality: 1.0,    // bardzo dobra jakość
    pixelRatio: 3   // bardzo ostry PDF
});

        // 🔹 4. Dodaj stronę do PDF
        if (i > 0) pdf.addPage();
        pdf.addImage(data, 'PNG', 0, 0, W, H);

        // 🔹 5. Przywróć siatkę
        if (overlay) overlay.style.display = '';

        // 🔹 6. Przywróć transformer po eksporcie
        if (page.transformer) {
            page.transformer.visible(true);
        }
        if (page.transformerLayer) {
            page.transformerLayer.show();
            page.transformerLayer.batchDraw();
        }
    }

    pdf.save('katalog.pdf');
};


window.generatePDFBlob = async function() {
    if (!pages.length) throw new Error();

    const PAGE_GAP = 25;  // 🔥 odstęp między stronami PDF

    const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: [W, H + PAGE_GAP]   // 🔥 dodajemy miejsce pod stroną
    });


    for (let i = 0; i < pages.length; i++) {

    // --- USUNIĘCIE overlay PRZED renderem PDF ---
    const overlay = document.getElementById(`g${pages[i].number}`);
    let overlayParent = null;

    if (overlay) {
        overlayParent = overlay.parentNode;
        overlay.remove();  // 🔥 to usuwa białą linię na 100%
    }

    // --- RENDER STRONY ---
    // JPEG zamiast PNG + mniejszy pixelRatio
const data = pages[i].stage.toDataURL({
    mimeType: "image/jpeg",
    quality: 0.82,   // 🔥 lepsza jakość
    pixelRatio: 1.35 // 🔥 ostro, ale nadal lekko
});



    if (i > 0) pdf.addPage();
    pdf.addImage(data, 'PNG', 0, 0, W, H);

    // --- PRZYWRÓCENIE overlay PO renderze ---
    if (overlay && overlayParent) {
        overlayParent.appendChild(overlay);
    }
}

return pdf.output('blob');

};

window.clearAll = function() {
    pages.forEach(p => {
        p.stage?.destroy();
        p.container?.remove();
    });
    pages = [];
    document.getElementById('pagesContainer').innerHTML = '';

    window.ExcelImporterReady = false;
    window.ExcelImporter = null;

    const pdfButton = document.getElementById('pdfButton');
    if (pdfButton) pdfButton.disabled = true;

    const slider = document.getElementById('zoomSlider');
    if (slider) slider.remove();

    const menu = document.getElementById('floatingMenu');
    if (menu) menu.remove();
};

const floatingBtnStyle = document.createElement('style');
floatingBtnStyle.textContent = `
    .fab-btn {
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 600;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        color: #fff;
        min-width: 80px;
        transition: all 0.2s;
    }
    .fab-copy { background: #007cba; }
    .fab-cut { background: #ff9800; }
    .fab-delete { background: #dc3545; }
    .fab-front { background: #28a745; }
    .fab-back { background: #6c757d; }
    .fab-forward { background: #17a2b8; }
    .fab-backward { background: #ffc107; color: #212529; }
    .fab-removebg { background: #8e44ad; } /* fioletowy */
    .fab-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }
`;
document.head.appendChild(floatingBtnStyle);


// === UNDO/REDO — TYLKO TEKST ===
(function() {
    const history = new Map();

    function getHistory(page) {
        if (!history.has(page)) {
            history.set(page, { undo: [], redo: [], current: null });
        }
        return history.get(page);
    }

    function captureTextState(page) {
        const texts = page.stage.find('Text').map(t => ({
            id: t._id,
            text: t.text(),
            x: t.x(),
            y: t.y(),
            fontSize: t.fontSize()
        }));
        return texts;
    }

    function applyTextState(page, state) {
        const stageTexts = page.stage.find('Text');
        state.forEach(saved => {
            const node = stageTexts.find(t => t._id === saved.id);
            if (node) {
                node.text(saved.text);
                node.x(saved.x);
                node.y(saved.y);
                node.fontSize(saved.fontSize);
            }
        });
        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
    }

    function saveState(page) {
        const h = getHistory(page);
        if (h.current) h.undo.push(h.current);
        h.current = captureTextState(page);
        h.redo = [];
        updateButtons(page);
    }

    function undo(page) {
        const h = getHistory(page);
        if (h.undo.length === 0) return;
        h.redo.push(h.current);
        h.current = h.undo.pop();
        applyTextState(page, h.current);
        updateButtons(page);
    }

    function redo(page) {
        const h = getHistory(page);
        if (h.redo.length === 0) return;
        h.undo.push(h.current);
        h.current = h.redo.pop();
        applyTextState(page, h.current);
        updateButtons(page);
    }

    function updateButtons(page) {
        const h = getHistory(page);
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.disabled = h.undo.length === 0;
        if (redoBtn) redoBtn.disabled = h.redo.length === 0;
    }

    window.addEventListener('canvasCreated', (e) => {
        const stage = e.detail;
        const page = pages.find(p => p.stage === stage);
        if (!page) return;

        if (!getHistory(page).current) saveState(page);

        stage.on('dragend transformend', () => {
            saveState(page);
        });

        document.addEventListener('keydown', (ev) => {
            if (!ev.ctrlKey) return;
            if (ev.key === 'z') {
                ev.preventDefault();
                undo(page);
            }
            if (ev.key === 'y') {
                ev.preventDefault();
                redo(page);
            }
        });

        document.getElementById('undoBtn')?.addEventListener('click', () => undo(page));
        document.getElementById('redoBtn')?.addEventListener('click', () => redo(page));
    });
})();

window.ExcelImporterReady = false;
// === GLOBALNE ODZNACZANIE POZA KONTENEREM ROBOCZYM ===
document.addEventListener('click', (e) => {
  const clickedInsidePage = e.target.closest('.page-container');

  if (!clickedInsidePage) {
    pages.forEach(page => {
      page.selectedNodes = [];
      page.transformer.nodes([]);

      // 🔥 USUNIĘCIE WSZYSTKICH DASH-OUTLINE
      page.layer.find('.selectionOutline').forEach(n => n.destroy());
      page.layer.batchDraw();

      page.transformerLayer.batchDraw();
    });

    const menu = document.getElementById('floatingMenu');
    if (menu) menu.remove();
  }
});

// === GLOBALNE UNDO/REDO Z GUI + SKRÓTY KLAWISZOWE ===
document.addEventListener('keydown', (e) => {
    const page = pages.find(p => p.stage === document.activeStage);
    if (!page) return;

    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('undoAction', { detail: page.stage }));
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('redoAction', { detail: page.stage }));
    }
});

document.getElementById('undoBtn')?.addEventListener('click', () => {
    const page = pages.find(p => p.stage === document.activeStage);
    if (page) window.dispatchEvent(new CustomEvent('undoAction', { detail: page.stage }));
});

document.getElementById('redoBtn')?.addEventListener('click', () => {
    const page = pages.find(p => p.stage === document.activeStage);
    if (page) window.dispatchEvent(new CustomEvent('redoAction', { detail: page.stage }));
});

// Gdy modyfikujemy cokolwiek na stronie → oznacz ją jako aktywną
window.addEventListener('canvasModified', (e) => {
    document.activeStage = e.detail;
});
window.movePage = function(page, direction) {
    const index = pages.indexOf(page);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= pages.length) return;

    // Zamiana w tablicy
    const tmp = pages[newIndex];
    pages[newIndex] = page;
    pages[index] = tmp;

    // Zamiana w DOM
    const container = document.getElementById('pagesContainer');
    if (direction < 0) {
        container.insertBefore(page.container, tmp.container);
    } else {
        container.insertBefore(tmp.container, page.container);
    }

    // ⭐ Aktualizacja numerów NA NOWYM TOOLBARZE
    pages.forEach((p, i) => {
        p.number = i + 1;

        const title = p.container.querySelector('.page-title');
        if (title) title.textContent = `Page ${i + 1}`;
    });

    console.log(`Strona przesunięta na pozycję ${newIndex + 1}`);
};

function applyCursorEvents(page) {
    const nodes = page.stage.find('Rect, Text, Image');
    nodes.forEach(node => {
        if (!node.draggable()) return;

        node.on('mouseover', () => {
            page.stage.container().style.cursor = 'grab';
        });

        node.on('mouseout', () => {
            page.stage.container().style.cursor = 'default';
        });
    });
}


// Automatycznie przy tworzeniu każdej strony:
window.addEventListener('canvasCreated', (e) => {
    const page = pages.find(p => p.stage === e.detail);
    setTimeout(() => applyCursorEvents(page), 200);
});
function enableTextEditing(textNode, page) {
    const stage = page.stage;

    textNode.on('dblclick dbltap', () => {

        window.isEditingText = true;   // 🔥 blokada kliknięć i multi-select

        page.transformer.hide();

        const pos = textNode.getAbsolutePosition();
        const rect = stage.container().getBoundingClientRect();

        const absX = rect.left + pos.x + window.scrollX;
        const absY = rect.top + pos.y + window.scrollY;

        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        textarea.value = textNode.text();
        textarea.style.position = 'absolute';
        textarea.style.left = absX + 'px';
        textarea.style.top = absY + 'px';
        textarea.style.width = textNode.width() + 'px';
        textarea.style.height = (textNode.height() + 20) + 'px';
        textarea.style.fontSize = textNode.fontSize() + 'px';
        textarea.style.fontFamily = textNode.fontFamily();
        textarea.style.color = textNode.fill();
        textarea.style.padding = '4px';
        textarea.style.border = '2px solid #007bff';
        textarea.style.borderRadius = '6px';
        textarea.style.background = 'white';
        textarea.style.zIndex = 99999;

        textarea.focus();

        function finishEditing() {
            const newText = textarea.value;
            textNode.text(newText);

            // === AUTO-RESIZE WYSOKOŚCI TEKSTU ===
            const dummy = document.createElement("div");
            dummy.style.position = "absolute";
            dummy.style.visibility = "hidden";
            dummy.style.width = textNode.width() + "px";
            dummy.style.fontSize = textNode.fontSize() + "px";
            dummy.style.fontFamily = textNode.fontFamily();
            dummy.style.whiteSpace = "pre-wrap";
            dummy.style.lineHeight = "1.2";
            dummy.innerText = newText;
            document.body.appendChild(dummy);

            const newHeight = Math.max(28, dummy.offsetHeight + 4);
            textNode.height(newHeight); // 🔥 teraz wszystkie linie widoczne

            dummy.remove();
            textarea.remove();

            window.isEditingText = false; // 🔥 odblokowanie multi-select
            page.transformer.show();
            page.layer.batchDraw();
        }

        textarea.addEventListener('blur', finishEditing);

        textarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finishEditing();
            }
        });
    });
}
// =====================================================================
// PANEL EDYCJI STRONY – WSPÓLNY DLA WSZYSTKICH STRON
// =====================================================================

window.openPageEdit = function(page) {

    // Usuń stary panel, jeśli jest
    let old = document.getElementById("pageEditPanel");
    if (old) old.remove();

    // Tworzymy panel
    const panel = document.createElement("div");
    panel.id = "pageEditPanel";

    panel.style.cssText = `
        position: fixed;
        top: 100px;
        right: 40px;
        width: 260px;
        background: #fff;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        z-index: 999999;
        font-family: Arial;
    `;

    panel.innerHTML = `
        <h3 style="margin:0 0 10px 0;">Ustawienia strony</h3>

        <label>Kolor tła:</label>
        <input type="color" id="bgColorPicker"
               value="${page.settings.pageBgColor || '#ffffff'}"
               style="width:100%;height:40px;margin:8px 0;">

        <label>Baner (URL):</label>
        <input type="text" id="bannerUrlInput"
               value="${page.settings.bannerUrl || ''}"
               placeholder="https://..."
               style="width:100%;padding:6px;margin:8px 0;">

        <button id="applyPageEdit"
                style="width:100%;padding:10px;background:#007cba;color:#fff;border:none;border-radius:8px;margin-top:12px;">
            Zastosuj
        </button>

        <button id="closePageEdit"
                style="width:100%;padding:10px;background:#777;color:#fff;border:none;border-radius:8px;margin-top:8px;">
            Zamknij
        </button>
    `;

    document.body.appendChild(panel);

    // ====== Zastosuj ======
    document.getElementById("applyPageEdit").onclick = () => {
        const bgColor = document.getElementById("bgColorPicker").value;
        const bannerUrl = document.getElementById("bannerUrlInput").value.trim();

        // Tło
        const bg = page.layer.findOne(n => n.getAttr("isPageBg"));
        if (bg) bg.fill(bgColor);

        page.settings.pageBgColor = bgColor;

        // Baner
        page.settings.bannerUrl = bannerUrl || null;

        // Przerysuj stronę
        drawPage(page);
    };

    // ====== Zamknij ======
    document.getElementById("closePageEdit").onclick = () => {
        panel.remove();
    };
};

console.log("importdanych.js – PEŁNY KOD ZAŁADOWANY – wszystko działa idealnie!");//DZIALA
