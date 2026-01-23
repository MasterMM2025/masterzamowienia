// edycja.js – PEŁNY EDYTOR + WALUTA + EDYCJA KAŻDEGO TEKSTU Z isEditable

let editPanel = null;
let currentText = null;
let currentStage = null;
let currentLayer = null;
let pageEditPanel = null;
let currentPage = null;


// === DOMYŚLNE STYLE DLA KAŻDEGO TYPU ===
const DEFAULT_STYLES = {
  nameStyle: { size: 12, fontFamily: 'Arial', color: '#000000', bold: false, italic: false, underline: false },
  indexStyle: { size: 14, fontFamily: 'Arial', color: '#000000', bold: false, italic: false, underline: false },
  priceStyle: { size: 24, fontFamily: 'Arial', color: '#000000', bold: false, italic: false, underline: false },
  ratingStyle: { size: 12, fontFamily: 'Arial', color: '#000000', bold: false, italic: false, underline: false },

};


function computeStyle(style) {
  if (style.bold) return 'bold';
  if (style.italic) return 'italic';
  return 'normal';
}

// === TWORZENIE PANELU EDYCJI TEKSTU (ROZBUDOWANY) ===
function createEditPanel() {
  if (editPanel) {
    editPanel.style.display = 'block';
    return editPanel;
  }

  editPanel = document.createElement('div');
  editPanel.style.cssText = `
    position: fixed; top: 20px; right: 20px; width: 360px; background: white;
    padding: 16px; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.18);
    z-index: 10000; font-family: Arial; border: 1px solid #ddd; max-height: 80vh; overflow-y: auto;
  `;

  editPanel.innerHTML = `
    <h3 style="margin:0 0 12px; font-size:16px;">Edycja tekstu</h3>
    
    <label style="display:block; margin-bottom:8px;">
      Treść: <br>
      <textarea id="textInput" style="width:100%; height:80px; margin-top:4px; resize:vertical; font-family:Arial;"></textarea>
    </label>
    
    <label style="display:block; margin-bottom:8px;">
      Czcionka:
      <select id="fontSelect" style="width:100%; padding:4px; margin-top:4px;">
        <option value="Arial">Arial</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Courier New">Courier New</option>
        <option value="Verdana">Verdana</option>
        <option value="Georgia">Georgia</option>
        <option value="Comic Sans MS">Comic Sans MS</option>
        <option value="Impact">Impact</option>
        <option value="Trebuchet MS">Trebuchet MS</option>
      </select>
    </label>
    
    <label style="display:block; margin-bottom:8px;">
      Rozmiar:
      <input type="number" id="sizeInput" min="8" max="72" value="18" style="width:100%; padding:4px;">
    </label>
    
    <label style="display:block; margin-bottom:8px;">
      Kolor: <input type="color" id="colorInput" value="#000000" style="width:100%; height:36px;">
    </label>
    
    <div style="margin-bottom:12px;">
      <label style="display:inline-block; margin-right:12px;">
        <input type="checkbox" id="boldInput"> Pogrubienie
      </label>
      <label style="display:inline-block; margin-right:12px;">
        <input type="checkbox" id="italicInput"> Kursywa
      </label>
      <label style="display:inline-block;">
        <input type="checkbox" id="underlineInput"> Podkreślenie
      </label>
    </div>
    
    <label style="display:block; margin-bottom:8px;">
      Wyrównanie:
      <select id="alignSelect" style="width:100%; padding:4px; margin-top:4px;">
        <option value="left">Do lewej</option>
        <option value="center">Wyśrodkowane</option>
        <option value="right">Do prawej</option>
      </select>
    </label>
    
    <label style="display:block; margin-bottom:8px;">
      Odstęp między liniami:
      <input type="number" id="lineHeightInput" min="0.5" max="3" step="0.1" value="1.2" style="width:100%; padding:4px;">
    </label>

    <label style="display:block; margin-bottom:8px;">
      Odstęp między literami:
      <input type="number" id="letterSpacingInput" min="-10" max="50" step="1" value="0" style="width:100%; padding:4px;">
    </label>

    <div style="border-top: 1px solid #eee; padding-top: 12px; margin-bottom: 12px;">
      <h4 style="margin:0 0 8px; font-size:14px;">Cień tekstu</h4>
      <label><input type="checkbox" id="shadowEnabled"> Włącz</label>
      <label>Kolor: <input type="color" id="shadowColor" value="#000000"></label>
      <label>Rozmycie: <input type="number" id="shadowBlur" min="0" max="50" value="5"></label>
      <label>Przesunięcie X: <input type="number" id="shadowOffsetX" min="-50" max="50" value="2"></label>
      <label>Przesunięcie Y: <input type="number" id="shadowOffsetY" min="-50" max="50" value="2"></label>
      <label>Przezroczystość: <input type="number" id="shadowOpacity" min="0" max="1" step="0.1" value="0.5"></label>
    </div>

    <div style="border-top: 1px solid #eee; padding-top: 12px; margin-bottom: 12px;">
      <h4 style="margin:0 0 8px; font-size:14px;">Obrys tekstu</h4>
      <label><input type="checkbox" id="strokeEnabled"> Włącz</label>
      <label>Kolor: <input type="color" id="strokeColor" value="#000000"></label>
      <label>Grubość: <input type="number" id="strokeWidth" min="0" max="10" step="0.5" value="1"></label>
    </div>

    <div style="border-top: 1px solid #eee; padding-top: 12px; margin-bottom: 12px;">
      <h4 style="margin:0 0 8px; font-size:14px;">Tło tekstu</h4>
      <label><input type="checkbox" id="backgroundEnabled"> Włącz</label>
      <label>Kolor: <input type="color" id="backgroundColor" value="#ffff00"></label>
      <label>Padding: <input type="number" id="paddingInput" min="0" max="50" value="5"></label>
      <label>Zaokrąglenie: <input type="number" id="cornerRadiusInput" min="0" max="50" value="5"></label>
    </div>

    <div style="border-top: 1px solid #eee; padding-top: 12px; margin-bottom: 12px;">
      <h4 style="margin:0 0 8px; font-size:14px;">Gradient</h4>
      <label><input type="checkbox" id="gradientEnabled"> Włącz</label>
      <label>Od: <input type="color" id="gradientStart" value="#ff0000"></label>
      <label>Do: <input type="color" id="gradientEnd" value="#0000ff"></label>
    </div>
    
    <div style="display:flex; gap:8px;">
      <button id="applyBtn" style="flex:1; background:#007cba; color:white; border:none; padding:8px; border-radius:6px;">Zastosuj</button>
      <button id="cancelBtn" style="flex:1; background:#f0f0f0; border:1px solid #ccc; padding:8px; border-radius:6px;">Anuluj</button>
    </div>
  `;

  document.body.appendChild(editPanel);

  document.getElementById('applyBtn').onclick = () => {
    const text = document.getElementById('textInput').value;
    const font = document.getElementById('fontSelect').value;
    const size = parseInt(document.getElementById('sizeInput').value);
    const color = document.getElementById('colorInput').value;
    const bold = document.getElementById('boldInput').checked;
    const italic = document.getElementById('italicInput').checked;
    const underline = document.getElementById('underlineInput').checked;
    const align = document.getElementById('alignSelect').value;
    const lineHeight = parseFloat(document.getElementById('lineHeightInput').value);
    const letterSpacing = parseFloat(document.getElementById('letterSpacingInput').value);

    const shadowEnabled = document.getElementById('shadowEnabled').checked;
    const shadowColor = document.getElementById('shadowColor').value;
    const shadowBlur = parseFloat(document.getElementById('shadowBlur').value);
    const shadowOffsetX = parseFloat(document.getElementById('shadowOffsetX').value);
    const shadowOffsetY = parseFloat(document.getElementById('shadowOffsetY').value);
    const shadowOpacity = parseFloat(document.getElementById('shadowOpacity').value);

    const strokeEnabled = document.getElementById('strokeEnabled').checked;
    const strokeColor = document.getElementById('strokeColor').value;
    const strokeWidth = parseFloat(document.getElementById('strokeWidth').value);

    const backgroundEnabled = document.getElementById('backgroundEnabled').checked;
    const backgroundColor = document.getElementById('backgroundColor').value;
    const padding = parseFloat(document.getElementById('paddingInput').value);
    const cornerRadius = parseFloat(document.getElementById('cornerRadiusInput').value);

    const gradientEnabled = document.getElementById('gradientEnabled').checked;
    const gradientStart = document.getElementById('gradientStart').value;
    const gradientEnd = document.getElementById('gradientEnd').value;

    if (text && currentText) {
      currentText.text(text);
      currentText.fontFamily(font);
      currentText.fontSize(size);
      currentText.fill(color);
      currentText.align(align);
      currentText.lineHeight(lineHeight);
      currentText.letterSpacing(letterSpacing);
      currentText.fontStyle(computeStyle({ bold, italic }));
      currentText.setAttr('underline', underline);

      // Cień
      currentText.shadowEnabled(shadowEnabled);
      if (shadowEnabled) {
        currentText.shadowColor(shadowColor);
        currentText.shadowBlur(shadowBlur);
        currentText.shadowOffsetX(shadowOffsetX);
        currentText.shadowOffsetY(shadowOffsetY);
        currentText.shadowOpacity(shadowOpacity);
      }

      // Obrys
      currentText.strokeEnabled(strokeEnabled);
      if (strokeEnabled) {
        currentText.stroke(strokeColor);
        currentText.strokeWidth(strokeWidth);
      } else {
        currentText.stroke(null);
      }

      // Tło
      currentText.setAttr('backgroundEnabled', backgroundEnabled);
      currentText.setAttr('backgroundColor', backgroundColor);
      currentText.setAttr('padding', padding);
      currentText.setAttr('cornerRadius', cornerRadius);

      // Gradient
      if (gradientEnabled) {
        currentText.fillLinearGradientStartPoint({ x: 0, y: 0 });
        currentText.fillLinearGradientEndPoint({ x: currentText.width(), y: 0 });
        currentText.fillLinearGradientColorStops([0, gradientStart, 1, gradientEnd]);
      } else {
        currentText.fill(color);
      }

      currentLayer.batchDraw();
    }
    editPanel.style.display = 'none';
  };

  document.getElementById('cancelBtn').onclick = () => {
    editPanel.style.display = 'none';
  };

  return editPanel;
}

