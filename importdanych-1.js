// ========================================================================
// importdanych-1.js – OSTATECZNA, PIĘKNA WERSJA 2025 – JAK CANVA
// Ikony wyrównania z SVG, zero błędów, działa idealnie!
// ========================================================================

Konva.listenClickTap = true;
let currentFolder = "PHOTO PNG/BANNERS";
// ⭐⭐⭐ DODAJ TO TUTAJ ⭐⭐⭐
function markAsEditable(node) {
    node.setAttr("isEditable", true);
    node.setAttr("isDesignElement", true);
    node.setAttr("isSelectable", true);
    node.setAttr("isDraggable", true);

    node.draggable(true);
    node.listening(true);
}

let loadSessionId = 0;
let addTextMode = false;
let addImageMode = false;
let addPSDMode = false;


// ====================== SIDEBAR – PRZYCISKI ======================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {

      const title = item.getAttribute('title');

      if (title === 'Import PSD') enableAddPSDMode();

      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      if (title === 'Dodaj tekst') enableAddTextMode();
      if (title === 'Dodaj zdjęcia') enableAddImageMode();
      // 🔥 🔥 🔥 DODAJ TO:
      if (title === 'BANNERS') {
          currentFolder = "PHOTO PNG/BANNERS";
          openElementsPanel();
          loadFirebaseFolder(currentFolder);
      }
      if (title === 'FOOD') {
          currentFolder = "PHOTO PNG/FOOD";
          openElementsPanel();
          loadFirebaseFolder(currentFolder);
      }
      if (title === 'COUNTRY') {
    currentFolder = "PHOTO PNG/COUNTRY";
    openElementsPanel();
    loadFirebaseFolder(currentFolder);
}


    });
  });
});



function isWithinPageArea(x, y) {
  return x >= 0 && x <= 794 && y >= 0 && y <= 1123;
}

// ====================== DODAJ TEKST Z SIDEBARU ======================
function enableAddTextMode() {
  if (addTextMode || addImageMode) return;
  addTextMode = true;
  pages.forEach(page => {
    const c = page.stage.container();
    c.style.outline = '2px solid #00c4b4';
    c.style.outlineOffset = '2px';
    c.style.cursor = 'text';
    const handler = e => {
      if (!addTextMode || e.evt.button !== 0) return;
      const pos = page.stage.getPointerPosition();
      if (pos && isWithinPageArea(pos.x, pos.y)) {
        addTextAtPosition(page, pos.x, pos.y);
      }
      addTextMode = false;
      disableAddTextMode();
    };
    page.stage.on('mousedown.textmode', handler);
    page._textHandler = handler;
  });
}

function disableAddTextMode() {
  pages.forEach(page => {
    const c = page.stage.container();
    c.style.outline = c.style.outlineOffset = '';
    c.style.cursor = 'default';
    if (page._textHandler) {
      page.stage.off('mousedown.textmode', page._textHandler);
      page._textHandler = null;
    }
  });
}

function addTextAtPosition(page, x, y) {
  const text = new Konva.Text({
    text: "Kliknij, aby edytować",
    x: x - 110, y: y - 20, width: 220, fontSize: 18,
    fill: "#000000", fontFamily: "Arial", align: "center",
    verticalAlign: "middle", draggable: true, isSidebarText: true,
    _originalText: "Kliknij, aby edytować"
  });
  page.layer.add(text);
  page.layer.batchDraw();
  text.on('dblclick', (e) => {
  e.cancelBubble = true; // zatrzymuje propagację
  openTextEditor(text);
});


}

