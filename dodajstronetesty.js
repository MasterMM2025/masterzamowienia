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
    <h3>Pusta strona ${n}
      <button class="edit-page-btn" style="margin-left: 10px; padding: 4px 8px; font-size: 12px;">Edytuj stronę</button>
      <button class="delete-page-btn" style="margin-left: 5px; padding: 4px 8px; font-size: 12px; background: #e53e3e; color: white; border: none; border-radius: 4px;">Usuń</button>
    </h3>
    <div class="canvas-wrapper"><div id="c-empty-${n}" style="width:${W}px;height:${H}px;background:#fff;"></div><div class="grid-overlay" id="g-empty-${n}"></div></div>
    <div class="add-page-btn-wrapper" style="text-align: center; margin: 12px 0;">
      <button class="add-page-btn">+ Dodaj stronę</button>
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

  // === KOPIOWANIE + WKLEJANIE + MENU WARSTW ===
  let floatingButtons = null;

  function showFloatingButtons(obj) {
    if (floatingButtons) floatingButtons.remove();

    const btnContainer = document.createElement('div');
    btnContainer.id = 'floatingMenu';
    btnContainer.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 10000;
      display: flex; gap: 8px; background: #fff; padding: 10px;
      border-radius: 12px; box-shadow: 0 6px 16px rgba(0,0,0,0.25);
      border: 1px solid #ccc; pointer-events: auto; font-size: 14px; font-weight: 500;
    `;

    btnContainer.innerHTML = `
      <button class="fab-btn fab-copy" data-action="copy">Kopiuj</button>
      <button class="fab-btn fab-delete" data-action="delete">Usuń</button>
      <button class="fab-btn fab-front" data-action="front">Na wierzch</button>
      <button class="fab-btn fab-back" data-action="back">Na spód</button>
    `;

    document.body.appendChild(btnContainer);
    floatingButtons = btnContainer;

    btnContainer.querySelectorAll('.fab-btn').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const action = btn.dataset.action;

        if (action === 'copy') {
          window.globalClipboard = obj.clone();
          window.globalPasteMode = true;
          hideFloatingButtons();
          pages.forEach(p => p.stage.container().style.cursor = 'copy');
        }

        if (action === 'delete') {
          obj.destroy();
          layer.batchDraw();
          transformerLayer.batchDraw();
          hideFloatingButtons();
        }

        if (action === 'front') {
          obj.moveToTop();
          layer.batchDraw();
        }

        if (action === 'back') {
          obj.moveToBottom();
          layer.batchDraw();
        }

        if (action === 'forward') {
          obj.moveUp();
          layer.batchDraw();
        }

        if (action === 'backward') {
          obj.moveDown();
          layer.batchDraw();
        }
      };
    });
  }

  function hideFloatingButtons() {
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

    if (page.selectedNodes.length === 1) {
      showFloatingButtons(node);
    } else {
      hideFloatingButtons();
    }

    page.layer.batchDraw();
    page.transformerLayer.batchDraw();
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

  // Edytuj stronę
  const editBtn = div.querySelector('.edit-page-btn');
  editBtn.onclick = () => {
    if (page.isCover) {
      alert("Edycja okładki jest osobnym modułem.");
      return;
    }
    if (typeof window.openPageEdit === 'function') {
      window.openPageEdit(page);
    }
  };

  // Usuń stronę
  const deleteBtn = div.querySelector('.delete-page-btn');
  deleteBtn.onclick = () => {
    if (confirm('Czy na pewno usunąć tę pustą stronę?')) {
      stage.destroy();
      div.remove();
      const idx = pages.indexOf(page);
      if (idx > -1) pages.splice(idx, 1);
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
  wrapper.style.cssText = 'text-align: center; margin: 12px 0;';
  wrapper.innerHTML = `<button class="add-page-btn">+ Dodaj stronę</button>`;
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

  const btn = document.createElement('div');
  btn.id = 'mainAddPageBtn';
  btn.style.cssText = 'text-align: center; margin: 30px 0;';
  btn.innerHTML = `<button class="add-page-btn" style="font-size: 16px; padding: 12px 24px;">+ Dodaj pustą stronę na końcu</button>`;
  document.getElementById('pagesContainer').after(btn);

  btn.querySelector('.add-page-btn').onclick = () => {
    const lastPage = pages[pages.length - 1];
    window.createEmptyPageUnder(lastPage);
  };
}

document.addEventListener('DOMContentLoaded', addMainAddButton);
window.addEventListener('excelImported', addMainAddButton);

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
    background: #007cba;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  .add-page-btn:hover {
    background: #005a87;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  }
`;
document.head.appendChild(addPageBtnStyle);