function showEditPanel(textNode, stage, layer) {
  currentText = textNode;
  currentStage = stage;
  currentLayer = layer;

  const panel = createEditPanel();

  document.getElementById('textInput').value = textNode.text() || '';
  document.getElementById('fontSelect').value = textNode.fontFamily() || 'Arial';
  document.getElementById('sizeInput').value = textNode.fontSize() || 18;
  document.getElementById('colorInput').value = textNode.fill() || '#000000';

  const fontStyle = textNode.fontStyle() || 'normal';
  document.getElementById('boldInput').checked = (fontStyle === 'bold' || fontStyle.includes('bold'));
  document.getElementById('italicInput').checked = (fontStyle === 'italic' || fontStyle.includes('italic'));
  document.getElementById('underlineInput').checked = !!textNode.getAttr('underline');

  document.getElementById('alignSelect').value = textNode.align() || 'left';
  document.getElementById('lineHeightInput').value = textNode.lineHeight() || 1.2;
  document.getElementById('letterSpacingInput').value = textNode.letterSpacing() || 0;

  // Cień
  const shadow = textNode.shadowEnabled();
  document.getElementById('shadowEnabled').checked = shadow;
  document.getElementById('shadowColor').value = textNode.shadowColor() || '#000000';
  document.getElementById('shadowBlur').value = textNode.shadowBlur() || 5;
  document.getElementById('shadowOffsetX').value = textNode.shadowOffsetX() || 2;
  document.getElementById('shadowOffsetY').value = textNode.shadowOffsetY() || 2;
  document.getElementById('shadowOpacity').value = textNode.shadowOpacity() || 0.5;

  // Obrys
  document.getElementById('strokeEnabled').checked = !!textNode.stroke();
  document.getElementById('strokeColor').value = textNode.stroke() || '#000000';
  document.getElementById('strokeWidth').value = textNode.strokeWidth() || 1;

  // Tło
  document.getElementById('backgroundEnabled').checked = !!textNode.getAttr('backgroundEnabled');
  document.getElementById('backgroundColor').value = textNode.getAttr('backgroundColor') || '#ffff00';
  document.getElementById('paddingInput').value = textNode.getAttr('padding') || 5;
  document.getElementById('cornerRadiusInput').value = textNode.getAttr('cornerRadius') || 5;

  // Gradient
  const gradient = textNode.fillLinearGradientColorStops();
  document.getElementById('gradientEnabled').checked = !!gradient;
  if (gradient && gradient.length >= 4) {
    document.getElementById('gradientStart').value = gradient[1];
    document.getElementById('gradientEnd').value = gradient[3];
  }

  panel.style.display = 'block';
}