// ====================== DODAJ ZDJĘCIE ======================
function enableAddImageMode() {
  if (addTextMode || addImageMode) return;
  addImageMode = true;
  const img = new Image();
  img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMGM0YjQiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ii8+PHBhdGggZD0iTTE3IDEzaC0xLjVMMTAuMjUgNy43NWEuNzUuNzUgMCAwIDAtMS4wNiAwTDQgMTMiLz48L3N2Zz4=';
  img.onload = () => {
    const cursor = `url(${img.src}) 12 12, crosshair`;
    pages.forEach(page => {
      const c = page.stage.container();
      c.style.outline = '2px solid #00c4b4';
      c.style.outlineOffset = '2px';
      c.style.cursor = cursor;
      const handler = e => {
        if (!addImageMode || e.evt.button !== 0) return;
        const pos = page.stage.getPointerPosition();
        if (pos && isWithinPageArea(pos.x, pos.y)) openImagePickerAtPosition(page, pos.x, pos.y);
        addImageMode = false;
        disableAddImageMode();
      };
      page.stage.on('mousedown.imagemode', handler);
      page._imageHandler = handler;
    });
  };
}

function disableAddImageMode() {
  pages.forEach(page => {
    const c = page.stage.container();
    c.style.outline = c.style.outlineOffset = '';
    c.style.cursor = 'default';
    if (page._imageHandler) {
      page.stage.off('mousedown.imagemode', page._imageHandler);
      page._imageHandler = null;
    }
  });
}

function openImagePickerAtPosition(page, x, y) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      Konva.Image.fromURL(ev.target.result, img => {
  const s = Math.min(180 / img.width(), 180 / img.height(), 1);

  img.setAttrs({
    x: x - img.width() * s / 2,
    y: y - img.height() * s / 2,
    scaleX: s,
    scaleY: s,
    draggable: true,
    listening: true,

    // 🔥 KLUCZOWE FLAGI – dzięki nim obraz ZAWSZE będzie edytowalny
    isSidebarImage: true,
    isDesignElement: true,
    isEditable: true,
    isSelectable: true,
    isDraggable: true,
    name: "design-image"
});


  page.layer.add(img);
  page.layer.batchDraw();
});

    };
    reader.readAsDataURL(file);
  };
  input.click();
}
function enableAddPSDMode() {
  if (addPSDMode || addTextMode || addImageMode) return;
  addPSDMode = true;

  const cursor = "copy";

  pages.forEach(page => {
    const c = page.stage.container();
    c.style.outline = '2px solid #00c4b4';
    c.style.outlineOffset = '2px';
    c.style.cursor = cursor;

    const handler = e => {
      if (!addPSDMode || e.evt.button !== 0) return;

      const pos = page.stage.getPointerPosition();
      if (pos && isWithinPageArea(pos.x, pos.y)) {
        openPSDPickerAtPosition(page, pos.x, pos.y);
      }

      addPSDMode = false;
      disableAddPSDMode();
    };

    page.stage.on('mousedown.psdmode', handler);
    page._psdHandler = handler;
  });
}
function openPSDPickerAtPosition(page, x, y) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.psd';

  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    const psd = await PSD.fromURL(URL.createObjectURL(file));

    psd.parse();
    const layers = psd.tree().descendants();

    layers.forEach(layer => {
      if (layer.isGroup() || !layer.layer.visible) return;

      const png = layer.toPng();
      if (!png) return;

      const img = new Image();
      img.src = png.src;

      img.onload = () => {
        Konva.Image.fromURL(img.src, (node) => {
          node.x(x);
          node.y(y);
          node.draggable(true);
          node.setAttrs({
            isProductImage: true,
            isPSDLayer: true
          });

          page.layer.add(node);
          page.layer.batchDraw();
        });
      };
    });

    alert("Zaimportowano warstwy PSD 🎉");
  };

  input.click();
}

function disableAddPSDMode() {
  pages.forEach(page => {
    const c = page.stage.container();
    c.style.outline = c.style.outlineOffset = '';
    c.style.cursor = 'default';

    if (page._psdHandler) {
      page.stage.off('mousedown.psdmode', page._psdHandler);
      page._psdHandler = null;
    }
  });
}

