// dodajstrone.js – DODAWANIE PUSTYCH STRON POD KAŻDĄ STRONĄ (KONVA.JS) + PEŁNE DRAG & DROP + GLOBALNY CLIPBOARD + MENU WARSTW

let pageCounter = 1;
// === WSPÓLNE FLAGI KONVA DLA WSZYSTKICH ELEMENTÓW ===
function markAsEditable(node) {
    node.setAttr("isEditable", true);
    node.setAttr("isDesignElement", true);
    node.setAttr("isSelectable", true);
    node.setAttr("isDraggable", true);

    node.draggable(true);
    node.listening(true);
}


// === TWORZENIE PUSTEJ STRONY POD KONKRETNĄ STRONĄ ===
window.createEmptyPageUnder = function(parentPage) {
  const n = ++pageCounter;
  const div = document.createElement('div');
  div.className = 'page-container';
  div.style.position = 'relative';
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



<div class="canvas-wrapper">
  <div id="c-empty-${n}" style="width:${W}px; height:${H}px; background:#fff;"></div>

  <div class="grid-overlay" id="g-empty-${n}"></div>
</div>

<div class="add-page-btn-wrapper">
  <button class="add-page-btn"><span class="add-page-plus">+</span> Dodaj stronę</button>
</div>

  `;

  const container = document.getElementById('pagesContainer');

  // Wstaw POD parentPage
  if (parentPage && parentPage.container && parentPage.container.nextSibling) {
    container.insertBefore(div, parentPage.container.nextSibling);
  } else {
    container.appendChild(div);
  }

  const stage = new Konva.Stage({
    container: `c-empty-${n}`,
    width: W,
    height: H
});

// === WARSTWA: TŁO STRONY ===
const bgLayer = new Konva.Layer();
stage.add(bgLayer);

const bgRect = new Konva.Rect({
    x: 0,
    y: 0,
    width: W,
    height: H,
    fill: "#ffffff",
    listening: true // pozwala na double click w edycja-1.js
});
bgRect.setAttr("isPageBg", true);
bgLayer.add(bgRect);
bgLayer.batchDraw();

// === WARSTWA: OBIEKTY ===
const layer = new Konva.Layer();
stage.add(layer);

// === WARSTWA: TRANSFORMERY ===
const transformerLayer = new Konva.Layer();
stage.add(transformerLayer);

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


transformerLayer.add(tr);

const page = {
    number: `pusta-${n}`,
    isEmpty: true,
    stage,
    bgLayer,   // ⬅️ DODANA WARSTWA
    layer,
    transformerLayer,
    transformer: tr,
    container: div,
    products: [],
    slotObjects: [],
    barcodeObjects: [],
    selectedNodes: [],
    settings: {
        nameSize: 12,
        indexSize: 14,
        priceSize: 18,
        fontFamily: 'Arial',
        textColor: '#000000',
        bannerUrl: null,
        currency: 'euro'
    }
};


  // === PEŁNE DRAG & DROP PO CAŁEJ STRONIE ===
  stage.container().style.touchAction = 'none';
  stage.on('dragover', e => e.evt.preventDefault());

  // === OBSŁUGA PRZECIĄGANIA ZDJĘĆ Z PULPITU NA STRONĘ ===
stage.container().addEventListener('dragover', (e) => {
  e.preventDefault();
  stage.container().style.border = "2px dashed #007cba";
});

stage.container().addEventListener('dragleave', (e) => {
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
      markAsEditable(img);
      img.setAttr("isEditable", true);
img.setAttr("isFromEmptyPage", true); // opcjonalnie
markAsEditable(img);



      // Domyślna pozycja – w miejscu upuszczenia
      const pos = stage.getPointerPosition();
      img.x(pos.x);
      img.y(pos.y);

      // Automatyczne skalowanie, aby nie była za duża
      const maxWidth = W * 0.7;
      const scale = Math.min(maxWidth / img.width(), 1);
      img.scale({ x: scale, y: scale });

      img.draggable(true);
      img.listening(true);

      layer.add(img);
      layer.batchDraw();
    });
  };

  reader.readAsDataURL(file);
});


  // === PODWÓJNE KLIKNIĘCIE → EDYCJA TEKSTU ===
  stage.on('dblclick', (e) => {
    const node = e.target;
    if (!node || !(node instanceof Konva.Text)) return;
    if (typeof window.openEditPanel === 'function') {
      const panel = window.openEditPanel(node, stage);
      if (panel) panel.style.display = 'block';
    }
  });

  // === KOPIOWANIE + WKLEJANIE + MENU WARSTW (TAKIE JAK W GŁÓWNYM SYSTEMIE) ===
  let floatingButtons = null;

  function normalizeForMenu(nodes) {
    if (window.normalizeSelection) return window.normalizeSelection(nodes);
    return nodes || [];
  }

  function showFloatingButtons() {
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

    btnContainer.querySelectorAll('.fab-btn').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const action = btn.dataset.action;

        page.selectedNodes = normalizeForMenu(page.selectedNodes);
        const obj = page.selectedNodes[0];
        if (!obj) return;

        if (action === 'copy') {
          const nodes = normalizeForMenu(page.selectedNodes);
          window.globalClipboard = nodes.map(n => {
            const clone = n.clone({ draggable: true, listening: true });
            clone.getChildren?.().forEach(c => c.listening(true));
            return clone;
          });
          window.globalPasteMode = true;
          pages.forEach(p => p.stage.container().style.cursor = 'copy');
        }

        if (action === 'cut') {
          if (page.selectedNodes.length > 0) {
            window.globalClipboard = page.selectedNodes.map(n => {
              const clone = n.clone({ listening: true, draggable: true });
              clone.getChildren?.().forEach(c => c.listening(true));
              return clone;
            });
            window.globalPasteMode = true;
            page.selectedNodes.forEach(n => n.destroy());
            page.selectedNodes = [];
          } else if (obj) {
            window.globalClipboard = [obj.clone()];
            obj.destroy();
          }
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

        if (action === 'front') {
          obj.moveToTop();
          page.transformer.nodes([obj]);
        }

        if (action === 'back') {
          obj.moveToBottom();
          page.transformer.nodes([obj]);
        }

        if (action === 'removebg') {
          if (!(obj instanceof Konva.Image)) return alert("To nie jest obraz.");
          if (typeof window.removeBackgroundAI !== "function") return alert("Brak funkcji usuwania tła.");

          const oldX = obj.x();
          const oldY = obj.y();
          const oldWidth = obj.width();
          const oldHeight = obj.height();
          const oldScaleX = obj.scaleX();
          const oldScaleY = obj.scaleY();
          const oldRotation = obj.rotation();
          const oldOffsetX = obj.offsetX ? obj.offsetX() : 0;
          const oldOffsetY = obj.offsetY ? obj.offsetY() : 0;
          const oldAttrs = obj.getAttrs ? { ...obj.getAttrs() } : {};

          const originalUrl = obj.toDataURL();
          window.removeBackgroundAI(originalUrl, cleaned => {
            Konva.Image.fromURL(cleaned, newImg => {
              newImg.x(oldX);
              newImg.y(oldY);
              newImg.width(oldWidth);
              newImg.height(oldHeight);
              newImg.scaleX(oldScaleX);
              newImg.scaleY(oldScaleY);
              newImg.rotation(oldRotation);
              if (newImg.offsetX) newImg.offsetX(oldOffsetX);
              if (newImg.offsetY) newImg.offsetY(oldOffsetY);
              newImg.draggable(true);
              newImg.listening(true);
              newImg.setAttrs({
                ...oldAttrs,
                x: oldX,
                y: oldY,
                width: oldWidth,
                height: oldHeight,
                scaleX: oldScaleX,
                scaleY: oldScaleY,
                rotation: oldRotation,
                originalSrc: cleaned,
                originalSrcBeforeRmbg: oldAttrs.originalSrc || originalUrl
              });
              if (typeof window.setupProductImageDrag === "function" && newImg.getAttr && newImg.getAttr("isProductImage")) {
                window.setupProductImageDrag(newImg, layer);
              }
              obj.destroy();
              layer.add(newImg);
              newImg.moveToTop();
              if (page && page.transformer && page.transformer.nodes) page.transformer.nodes([newImg]);
              if (Array.isArray(page.selectedNodes)) page.selectedNodes = [newImg];
              layer.batchDraw();
              transformerLayer.batchDraw();
            });
          });
        }

        if (action === 'barcolor') {
          const barcode = page.selectedNodes[0];
          if (!barcode || !barcode.getAttr("isBarcode"))
            return alert("Zaznacz kod kreskowy!");

          if (!window.showSubmenu) return;

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
              window.recolorBarcode?.(barcode, previewColor, false);
            };
          });
          document.getElementById("colorPicker").oninput = (e) => {
            previewColor = e.target.value;
            window.recolorBarcode?.(barcode, previewColor, false);
          };
          document.getElementById("applyColorBtn").onclick = () => {
            if (!previewColor) return window.hideSubmenu?.();
            window.recolorBarcode?.(barcode, previewColor, true);
            window.hideSubmenu?.();
          };
        }

        layer.batchDraw();
        transformerLayer.batchDraw();
      };
    });
  }

  function hideFloatingButtons() {
    // MENU MA ZNIKAĆ PRZY BRAKU ZAZNACZENIA
    if (floatingButtons) {
      floatingButtons.remove();
      floatingButtons = null;
    }
  }

  // === MULTI-SELECT Z SHIFT + MENU ===
  stage.on('click tap', (e) => {
    const clickedOnEmpty = e.target === stage;
    if (clickedOnEmpty) {
      page.selectedNodes = [];
      page.transformer.nodes([]);
      hideFloatingButtons();
      page.transformerLayer.batchDraw();
      return;
    }

    const node = e.target;
    const isSelectable = node.getClassName() === 'Image' || node.getClassName() === 'Text' || node.getClassName() === 'Rect';

    if (!isSelectable) {
      page.selectedNodes = [];
      page.transformer.nodes([]);
      hideFloatingButtons();
      page.transformerLayer.batchDraw();
      return;
    }

    if (e.evt.shiftKey) {
      if (!page.selectedNodes.includes(node)) {
        page.selectedNodes.push(node);
      }
    } else {
      page.selectedNodes = [node];
    }

    page.transformer.nodes(page.selectedNodes);

    if (page.selectedNodes.length > 0) {
      showFloatingButtons();
    } else {
      hideFloatingButtons();
    }

    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
  });

  // === GLOBALNE WKLEJANIE — identycznie jak w głównym systemie ===
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
      const clone = src.clone({ draggable: true, listening: true });
      clone.x(pointer.x + (src.x() - baseX));
      clone.y(pointer.y + (src.y() - baseY));
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

  // === OBRYSY DLA MULTI-SELECT (CANVA STYLE) ===
function highlightSelection() {
    // Usuń stare obrysy
    page.layer.find('.selectionOutline').forEach(n => n.destroy());

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

// === TRANSFORMSTART — zapis poprzedniego boxa
stage.on('transformstart', () => {
    page.layer.find('.selectionOutline').forEach(n => n.destroy());
    highlightSelection();
    page._oldTransformBox = page.transformer.getClientRect();
});

// === TRANSFORM — SKALOWANIE CANVA STYLE
stage.on('transform', () => {
    const nodes = page.selectedNodes;
    if (nodes.length === 0) return;

    const trBox = page.transformer.getClientRect();
    const oldBox = page._oldTransformBox || trBox;

    const scaleX = trBox.width / oldBox.width;
    const scaleY = trBox.height / oldBox.height;

    nodes.forEach(node => {

        // 1️⃣ TEKST — dynamiczna zmiana fontSize
        if (node instanceof Konva.Text) {
            const newSize = node.fontSize() * Math.max(scaleX, scaleY);
            node.fontSize(Math.max(newSize, 6));
            return;
        }

        // 2️⃣ IMAGE — skala, nigdy width/height
        if (node instanceof Konva.Image) {
            node.scale({
                x: node.scaleX() * scaleX,
                y: node.scaleY() * scaleY
            });
            return;
        }

        // 3️⃣ RECT — normalne rozciąganie
        if (node instanceof Konva.Rect && !node.getAttr("isPageBg")) {
            node.width(node.width() * scaleX);
            node.height(node.height() * scaleY);
            return;
        }
    });

    page._oldTransformBox = trBox;
    page.layer.batchDraw();
});

// === ANCHOR DRAG LIMIT — identycznie jak importdanych.js
tr.anchorDragBoundFunc(function(oldPos, newPos) {
    const anchor = tr.getActiveAnchor();

    // Rogi — pełne skalowanie
    if (
        anchor === 'top-left' ||
        anchor === 'top-right' ||
        anchor === 'bottom-left' ||
        anchor === 'bottom-right'
    ) {
        return newPos;
    }

    // Lewo/prawo — tylko szerokość
    if (anchor === 'middle-left' || anchor === 'middle-right') {
        return { x: newPos.x, y: oldPos.y };
    }

    // Góra/dół — tylko wysokość
    if (anchor === 'top-center' || anchor === 'bottom-center') {
        return { x: oldPos.x, y: newPos.y };
    }

    return newPos;
});



// === OBSŁUGA ŚRODKOWYCH UCHWYTÓW (CROP-STYLE LEFT/RIGHT) ===
tr.on('dragmove', (e) => {
    const anchor = e.target.getAttr('name');
    const node = tr.nodes()[0];
    if (!node) return;

    if (anchor === 'middle-left' || anchor === 'middle-right') {
        const box = node.getClientRect();
        const pointer = node.getStage().getPointerPosition();

        if (anchor === 'middle-left') {
            const newWidth = box.x + box.width - pointer.x;
            if (newWidth > 10) {
                node.width(newWidth);
                node.x(pointer.x);
            }
        }

        if (anchor === 'middle-right') {
            const newWidth = pointer.x - box.x;
            if (newWidth > 10) {
                node.width(newWidth);
            }
        }

        node.getLayer().batchDraw();
    }
});



  // === GLOBALNE WKLEJANIE (CLIPBOARD) ===
  stage.on('click.paste', (e) => {
    if (!window.globalPasteMode) return;

    const clip = window.globalClipboard;
    if (!clip) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // === 1 OBIEKT W CLIPBOARD ===
    if (!Array.isArray(clip)) {
        const clone = clip.clone();
        clone.x(pointer.x);
        clone.y(pointer.y);
        clone.draggable(true);
        clone.listening(true);
        layer.add(clone);
        clone.moveToTop();

        layer.batchDraw();
        transformerLayer.batchDraw();
    }

    // === WIELE OBIEKTÓW W CLIPBOARD (MULTI-COPY / MULTI-CUT) ===
    else {
        const baseX = clip[0].x();
        const baseY = clip[0].y();

        clip.forEach(src => {
            const clone = src.clone({
                draggable: true,
                listening: true
            });

            clone.x(pointer.x + (src.x() - baseX));
            clone.y(pointer.y + (src.y() - baseY));

            layer.add(clone);
            clone.moveToTop();
        });

        layer.batchDraw();
        transformerLayer.batchDraw();
    }

    // WYŁĄCZAMY TRYB WKLEJANIA
    window.globalPasteMode = false;
    window.globalClipboard = null;

    // reset kursora
    pages.forEach(p => p.stage.container().style.cursor = 'default');
});

  // === ESC – WYŁĄCZENIE GLOBALNEGO PASTE MODE ===
  const escHandler = (e) => {
    if (e.key === 'Escape' && window.globalPasteMode) {
      window.globalPasteMode = false;
      window.globalClipboard = null;
      pages.forEach(p => p.stage.container().style.cursor = 'default');
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // 🔼 Przenieś stronę wyżej
div.querySelector(".move-up").onclick = () => {
    const parent = div.parentNode;
    if (div.previousElementSibling) {
        parent.insertBefore(div, div.previousElementSibling);
        reorderPages();
    }
};

// 🔽 Przenieś stronę niżej
div.querySelector(".move-down").onclick = () => {
    const parent = div.parentNode;
    if (div.nextElementSibling) {
        parent.insertBefore(div.nextElementSibling, div);
        reorderPages();
    }
};

// ⧉ Duplikuj stronę
div.querySelector(".duplicate").onclick = () => {
    window.createEmptyPageUnder(page);
};

// ＋ Dodaj stronę pod spodem
div.querySelector(".add").onclick = () => {
    window.createEmptyPageUnder(page);
};

// ⚙️ Ustawienia strony – pełna obsługa
const btnSettings = div.querySelector(".settings");

btnSettings.onclick = (e) => {
    e.stopPropagation();

    if (page.isCover) {
        alert("Edycja okładki jest osobnym modułem.");
        return;
    }

    if (typeof window.openPageEdit === "function") {
        window.openPageEdit(page);
    } else {
        console.error("Brak funkcji openPageEdit!");
    }
};


// 🗑 Usuń stronę
div.querySelector(".delete").onclick = () => {
    if (confirm("Usunąć stronę?")) {
        stage.destroy();
        div.remove();
        pages.splice(pages.indexOf(page), 1);
        reorderPages();
    }
};


  // Przycisk "Dodaj stronę" POD TĄ stroną
  const addBtn = div.querySelector('.add-page-btn');
  addBtn.onclick = () => window.createEmptyPageUnder(page);

  // Wstaw do tablicy pages w dobrej kolejności
  const parentIndex = pages.indexOf(parentPage);
  if (parentIndex > -1) {
    pages.splice(parentIndex + 1, 0, page);
  } else {
    pages.push(page);
  }

  applyZoomToPage(page, currentZoom);
  // 🔥 Powiadom edycja-1.js, że powstał nowy Stage
setTimeout(() => {
    window.dispatchEvent(
        new CustomEvent("canvasCreated", { detail: stage })
    );
}, 50);

  return page;
};

// === DODAJ PRZYCISK POD KAŻDĄ STRONĘ PO IMPORCIE ===
function addAddButtonUnderPage(page) {
  if (page.container.querySelector('.add-page-btn-wrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'add-page-btn-wrapper';
  wrapper.style.cssText = `
    display: flex;
    justify-content: center;
    width: ${W}px;
    margin: 24px auto 160px;
  `;

  wrapper.innerHTML = `<button class="add-page-btn"><span class="add-page-plus">+</span> Dodaj stronę</button>`;
  page.container.appendChild(wrapper);

  wrapper.querySelector('.add-page-btn').onclick = () => window.createEmptyPageUnder(page);
}

// Po imporcie Excela
window.addEventListener('excelImported', () => {
  setTimeout(() => {
    pages.forEach(page => {
      addAddButtonUnderPage(page);
    });
    pageCounter = pages.filter(p => !p.isEmpty && !p.isCover).length;
  }, 100);
});

// === GŁÓWNY PRZYCISK NA DOLE ===
function addMainAddButton() {
  if (document.getElementById('mainAddPageBtn')) return;
  if (pages && pages.length > 0) return;

  const btn = document.createElement('div');
  btn.id = 'mainAddPageBtn';
  btn.style.cssText = `text-align: center; margin: 30px auto; width: ${W}px;`;
  btn.innerHTML = `<button class="add-page-btn"><span class="add-page-plus">+</span> Dodaj stronę</button>`;
  document.getElementById('pagesContainer').after(btn);

  btn.querySelector('.add-page-btn').onclick = () => {
    const lastPage = pages[pages.length - 1];
    window.createEmptyPageUnder(lastPage);
  };
}

document.addEventListener('DOMContentLoaded', addMainAddButton);
window.addEventListener('excelImported', () => {
  const mainBtn = document.getElementById('mainAddPageBtn');
  if (mainBtn) mainBtn.remove();
});

// === OBSERWUJ NOWE STRONY ===
const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.classList && node.classList.contains('page-container')) {
        const page = pages.find(p => p.container === node);
        if (page) {
          addAddButtonUnderPage(page);
        }
      }
    });
  });
});
observer.observe(document.getElementById('pagesContainer'), { childList: true });

// === STYL PRZYCISKU ===
const addPageBtnStyle = document.createElement('style');
addPageBtnStyle.textContent = `
  .add-page-btn {
    background: #f8fafc;
    color: #111827;
    border: 2px solid #d1d5db;
    padding: 12px 64px 12px 48px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
    position: relative;
    width: 100%;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .add-page-btn .add-page-plus {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
  }
  .add-page-btn::before {
    content: "";
    position: absolute;
    right: 46px;
    top: 8px;
    bottom: 8px;
    width: 1px;
    background: #d1d5db;
  }
  .add-page-btn::after {
    content: "▾";
    position: absolute;
    right: 16px;
    font-size: 16px;
    color: #6b7280;
  }
  .add-page-btn:hover {
    background: #ffffff;
    border-color: #cbd5e1;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.18);
  }
`;
document.head.appendChild(addPageBtnStyle);
// 🔥 FIX widoczności przycisku „+ Dodaj stronę” po zwiększeniu marginesów
const styleFix = document.createElement("style");
styleFix.textContent = `
  .add-page-btn-wrapper {
      margin-top: 24px !important;
      margin-bottom: 160px !important;
      margin-left: auto !important;
      margin-right: auto !important;
      display: flex !important;
      justify-content: center !important;
      width: ${W}px !important;
  }
`;
document.head.appendChild(styleFix);
const tooltipCSS = document.createElement("style");


tooltipCSS.textContent = `
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
document.head.appendChild(tooltipCSS);
window.reorderPages = function () {
    pages = [...document.querySelectorAll(".page-container")]
        .map(container => pages.find(p => p.container === container))
        .filter(Boolean);

    pages.forEach((p, i) => {
        p.number = i + 1;
        p.container.querySelector(".page-title").textContent = "Page " + (i + 1);
    });
};