window.editFontOfText = function(textNode) {
  if (!currentStage || !currentLayer) return;
  showEditPanel(textNode, currentStage, currentLayer);
};

window.openEditPanel = function(textNode, stage) {
  const layer = stage.getChildren()[0];
  showEditPanel(textNode, stage, layer);
};

// === TWORZENIE PANELU EDYCJI STRONY ===
function createPageEditPanel() {
  if (pageEditPanel) return pageEditPanel;

  pageEditPanel = document.createElement('div');
  pageEditPanel.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: white; 
    padding: 15px; border: 1px solid #ccc; border-radius: 8px; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000;
    font-family: Arial; font-size: 14px; display: none; width: 380px; max-height: 80vh; overflow-y: auto;
  `;

  const palette = ['#000000', '#e53e3e', '#3182ce', '#38a169', '#dd6b20', '#805ad5'].map(c => 
    `<button class="color-preset" data-color="${c}" style="background:${c}; width:24px; height:24px; border:none; border-radius:4px; margin:2px;"></button>`
  ).join('');

  const fonts = ['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Comic Sans MS', 'Impact', 'Trebuchet MS'];
  const fontOptions = fonts.map(f => `<option value="${f}">${f}</option>`).join('');

  pageEditPanel.innerHTML = `
    <div style="margin-bottom: 10px; font-weight: bold;">Edycja strony</div>
    
    <label>Baner: 
      <input type="file" id="pageBannerInput" accept="image/*" style="margin-top: 5px;">
    </label><br><br>

    <button id="removeBannerBtn" style="background: #d00; color: white; padding: 5px 10px; border: none; border-radius: 4px;">Usuń baner</button><br><br>

    <div style="border: 1px solid #eee; padding: 10px; margin-bottom: 12px; border-radius: 6px; background:#f9f9f9;">
      <h4 style="margin:0 0 8px; font-size:14px;">Waluta ceny</h4>
      <select id="currencySelect" style="width:100%; padding:6px; font-size:14px;">
        <option value="PLN">PLN (zł)</option>
        <option value="EUR">EUR (€)</option>
        <option value="GBP">GBP (£)</option>
      </select>
    </div>

    <div class="style-section">
      <h4>Nazwa produktu</h4>
      <label>Rozmiar: <input type="number" id="nameSize" min="8" max="30" value="14"></label>
      <label>Czcionka: <select id="nameFont">${fontOptions}</select></label>
      <div class="color-row">
        <input type="color" id="nameColor" value="#000000">
        <div class="palette">${palette}</div>
      </div>
      <div class="style-checks">
        <label><input type="checkbox" id="nameBold"> <span class="check-label">Pogrubienie</span></label>
        <label><input type="checkbox" id="nameItalic"> <span class="check-label">Kursywa</span></label>
        <label><input type="checkbox" id="nameUnderline"> <span class="check-label">Podkreślenie</span></label>
      </div>
      <button class="reset-btn" data-type="name">Przywróć domyślne</button>
    </div>

    <div class="style-section">
      <h4>Indeks</h4>
      <label>Rozmiar: <input type="number" id="indexSize" min="8" max="20" value="12"></label>
      <label>Czcionka: <select id="indexFont">${fontOptions}</select></label>
      <div class="color-row">
        <input type="color" id="indexColor" value="#000000">
        <div class="palette">${palette}</div>
      </div>
      <div class="style-checks">
        <label><input type="checkbox" id="indexBold"> <span class="check-label">Pogrubienie</span></label>
        <label><input type="checkbox" id="indexItalic"> <span class="check-label">Kursywa</span></label>
        <label><input type="checkbox" id="indexUnderline"> <span class="check-label">Podkreślenie</span></label>
      </div>
      <button class="reset-btn" data-type="index">Przywróć domyślne</button>
    </div>

    <div class="style-section">
      <h4>Cena</h4>
      <label>Rozmiar: <input type="number" id="priceSize" min="8" max="30" value="16"></label>
      <label>Czcionka: <select id="priceFont">${fontOptions}</select></label>
      <div class="color-row">
        <input type="color" id="priceColor" value="#000000">
        <div class="palette">${palette}</div>
      </div>
      <div class="style-checks">
        <label><input type="checkbox" id="priceBold"> <span class="check-label">Pogrubienie</span></label>
        <label><input type="checkbox" id="priceItalic"> <span class="check-label">Kursywa</span></label>
        <label><input type="checkbox" id="priceUnderline"> <span class="check-label">Podkreślenie</span></label>
      </div>
      <button class="reset-btn" data-type="price">Przywróć domyślne</button>
    </div>

    <div class="style-section">
      <h4>Ranking</h4>
      <label>Rozmiar: <input type="number" id="ratingSize" min="8" max="20" value="12"></label>
      <label>Czcionka: <select id="ratingFont">${fontOptions}</select></label>
      <div class="color-row">
        <input type="color" id="ratingColor" value="#000000">
        <div class="palette">${palette}</div>
      </div>
      <div class="style-checks">
        <label><input type="checkbox" id="ratingBold"> <span class="check-label">Pogrubienie</span></label>
        <label><input type="checkbox" id="ratingItalic"> <span class="check-label">Kursywa</span></label>
        <label><input type="checkbox" id="ratingUnderline"> <span class="check-label">Podkreślenie</span></label>
      </div>
      <button class="reset-btn" data-type="rating">Przywróć domyślne</button>
    </div>

    <label style="display:block; margin:15px 0 10px;">
      <input type="checkbox" id="applyToAllPages"> Zastosuj dla wszystkich stron
    </label>

    <div style="display: flex; gap: 8px;">
      <button id="applyPageEditBtn" style="flex:1; background:#007cba; color:white; border:none; padding:8px; border-radius:6px;">Zastosuj</button>
      <button id="cancelPageEditBtn" style="flex:1; background:#f0f0f0; border:1px solid #ccc; padding:8px; border-radius:6px;">Anuluj</button>
    </div>
    

  `;

  document.body.appendChild(pageEditPanel);
  pageEditPanel.querySelectorAll('.color-preset').forEach(preset => {
    preset.onclick = () => {
      const input = preset.closest('.color-row').querySelector('input[type="color"]');
      input.value = preset.dataset.color;
    };
  });

  const updateCheckStyle = (checkbox) => {
    const label = checkbox.parentElement;
    const span = label.querySelector('.check-label');
    if (checkbox.checked) {
      label.style.backgroundColor = '#007cba';
      label.style.color = 'white';
      if (span) span.style.color = 'white';
    } else {
      label.style.backgroundColor = '';
      label.style.color = '';
      if (span) span.style.color = '';
    }
  };

  pageEditPanel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => updateCheckStyle(cb));
  });

  pageEditPanel.querySelectorAll('.reset-btn').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      const def = DEFAULT_STYLES[type + 'Style'];
      document.getElementById(type + 'Size').value = def.size;
      document.getElementById(type + 'Font').value = def.fontFamily;
      document.getElementById(type + 'Color').value = def.color;
      const bold = document.getElementById(type + 'Bold');
      const italic = document.getElementById(type + 'Italic');
      const underline = document.getElementById(type + 'Underline');
      bold.checked = def.bold; italic.checked = def.italic; underline.checked = def.underline;
      updateCheckStyle(bold); updateCheckStyle(italic); updateCheckStyle(underline);
    };
  });

  return pageEditPanel;
}

function applyStyle(obj, style) {

  // 🔹 jeśli to GROUP (np. cena)
if (obj instanceof Konva.Group) {
  obj.getChildren().forEach(child => {
    if (!(child instanceof Konva.Text)) return;

    // styl TAK, rozmiar NIE
    child.fill(style.color);
    child.fontFamily(style.fontFamily);
    child.fontStyle(computeStyle(style));
    child.setAttr('underline', style.underline);
  });
  return;
}




  // 🔹 jeśli to zwykły Text
  obj.fontSize(style.size);
  obj.fontFamily(style.fontFamily);
  obj.fill(style.color);
  obj.fontStyle(computeStyle(style));
  obj.setAttr('underline', style.underline);
}

window.openPageEdit = function(page) {
  currentPage = page;
  const panel = createPageEditPanel();


  const bannerInput = document.getElementById('pageBannerInput');
  const applyToAllCheckbox = document.getElementById('applyToAllPages');
  const currencySelect = document.getElementById('currencySelect');

  const loadStyle = (type) => {
    const s = page.settings[type + 'Style'] || DEFAULT_STYLES[type + 'Style'];
    document.getElementById(type + 'Size').value = s.size;
    document.getElementById(type + 'Font').value = s.fontFamily;
    document.getElementById(type + 'Color').value = s.color;
    const bold = document.getElementById(type + 'Bold');
    const italic = document.getElementById(type + 'Italic');
    const underline = document.getElementById(type + 'Underline');
    bold.checked = s.bold; italic.checked = s.italic; underline.checked = s.underline;
    [bold, italic, underline].forEach(cb => {
      const label = cb.parentElement;
      const span = label.querySelector('.check-label');
      if (cb.checked) {
        label.style.backgroundColor = '#007cba';
        label.style.color = 'white';
        if (span) span.style.color = 'white';
      }
    });
  };

  ['name', 'index', 'price', 'rating'].forEach(loadStyle);
  currencySelect.value = page.settings?.currency || 'PLN';
  applyToAllCheckbox.checked = false;

  panel.style.display = 'block';

  document.getElementById('removeBannerBtn').onclick = () => {
    const old = page.layer.findOne(o => o.getAttr('name') === 'banner');
    if (old) {
      old.destroy();
      page.settings.bannerUrl = null;
      page.layer.batchDraw();
    }
  };

  document.getElementById('applyPageEditBtn').onclick = () => {
    const applyToAll = applyToAllCheckbox.checked;
    const targetPages = applyToAll ? pages : [page];
    const selectedCurrency = currencySelect.value;

    const newStyles = {
      nameStyle: {
        size: parseInt(document.getElementById('nameSize').value),
        fontFamily: document.getElementById('nameFont').value,
        color: document.getElementById('nameColor').value,
        bold: document.getElementById('nameBold').checked,
        italic: document.getElementById('nameItalic').checked,
        underline: document.getElementById('nameUnderline').checked
      },
    
      indexStyle: {
        size: parseInt(document.getElementById('indexSize').value),
        fontFamily: document.getElementById('indexFont').value,
        color: document.getElementById('indexColor').value,
        bold: document.getElementById('indexBold').checked,
        italic: document.getElementById('indexItalic').checked,
        underline: document.getElementById('indexUnderline').checked
      },
    
      priceStyle: {
        size: parseInt(document.getElementById('priceSize').value),
        fontFamily: document.getElementById('priceFont').value,
        color: document.getElementById('priceColor').value,
        bold: document.getElementById('priceBold').checked,
        italic: document.getElementById('priceItalic').checked,
        underline: document.getElementById('priceUnderline').checked
      },
    
      ratingStyle: {
        size: parseInt(document.getElementById('ratingSize').value),
        fontFamily: document.getElementById('ratingFont').value,
        color: document.getElementById('ratingColor').value,
        bold: document.getElementById('ratingBold').checked,
        italic: document.getElementById('ratingItalic').checked,
        underline: document.getElementById('ratingUnderline').checked
      },
};


targetPages.forEach(p => {
  if (p.isCover) return;
  if (!p.settings) p.settings = {};

  Object.assign(p.settings, newStyles);
  p.settings.currency = selectedCurrency;

  p.layer.getChildren().forEach(obj => {

  // === TEKSTY — stylizacja dla wszystkich typów tekstów ===

  const isName = obj.getAttr('isName');
  const isIndex = obj.getAttr('isIndex');
  const isPrice = obj.getAttr('isPrice');
  const isRating = obj.getAttr('isRating');

  if (isName) {
    applyStyle(obj, p.settings.nameStyle);
  }

  if (isIndex) {
    applyStyle(obj, p.settings.indexStyle);
  }

if (isPrice) {
  applyStyle(obj, p.settings.priceStyle);
  updatePriceCurrency(obj, selectedCurrency);
  applyPriceScale(obj, p.settings.priceStyle.size);
}

  if (isRating) {
    applyStyle(obj, p.settings.ratingStyle);
  }

});

p.layer.batchDraw();

});

      
      
      // === BANER — BEZ ZMIAN ===
      if (bannerInput.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
          Konva.Image.fromURL(e.target.result, img => {
            const scale = Math.min(page.stage.width() / img.width(), 113 / img.height());
            img.scale({ x: scale, y: scale });
            img.x(0);
            img.y(0);
            img.setAttr("name", "banner");
            img.draggable(true);
      
            targetPages.forEach(p => {
              if (p.isCover) return;
      
              const old = p.layer.findOne(n => n.getAttr("name") === "banner");
              if (old) old.destroy();
      
              p.layer.add(img.clone());
              p.layer.batchDraw();
            });
          });
        };
        reader.readAsDataURL(bannerInput.files[0]);
      }
      
           // === Zamykamy panel po zapisie zmian strony ===
      
      panel.style.display = 'none';
    };

    // === Anuluj zmiany (nie dotykamy pudełek) ===
    document.getElementById('cancelPageEditBtn').onclick = () => {
      panel.style.display = 'none';
    };
  };


// === EDYCJA ZDJĘĆ ===
function showImageOptions(img, page) {
  const oldMenu = document.querySelector('.image-edit-menu');
  if (oldMenu) oldMenu.remove();

  const menu = document.createElement('div');
  menu.className = 'image-edit-menu';
  menu.style.cssText = `
    position: absolute;
    top: ${img.y() + img.height() * img.scaleY() / 2}px;
    left: ${img.x() + img.width() * img.scaleX() / 2}px;
    transform: translate(-50%, -50%);
    background: white;
    border: 1px solid #ddd;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.18);
    padding: 10px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-family: Arial, sans-serif;
    font-size: 13px;
    min-width: 140px;
  `;

  menu.innerHTML = `
    <button class="edit-btn replace-btn">Zamień zdjęcie</button>
    <button class="edit-btn add-btn">Dodaj kolejne</button>
    <button class="edit-btn remove-btn" style="color: #e53e3e;">Usuń</button>
  `;

  document.body.appendChild(menu);

  const closeMenu = (e) => {
    if (!menu.contains(e.target) && e.target !== img) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);

  menu.querySelector('.replace-btn').onclick = (e) => { e.stopPropagation(); replaceImage(img, page); menu.remove(); };
  menu.querySelector('.add-btn').onclick = (e) => { e.stopPropagation(); addAnotherImage(page, img.x() + img.width() * img.scaleX() + 20, img.y()); menu.remove(); };
  menu.querySelector('.remove-btn').onclick = (e) => { e.stopPropagation(); img.destroy(); page.layer.batchDraw(); menu.remove(); };
}

function replaceImage(oldImg, page) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      Konva.Image.fromURL(ev.target.result, (newImg) => {
        newImg.x(oldImg.x()); newImg.y(oldImg.y());
        newImg.rotation(oldImg.rotation());
        newImg.scaleX(oldImg.scaleX()); newImg.scaleY(oldImg.scaleY());
        newImg.draggable(true); newImg.listening(true);
        oldImg.destroy();
        page.layer.add(newImg);
        page.layer.batchDraw();
      });
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function addAnotherImage(page, x, y) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      Konva.Image.fromURL(ev.target.result, (newImg) => {
        const maxHeight = 120;
        const scale = Math.min(maxHeight / newImg.height(), 1);
        newImg.x(x); newImg.y(y);
        newImg.scaleX(scale); newImg.scaleY(scale);
        newImg.draggable(true); newImg.listening(true);
        page.layer.add(newImg);
        page.layer.batchDraw();
      });
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
function applyPriceScale(priceGroup, priceSize) {
  if (!(priceGroup instanceof Konva.Group)) return;

  const BASE_SIZE = 24;

  const scale = priceSize / BASE_SIZE;

  priceGroup.scaleX(scale);
  priceGroup.scaleY(scale);
}

function updatePriceCurrency(priceGroup, currency) {
  if (!(priceGroup instanceof Konva.Group)) return;

  const unit = priceGroup.findOne('.priceUnit');
  if (!unit) return;

  const text = unit.text(); // np. "€ / KG"
  const parts = text.split(' '); 
  if (parts.length < 2) return;

  const unitPart = parts.slice(1).join(' '); // "/ KG"

  let symbol = 'zł';
  if (currency === 'EUR') symbol = '€';
  if (currency === 'GBP') symbol = '£';

  unit.text(`${symbol} ${unitPart}`);
}


// === INICJALIZACJA + KLUCZOWA ZMIANA: edytowalny każdy tekst z isEditable ===
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('canvasCreated', (e) => {
    const stage = e.detail;
    const page = pages.find(p => p.stage === stage);
    if (!page) return;

    stage.on('dblclick', (e) => {
      const node = e.target;

      currentStage = stage;
      currentLayer = stage.getChildren()[0];

      // KLUCZOWA ZMIANA: edytujemy KAŻDY tekst z isEditable, isProductText lub isRating
      if (node instanceof Konva.Text) {
        if (
          node.getAttr('isEditable') === true ||
          node.getAttr('isProductText') === true ||
          node.getAttr('isRating') === true
        ) {
          window.openEditPanel(node, stage);
        }
      }

      if (node instanceof Konva.Image && !node.getAttr('isBox') && node.getAttr('name') !== 'banner') {
        showImageOptions(node, page);
      }
    });
  });
});

document.addEventListener('click', (e) => {
  if (editPanel && !editPanel.contains(e.target) && !e.target.classList.contains('konvajs-content')) {
    editPanel.style.display = 'none';
  }
  if (pageEditPanel && !pageEditPanel.contains(e.target) && !e.target.classList.contains('edit-page-btn')) {
    pageEditPanel.style.display = 'none';
  }
});

const style = document.createElement('style');
style.textContent = `
  .style-section { border: 1px solid #eee; padding: 10px; margin-bottom: 12px; border-radius: 6px; }
  .style-section h4 { margin: 0 0 8px; font-size: 14px; }
  .style-section label { display: block; margin: 6px 0; }
  .style-section input[type="number"], .style-section select { width: 100%; padding: 4px; margin-top: 2px; }
  .color-row { display: flex; align-items: center; gap: 4px; margin: 6px 0; }
  .color-row input[type="color"] { width: 60px; height: 32px; padding: 2px; }
  .palette { display: flex; flex-wrap: wrap; width: 160px; }
  .style-checks { display: flex; gap: 8px; margin: 8px 0; }
  .style-checks label { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
  .check-label { pointer-events: none; }
  .reset-btn { margin-top: 8px; font-size: 12px; padding: 4px 8px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; }
  .reset-btn:hover { background: #e9ecef; }
`;
document.head.appendChild(style);//dziala