// ====================== PIĘKNY PANEL Z IKONAMI JAK W CANVA ======================
const panel = document.createElement("div");
panel.id = "textEditorPanel";
panel.style.cssText = `
  position:fixed;right:20px;top:80px;width:340px;padding:22px;background:#fff;
  border-radius:20px;box-shadow:0 15px 50px rgba(0,0,0,0.22);display:none;z-index:99999;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  border:1px solid #e0e0e0;background:#fff;
`;
panel.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
    <h3 style="margin:0;color:#00c4b4;font-size:21px;font-weight:600;">Edytuj tekst</h3>
    <button id="teClose" style="background:none;border:none;font-size:26px;cursor:pointer;color:#999;">×</button>
  </div>

  <textarea id="teContent" placeholder="Wpisz tekst..." style="width:100%;height:110px;padding:14px;border:1px solid #ddd;border-radius:14px;
    font-size:16px;resize:none;background:#fff;box-shadow:inset 0 2px 8px rgba(0,0,0,0.06);margin-bottom:18px;"></textarea>

  <div style="margin-bottom:18px;">
    <label style="display:block;margin-bottom:8px;font-weight:600;color:#333;font-size:14px;">Czcionka</label>
    <select id="teFont" style="width:100%;padding:12px;border-radius:12px;border:1px solid #ddd;background:#fff;font-size:15px;">
      <option value="Arial">Arial</option>
      <option value="Helvetica">Helvetica</option>
      <option value="Georgia">Georgia</option>
      <option value="Times New Roman">Times New Roman</option>
      <option value="Courier New">Courier New</option>
      <option value="Verdana">Verdana</option>
      <option value="Trebuchet MS">Trebuchet MS</option>
      <option value="Impact">Impact</option>
      <option value="Comic Sans MS">Comic Sans MS</option>
    </select>
  </div>

  <div style="display:flex;gap:14px;margin-bottom:20px;">
    <div style="flex:1;">
      <label style="display:block;margin-bottom:8px;font-weight:600;color:#333;font-size:14px;">Kolor</label>
      <input type="color" id="teColor" value="#000000" style="width:100%;height:50px;border-radius:12px;border:none;cursor:pointer;">
    </div>
    <div style="width:100px;">
      <label style="display:block;margin-bottom:8px;font-weight:600;color:#333;font-size:14px;">Rozmiar</label>
      <input type="number" id="teSize" value="18" min="8" max="200" style="width:100%;padding:10px;border-radius:12px;border:1px solid #ddd;text-align:center;font-size:15px;">
    </div>
  </div>

  <div style="margin:24px 0;">
    <label style="display:block;margin-bottom:14px;font-weight:600;color:#333;font-size:15px;">Wyrównanie</label>
    <div style="display:flex;gap:16px;justify-content:center;">
      <button id="teAlignLeft"   class="icon-btn" data-align="left">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
      </button>
      <button id="teAlignCenter" class="icon-btn active" data-align="center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
      </button>
      <button id="teAlignRight"  class="icon-btn" data-align="right">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
  </div>

  <div style="margin:24px 0;">
    <label style="display:block;margin-bottom:14px;font-weight:600;color:#333;font-size:15px;">Styl tekstu</label>
    <div style="display:flex;gap:16px;justify-content:center;">
      <button id="teBold"      class="icon-btn">B</button>
      <button id="teItalic"    class="icon-btn">I</button>
      <button id="teUnderline" class="icon-btn">U</button>
      <button id="teUppercase" class="icon-btn">A→A</button>
    </div>
  </div>

  <div style="display:flex;gap:14px;">
    <button id="teApply" style="flex:1;background:#00c4b4;color:white;padding:14px;border:none;border-radius:14px;font-weight:600;font-size:16px;cursor:pointer;box-shadow:0 6px 18px rgba(0,196,180,0.3);">Zastosuj</button>
    <button id="teCancel" style="flex:1;background:#ff4757;color:white;padding:14px;border:none;border-radius:14px;font-weight:600;font-size:16px;cursor:pointer;">Anuluj</button>
  </div>
`;
document.body.appendChild(panel);

// STYLE – TYLKO RAZ!
const customStyle = document.createElement('style');
customStyle.textContent = `
  .icon-btn {
    width: 58px;
    height: 58px;
    border-radius: 16px;
    border: none;
    background: #f8f9fa;
    color: #333;
    font-size: 20px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.25s;
    box-shadow: 0 4px 14px rgba(0,0,0,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn:hover { background:#e9ecef; transform: translateY(-2px); }
  .icon-btn:active { transform: translateY(1px); }
  .icon-btn.active {
    background: #00c4b4 !important;
    color: white !important;
    box-shadow: 0 8px 25px rgba(0,196,180,0.5);
  }
  .icon-btn svg { pointer-events: none; }
`;

document.head.appendChild(customStyle);

let currentNode = null;
let backupAttrs = null;

function openTextEditor(node) {
  currentNode = node;
  backupAttrs = { ...node.attrs };
  if (!node._originalText) node._originalText = node.text();

  panel.style.display = "block";

  document.getElementById("teContent").value = node._originalText || node.text();
  document.getElementById("teFont").value = node.fontFamily() || "Arial";
  document.getElementById("teColor").value = node.fill() || "#000000";
  document.getElementById("teSize").value = node.fontSize() || 18;

  // Aktualizacja przycisków
  const s = node.fontStyle() || "";
  const d = node.textDecoration() || "";
  const upper = node.text() === node.text().toUpperCase() && node.text() !== "";
  const align = node.align() || "center";

  document.getElementById("teBold").classList.toggle("active", s.includes("bold"));
  document.getElementById("teItalic").classList.toggle("active", s.includes("italic"));
  document.getElementById("teUnderline").classList.toggle("active", d.includes("underline"));
  document.getElementById("teUppercase").classList.toggle("active", upper);

  document.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('active'));
  document.getElementById("teAlign" + align.charAt(0).toUpperCase() + align.slice(1)).classList.add('active');
}

// Żywe podglądy
document.getElementById("teContent").oninput = e => {
  if (!currentNode) return;
  currentNode._originalText = e.target.value;
  const txt = document.getElementById("teUppercase").classList.contains("active")
    ? e.target.value.toUpperCase()
    : e.target.value;
  currentNode.text(txt);
  currentNode.getLayer().batchDraw();
};
document.getElementById("teFont").onchange = e => currentNode?.fontFamily(e.target.value) && currentNode.getLayer().batchDraw();
document.getElementById("teColor").oninput = e => currentNode?.fill(e.target.value) && currentNode.getLayer().batchDraw();
document.getElementById("teSize").oninput = e => currentNode?.fontSize(+e.target.value) && currentNode.getLayer().batchDraw();

// Przyciski stylu + wyrównanie + uppercase
["teBold","teItalic","teUnderline","teUppercase"].forEach(id => {
  document.getElementById(id).onclick = () => {
    if (!currentNode) return;
    if (id === "teUppercase") {
      const ta = document.getElementById("teContent");
      const active = !document.getElementById(id).classList.contains("active");
      document.getElementById(id).classList.toggle("active");
      currentNode.text(active ? ta.value.toUpperCase() : (currentNode._originalText || ""));
    } else {
      const prop = id === "teBold" ? "fontStyle" : id === "teItalic" ? "fontStyle" : "textDecoration";
      const val = id === "teBold" ? "bold" : id === "teItalic" ? "italic" : "underline";
      const cur = currentNode[prop]() || "";
      const newVal = cur.includes(val) ? cur.replace(val,"").trim() : (cur + " " + val).trim();
      currentNode[prop](newVal);
      document.getElementById(id).classList.toggle("active");
    }
    currentNode.getLayer().batchDraw();
  };
});

// Wyrównanie – ikony SVG
document.querySelectorAll('[id^="teAlign"]').forEach(btn => {
  btn.onclick = () => {
    if (!currentNode) return;
    const align = btn.dataset.align;
    currentNode.align(align);
    document.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentNode.getLayer().batchDraw();
  };
});

// OK / Anuluj / Zamknij
document.getElementById("teClose").onclick = 
document.getElementById("teCancel").onclick = () => {
  if (currentNode && backupAttrs) {
    currentNode.setAttrs(backupAttrs);
    currentNode.getLayer().batchDraw();
  }
  panel.style.display = "none";
  currentNode = null;
};

document.getElementById("teApply").onclick = () => {
  if (currentNode) currentNode._originalText = document.getElementById("teContent").value;
  panel.style.display = "none";
  currentNode = null;
};
// ========================================================================
// PANEL ELEMENTÓW – JAK W CANVA
// ========================================================================

const elementsPanel = document.createElement('div');
elementsPanel.id = "elementsPanel";
elementsPanel.style.cssText = `
transition: left 0.25s ease;
  position: fixed;
  left: 90px;
  top: 60px;
  width: 320px;
  height: calc(100vh - 80px);
  background: #fff;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
  overflow-y: auto;
  display: none;
  z-index: 99999;
  padding: 20px;
  font-family: 'Inter', sans-serif;
`;

elementsPanel.innerHTML = `
  <h3 style="font-size:18px;color:#00c4b4;font-weight:600;margin-bottom:12px;">Elementy</h3>

  <input type="text" id="searchElements" placeholder="Wyszukaj elementy"
    style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid #ddd;font-size:15px;margin-bottom:15px;">

  <!-- 🔥 ZAKŁADKI -->
  <div id="elementsTabs" style="display:flex; gap:10px; margin-bottom:12px;">
    <button class="tabBtn active" data-folder="PHOTO PNG/BANNERS">BANNERS-PNG</button>
<button class="tabBtn" data-folder="PHOTO PNG/FOOD">FOOD-PNG</button>
<button class="tabBtn" data-folder="PHOTO PNG/COUNTRY">COUNTRY-PNG</button>

  </div>

  <!-- KONTENER NA ELEMENTY -->
  <div id="elementsContainer" 
    style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;"></div>
`;
const btnStyle = document.createElement("style");
btnStyle.textContent = `
  .tabBtn {
    flex: 1;
    padding: 6px 8px;        /* MNIEJSZE WEWNĘTRZNE ODSUNIECIE */
    background: #f2f2f2;
    border: none;
    border-radius: 8px;      /* MNIEJSZE ZAOKRĄGLENIE */
    font-size: 13px;         /* MNIEJSZA CZCIONKA */
    font-weight: 600;
    cursor: pointer;
    transition: 0.25s ease;
    height: 32px;            /* MNIEJSZA WYSOKOŚĆ CAŁKOWITA */
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tabBtn:hover {
    background: #e6e6e6;
  }

  .tabBtn.active {
    background: #00c4b4;
    color: white;
    box-shadow: 0 3px 10px rgba(0,196,180,0.35);
    transform: translateY(-1px);
  }
`;

document.head.appendChild(btnStyle);


document.body.appendChild(elementsPanel);
// OBSŁUGA ZAKŁADEK
document.querySelectorAll('.tabBtn').forEach(btn => {
  btn.addEventListener('click', () => {

    document.querySelectorAll('.tabBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentFolder = btn.dataset.folder;   // 🔥 zapamiętaj wybraną zakładkę

    loadFirebaseFolder(currentFolder);     // 🔥 wczytaj odpowiedni folder
  });
});

const toggleBtn = document.createElement('button');
toggleBtn.id = 'toggleElementsPanel';
toggleBtn.innerHTML = '⟨';
toggleBtn.style.cssText = `
  position: fixed;
  left: 400px;
  top: 50%;
  transform: translateY(-50%);
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 0 10px 10px 0;
  width: 34px;
  height: 70px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,0.1);
  z-index: 100000;
  transition: all 0.25s ease;
  font-size: 18px;
  color: #333;
  display: flex;
  align-items: center;
  justify-content: center;
`;
document.body.appendChild(toggleBtn)
toggleBtn.style.display = 'none';
function openElementsPanel() {
  const panel = document.getElementById('elementsPanel');

  panel.style.display = "block";
  elementsPanel.style.left = "90px"; // wysuwa panel
  toggleBtn.style.display = "flex";
  toggleBtn.style.left = "400px";
  toggleBtn.innerHTML = "⟨";

  panelVisible = true;
}
// === 🔥 Funkcja otwierająca panel elementów z czyszczeniem zawartości ===
function showElementsPanel() {
    const panel = document.getElementById('elementsPanel');
    const container = document.getElementById('elementsContainer');

    // usuń stare miniatury zanim zaczniesz ładować nowe
    container.innerHTML = "";

    panel.style.display = "block";
    elementsPanel.style.left = "90px";

    toggleBtn.style.display = "flex";
    toggleBtn.style.left = "400px";
    toggleBtn.innerHTML = "⟨";

    panelVisible = true;
}



let panelVisible = false;
elementsPanel.style.left = '-320px';
toggleBtn.style.left = '0px';
toggleBtn.innerHTML = '⟩';

toggleBtn.addEventListener('click', () => {
  // 🔹 Przełącz widoczność panelu
  panelVisible = !panelVisible;

  if (panelVisible) {
    // === POKAŻ PANEL ===
    elementsPanel.style.left = '90px';
    toggleBtn.style.left = '400px';
    toggleBtn.innerHTML = '⟨';
  } else {
    // === SCHOWAJ PANEL ===
    elementsPanel.style.left = '-320px';
    toggleBtn.style.left = '0px';
    toggleBtn.innerHTML = '⟩';
    
    // 🔥 Po krótkiej animacji (0.3s) ukryj przycisk całkowicie
    setTimeout(() => {
      toggleBtn.style.display = 'none';
    }, 300);
  }
});

const { getStorage, ref, listAll, getDownloadURL } = window.firebaseStorageExports || await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js");
const storage = getStorage(undefined, "gs://pdf-creator-f7a8b.firebasestorage.app");



const addElementBtn = document.getElementById('addElementBtn');
addElementBtn.addEventListener('click', async () => {
  const panel = document.getElementById('elementsPanel');
  
  // Przełącz widoczność panelu
  const nowVisible = panel.style.display !== 'block';
  panel.style.display = nowVisible ? 'block' : 'none';

  if (nowVisible) {
    // Pokaż przycisk schowania gdy panel się pojawia
    toggleBtn.style.display = 'flex';
    panelVisible = true;
    elementsPanel.style.left = '90px';
    toggleBtn.style.left = '400px';
    toggleBtn.innerHTML = '⟨';
    await loadFirebaseFolder(currentFolder);
  } else {
    // Schowaj panel i przycisk
    toggleBtn.style.display = 'none';
    elementsPanel.style.left = '-320px';
  }
});


async function loadFirebaseFolder(folderPath) {
  const container = document.getElementById('elementsContainer');

  // ⭐ NOWA SESJA ŁADOWANIA
  const mySession = ++loadSessionId;

  container.innerHTML = "";
  container.innerHTML = '<p style="color:#777;font-size:14px;">Wczytywanie...</p>';

  const folderRef = ref(storage, folderPath);
  const result = await listAll(folderRef);

  // Jeśli w międzyczasie kliknięto inny folder → ANULUJ
  if (mySession !== loadSessionId) return;

  container.innerHTML = "";

  const lazyObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const img = entry.target;

      // Sesja przerwana? Nie ładuj dalej.
      if (mySession !== loadSessionId) {
        lazyObserver.unobserve(img);
        return;
      }

      if (entry.isIntersecting && !img.src) {
        img.src = img.dataset.src;
        lazyObserver.unobserve(img);
      }
    });
  });

  for (const item of result.items) {

    // Jeśli w międzyczasie kliknięto inny folder → zatrzymaj pętlę
    if (mySession !== loadSessionId) return;

    const url = await getDownloadURL(item);

    // Jeszcze raz sprawdzamy sesję (bardzo ważne)
    if (mySession !== loadSessionId) return;

    const img = document.createElement('img');
    img.dataset.src = url;
    img.style.cssText = `
      width:100%;
      height:80px;
      object-fit:contain;
      border-radius:10px;
      cursor:pointer;
      transition:0.2s;
      border:2px solid transparent;
      background:#fff;
    `;
// === DRAG AND DROP – PRZYWRÓCONE ===
img.draggable = true;
img.addEventListener('dragstart', e => {
    if (mySession !== loadSessionId) return; // zabezpieczenie
    e.dataTransfer.setData('image-url', url);
});

    img.addEventListener('click', () => {
      if (mySession !== loadSessionId) return; // zabezpieczenie
      document.querySelectorAll('#elementsContainer img')
        .forEach(i => i.style.border = '2px solid transparent');

      img.style.border = '2px solid #00c4b4';
      document.body.style.cursor = 'crosshair';
      enablePageClickForImage(url);
    });

    container.appendChild(img);
    lazyObserver.observe(img);
  }
}



// ====== 4️⃣ Kliknij na stronę po wybraniu obrazka ======
function enablePageClickForImage(url) {
  pages.forEach(page => {
    const c = page.stage.container();

    const handler = e => {
      const pos = page.stage.getPointerPosition();
      if (!pos) return;

      Konva.Image.fromURL(url, kImg => {
  const maxWidth = 300;
  const scale = Math.min(maxWidth / kImg.width(), 1);

  kImg.setAttrs({
    x: pos.x - (kImg.width() * scale) / 2,
    y: pos.y - (kImg.height() * scale) / 2,
    scaleX: scale,
    scaleY: scale,
  });

  kImg.setAttrs({
    isDesignElement: true,
    isEditable: true,
    isSelectable: true,
    isDraggable: true,
    name: "design-image"
});
markAsEditable(kImg);


  page.layer.add(kImg);
  page.layer.batchDraw();
});



      // reset po kliknięciu
      document.body.style.cursor = 'default';
      document.querySelectorAll('#elementsContainer img').forEach(i => i.style.border = '2px solid transparent');
      pages.forEach(pg => pg.stage.off('mousedown.addimage'));
    };

    // aktywuj tryb kliknięcia
    page.stage.on('mousedown.addimage', handler);
  });
}

// =========================================================
// GLOBALNY DRAG & DROP – DZIAŁAJĄCY ZAWSZE (jak Canva)
// =========================================================

// przeciąganie musi być dozwolone globalnie
document.addEventListener("dragover", e => e.preventDefault());

document.addEventListener("drop", e => {
    e.preventDefault();

    const url = e.dataTransfer.getData("image-url");
    if (!url) return;

    // Sprawdź, na którą stronę upuszczono
    pages.forEach(page => {
        const container = page.stage.container();
        const rect = container.getBoundingClientRect();

        if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
        ) {
            // Upuszczono NA TĘ STRONĘ
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            Konva.Image.fromURL(url, kImg => {
                const maxWidth = 300;
                const scale = Math.min(maxWidth / kImg.width(), 1);

                kImg.setAttrs({
    x: x - (kImg.width() * scale) / 2,
    y: y - (kImg.height() * scale) / 2,
    scaleX: scale,
    scaleY: scale,
});

kImg.setAttrs({
    isDesignElement: true,
    isEditable: true,
    isSelectable: true,
    isDraggable: true,
    name: "design-image"
});
markAsEditable(kImg);



                page.layer.add(kImg);
                page.layer.batchDraw();
            });
        }
    });
});

console.log("importdanych-1.js – GOTOWY! Ikony jak w Canva, zero błędów, pięknie!");