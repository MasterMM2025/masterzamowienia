let products = [];
let jsonProducts = [];
let selectedBanner = null;
let selectedCover = null;
let selectedBackground = null;
let uploadedImages = {};
let productEdits = {};
let globalCurrency = 'EUR';
let globalLanguage = 'pl';
let pendingProducts = null;

// === CANVAS & FABRIC.JS ===
let canvas;
let slotObjects = Array(6).fill(null);
let barcodeObjects = Array(6).fill(null);
let barcodeCache = {};

// === INICJALIZACJA CANVAS ===
function initCanvas() {
  const canvasEl = document.getElementById('canvas');
  if (!canvasEl) return;
  canvas = new fabric.Canvas(canvasEl, {
    width: 794,
    height: 1123,
    backgroundColor: '#ffffff'
  });
}

// === TO BASE64 ===
async function toBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// === ŁADOWANIE JSON ===
async function loadProducts() {
  try {
    const response = await fetch("https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/UKRAINA.json");
    if (!response.ok) throw new Error(`Nie udało się załadować JSON: ${response.status}`);
    const jsonData = await response.json();
    jsonProducts = await Promise.all(jsonData.map(async (p) => {
      const urls = [
        `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-ukraina/${p.INDEKS}.jpg`,
        `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-ukraina/${p.INDEKS}.png`,
        `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/rumunia/${p.INDEKS}.jpg`,
        `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/rumunia/${p.INDEKS}.png`
      ];
      let base64Img = null;
      for (const url of urls) {
        base64Img = await toBase64(url);
        if (base64Img) break;
      }
      return {
        nazwa: p.NAZWA,
        opakowanie: p.OPAKOWANIE,
        ean: p["unit barcode"],
        ranking: p.RANKING || '',
        cena: p.CENA || '',
        indeks: p.INDEKS.toString(),
        img: base64Img
      };
    }));
    console.log("Załadowano jsonProducts:", jsonProducts.length);
  } catch (error) {
    document.getElementById('debug').innerText = "Błąd ładowania JSON: " + error.message;
    console.error("Błąd loadProducts:", error);
  }
}

// === OBSŁUGA PLIKÓW ===
function handleFiles(files, callback) {
  if (!files || files.length === 0) {
    console.error("Brak plików do załadowania");
    document.getElementById('debug').innerText = "Brak zdjęć do załadowania";
    return;
  }
  [...files].forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      callback(file, e.target.result);
      document.getElementById('debug').innerText = `Załadowano plik: ${file.name}`;
    };
    reader.onerror = () => {
      console.error(`Błąd ładowania pliku: ${file.name}`);
      document.getElementById('debug').innerText = `Błąd ładowania pliku: ${file.name}`;
    };
    reader.readAsDataURL(file);
  });
}

function loadCustomBanner(file, data) {
  selectedBanner = { id: "custom", data };
  console.log("Załadowano baner:", file.name);
  renderCatalog();
}

function loadCustomBackground(file, data) {
  selectedBackground = { id: "customBackground", data };
  console.log("Załadowano tło:", file.name);
  renderCatalog();
}

function loadCustomCover(file, data) {
  selectedCover = { id: "customCover", data };
  console.log("Załadowano okładkę:", file.name);
}

function loadCustomImages(file, data) {
  const fileName = file.name.split('.')[0];
  uploadedImages[fileName] = data;
  console.log(`Załadowano obraz dla indeksu: ${fileName}`);
  if (pendingProducts) {
    pendingProducts.forEach(p => {
      if (uploadedImages[p.indeks]) {
        p.img = uploadedImages[p.indeks];
      }
    });
    products = pendingProducts;
    pendingProducts = null;
    renderCatalog();
    document.getElementById('pdfButton').disabled = false;
    document.getElementById('previewButton').disabled = false;
    document.getElementById('debug').innerText = `Zaimportowano ${products.length} produktów z obrazami`;
  } else {
    renderCatalog();
  }
}

// === MODAL EDYCJI ===
function showEditModal(productIndex) {
  const product = products[productIndex];
  const edit = productEdits[productIndex] || {
    font: 'Arial', fontColor: '#000000', indeksFont: 'Arial', indeksFontColor: '#000000',
    rankingFont: 'Arial', rankingFontColor: '#000000', cenaFont: 'Arial', cenaFontColor: '#000000',
    priceCurrency: globalCurrency, priceFontSize: 'medium'
  };
  const showRanking = document.getElementById('showRanking')?.checked || false;
  const showCena = document.getElementById('showCena')?.checked || false;
  const priceLabel = globalLanguage === 'en' ? 'Price' : 'Cena';
  const editForm = document.getElementById('editForm');
  editForm.innerHTML = `
    <div class="edit-field">
      <label>Zdjęcie:</label>
      <img src="${uploadedImages[product.indeks] || product.img || 'https://dummyimage.com/120x84/eee/000&text=brak'}" style="width:100px;height:100px;object-fit:contain;margin-bottom:10px;">
      <input type="file" id="editImage" accept="image/*">
    </div>
    <div class="edit-field">
      <label>Nazwa:</label>
      <input type="text" id="editNazwa" value="${product.nazwa || ''}">
      <select id="editNazwaFont">
        <option value="Arial" ${edit.font === 'Arial' ? 'selected' : ''}>Arial</option>
        <option value="Helvetica" ${edit.font === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
        <option value="Times" ${edit.font === 'Times' ? 'selected' : ''}>Times New Roman</option>
      </select>
      <input type="color" id="editNazwaColor" value="${edit.fontColor}">
    </div>
    <div class="edit-field">
      <label>Indeks:</label>
      <input type="text" id="editIndeks" value="${product.indeks || ''}">
      <select id="editIndeksFont">
        <option value="Arial" ${edit.indeksFont === 'Arial' ? 'selected' : ''}>Arial</option>
        <option value="Helvetica" ${edit.indeksFont === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
        <option value="Times" ${edit.indeksFont === 'Times' ? 'selected' : ''}>Times New Roman</option>
      </select>
      <input type="color" id="editIndeksColor" value="${edit.indeksFontColor}">
    </div>
    ${showRanking ? `
      <div class="edit-field">
        <label>Ranking:</label>
        <input type="text" id="editRanking" value="${product.ranking || ''}">
        <select id="editRankingFont">
          <option value="Arial" ${edit.rankingFont === 'Arial' ? 'selected' : ''}>Arial</option>
          <option value="Helvetica" ${edit.rankingFont === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
          <option value="Times" ${edit.rankingFont === 'Times' ? 'selected' : ''}>Times New Roman</option>
        </select>
        <input type="color" id="editRankingColor" value="${edit.rankingFontColor}">
      </div>
    ` : ''}
    ${showCena ? `
      <div class="edit-field">
        <label>${priceLabel}:</label>
        <input type="text" id="editCena" value="${product.cena || ''}">
        <select id="editCenaFont">
          <option value="Arial" ${edit.cenaFont === 'Arial' ? 'selected' : ''}>Arial</option>
          <option value="Helvetica" ${edit.cenaFont === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
          <option value="Times" ${edit.cenaFont === 'Times' ? 'selected' : ''}>Times New Roman</option>
        </select>
        <input type="color" id="editCenaColor" value="${edit.cenaFontColor}">
        <select id="editCenaCurrency">
          <option value="EUR" ${edit.priceCurrency === 'EUR' ? 'selected' : ''}>EUR (EUR)</option>
          <option value="GBP" ${edit.priceCurrency === 'GBP' ? 'selected' : ''}>GBP (GBP)</option>
        </select>
        <select id="editCenaFontSize">
          <option value="small" ${edit.priceFontSize === 'small' ? 'selected' : ''}>Mały</option>
          <option value="medium" ${edit.priceFontSize === 'medium' ? 'selected' : ''}>Średni</option>
          <option value="large" ${edit.priceFontSize === 'large' ? 'selected' : ''}>Duży</option>
        </select>
      </div>
    ` : ''}
    <button onclick="saveEdit(${productIndex})" class="btn-primary">Zapisz</button>
  `;
  document.getElementById('editModal').style.display = 'block';
}

function hideEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

function saveEdit(productIndex) {
  const product = products[productIndex];
  const editImage = document.getElementById('editImage').files[0];
  if (editImage) {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImages[product.indeks] = e.target.result;
      renderCatalog();
    };
    reader.readAsDataURL(editImage);
  }
  product.nazwa = document.getElementById('editNazwa').value;
  product.indeks = document.getElementById('editIndeks').value;
  if (document.getElementById('showRanking')?.checked) {
    product.ranking = document.getElementById('editRanking')?.value || '';
  }
  if (document.getElementById('showCena')?.checked) {
    product.cena = document.getElementById('editCena')?.value || '';
  }
  productEdits[productIndex] = {
    font: document.getElementById('editNazwaFont').value,
    fontColor: document.getElementById('editNazwaColor').value,
    indeksFont: document.getElementById('editIndeksFont').value,
    indeksFontColor: document.getElementById('editIndeksColor').value,
    rankingFont: document.getElementById('editRankingFont')?.value || 'Arial',
    rankingFontColor: document.getElementById('editRankingColor')?.value || '#000000',
    cenaFont: document.getElementById('editCenaFont')?.value || 'Arial',
    cenaFontColor: document.getElementById('editCenaColor')?.value || '#000000',
    priceCurrency: document.getElementById('editCenaCurrency')?.value || globalCurrency,
    priceFontSize: document.getElementById('editCenaFontSize')?.value || 'medium'
  };
  renderCatalog();
  hideEditModal();
}

// === GENERUJ KOD KRESKOWY ===
function generateBarcode(ean, callback) {
  if (barcodeCache[ean]) return callback(barcodeCache[ean]);
  const c = document.createElement('canvas');
  try {
    JsBarcode(c, ean, { format: "EAN13", width: 2.2, height: 42, displayValue: true, fontSize: 11, margin: 6 });
    const url = c.toDataURL("image/png");
    barcodeCache[ean] = url;
    callback(url);
  } catch (e) { callback(null); }
}

// === RYSUJ SIATKĘ (ZAMIENNIK renderCatalog) ===
function drawGrid() {
  if (!canvas) initCanvas();
  canvas.clear();
  canvas.backgroundColor = '#ffffff';

  const marginLeftRight = 14;
  const bannerHeight = 85;
  const marginTop = 20 + bannerHeight;
  const marginBottom = 28;
  const cols = 2, rows = 3;
  const gap = 6;
  const boxWidth = (794 - marginLeftRight * 2 - gap) / cols;
  const boxHeight = (1123 - marginTop - marginBottom - (gap * (rows - 1))) / rows;

  document.getElementById('gridOverlay').innerHTML = '';

  products.slice(0, 6).forEach((p, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const x = marginLeftRight + col * (boxWidth + gap);
    const y = marginTop + row * (boxHeight + gap);

    // Ramka
    const rect = new fabric.Rect({
      left: x, top: y, width: boxWidth, height: boxHeight,
      fill: 'transparent', stroke: '#ccc', strokeWidth: 2, rx: 5, ry: 5, selectable: false
    });
    canvas.add(rect);

    // Nazwa
    const nameLines = (p.nazwa || '').match(/.{1,40}(\s|$)/g) || [p.nazwa || ''];
    nameLines.slice(0, 2).forEach((line, idx) => {
      const text = new fabric.Text(line.trim(), {
        left: x + boxWidth / 2, top: y + 25 + idx * 14,
        fontSize: 11, fontWeight: 'bold', fill: '#000', originX: 'center', selectable: false
      });
      canvas.add(text);
    });

    // Indeks
    const indexText = new fabric.Text(`Indeks: ${p.indeks || ''}`, {
      left: x + boxWidth / 2, top: y + 61, fontSize: 10, fill: '#000', originX: 'center', selectable: false
    });
    canvas.add(indexText);

    // Zdjęcie
    const imgSrc = uploadedImages[p.indeks] || p.img;
    if (imgSrc && !slotObjects[i]) {
      fabric.Image.fromURL(imgSrc, img => {
        const maxW = (boxWidth * 0.45) - 20;
        const maxH = boxHeight * 0.6;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        img.scale(scale);
        img.set({ left: x + 20, top: y + 80, selectable: true, hasControls: true });
        canvas.add(img);
        slotObjects[i] = img;
      });
    } else if (slotObjects[i]) {
      canvas.add(slotObjects[i]);
    }

    // Kod kreskowy
    if (p.ean && p.barcode) {
      const bw = 100, bh = 35;
      const bx = x + boxWidth - bw - 10;
      const by = y + boxHeight - bh - 55;
      if (!barcodeObjects[i]) {
        fabric.Image.fromURL(p.barcode, img => {
          img.set({ left: bx, top: by, selectable: true, hasControls: true, lockUniScaling: true });
          canvas.add(img);
          barcodeObjects[i] = img;
        });
      } else {
        canvas.add(barcodeObjects[i]);
      }
    }
  });

  canvas.renderAll();

  // Debug
  canvas.on('object:moving', e => {
    const o = e.target;
    const d = document.getElementById('debug');
    d.style.display = 'block';
    d.innerHTML = `X: ${Math.round(o.left)} Y: ${Math.round(o.top)}`;
  });
  canvas.on('object:scaling', e => {
    const o = e.target;
    const d = document.getElementById('debug');
    d.style.display = 'block';
    d.innerHTML = `Skala: ${o.scaleX.toFixed(2)}x`;
  });
}

function renderCatalog() {
  drawGrid();
}

// === IMPORT EXCEL ===
function importExcel() {
  const file = document.getElementById('excelFile').files[0];
  if (!file) {
    alert('Wybierz plik Excel lub CSV do importu');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    let rows;
    if (file.name.endsWith('.csv')) {
      const parsed = Papa.parse(e.target.result, { header: true, skipEmptyLines: true, encoding: 'UTF-8', delimiter: ',' });
      rows = parsed.data;
    } else {
      const workbook = XLSX.read(e.target.result, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
      const headers = rows[0].map(h => h.toString().toLowerCase().trim());
      rows = rows.slice(1).map(row => {
        let obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });
    }

    const newProducts = [];
    rows.forEach(row => {
      const indeks = row['indeks'] || row['index-cell'] || (row[0] ? row[0].toString().trim() : null);
      if (!indeks) return;
      const matched = jsonProducts.find(p => p.indeks === indeks.toString());
      let barcodeImg = null;
      if (row['ean'] || row['kod ean']) {
        const rawEan = (row['ean'] || row['kod ean']).toString().trim();
        let finalEan = rawEan;
        let format = null;
        if (/^\d{7}$/.test(rawEan)) { finalEan += '0'; format = "EAN8"; }
        else if (/^\d{13}$/.test(rawEan)) { finalEan = fixEan13Checksum(rawEan); format = "EAN13"; }
        else if (/^\d{8}$/.test(rawEan)) { format = "EAN8"; }
        else return;
        try {
          const c = document.createElement('canvas');
          JsBarcode(c, finalEan, { format, width: 2.2, height: 42, displayValue: true, fontSize: 11, margin: 6 });
          barcodeImg = c.toDataURL("image/png");
        } catch (e) { console.error(e); }
      }

      newProducts.push({
        nazwa: row['nazwa'] || row['text-decoration-none'] || (matched ? matched.nazwa : ''),
        ean: row['ean'] || row['kod ean'] || (matched ? matched.ean : ''),
        ranking: row['ranking'] || (matched ? matched.ranking : ''),
        cena: row['cena'] || (matched ? matched.cena : ''),
        indeks: indeks.toString(),
        img: uploadedImages[indeks] || (matched ? matched.img : null),
        barcode: barcodeImg
      });
    });

    if (newProducts.length) {
      pendingProducts = newProducts;
      document.getElementById('debug').innerText = `Zaimportowano ${newProducts.length} produktów. Wybierz zdjęcia.`;
      alert('Dane zaimportowane. Teraz wybierz zdjęcia produktów.');
    }
  };
  reader.onerror = () => alert('Błąd odczytu pliku');
  file.name.endsWith('.csv') ? reader.readAsText(file, 'UTF-8') : reader.readAsBinaryString(file);
}

// === EKSPORT PDF ===
async function exportPDF(save = true) {
  const container = document.getElementById('container');
  if (!container) return alert('Brak kontenera');

  try {
    const data = await html2canvas(container, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
    const imgData = data.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const w = pdf.internal.pageSize.getWidth();
    const h = (data.height * w) / data.width;
    pdf.addImage(imgData, 'PNG', 0, 0, w, h);
    save ? pdf.save('katalog.pdf') : (document.getElementById('pdfIframe').src = pdf.output('bloburl'), document.getElementById('pdfPreview').style.display = 'block');
  } catch (e) {
    alert('Błąd PDF: ' + e.message);
  }
}

window.generatePDF = () => exportPDF(true);
window.previewPDF = () => exportPDF(false);

// === POPRAW CYFRĘ KONTROLNĄ EAN-13 ===
function fixEan13Checksum(ean13) {
  if (!/^\d{13}$/.test(ean13)) return ean13;
  const d = ean13.slice(0,12).split('').map(Number);
  let s = 0;
  for (let i = 0; i < 12; i++) s += d[i] * (i % 2 === 0 ? 1 : 3);
  return ean13.slice(0,12) + ((10 - s % 10) % 10);
}

// === INICJALIZACJA ===
document.addEventListener("DOMContentLoaded", () => {
  initCanvas();
  loadProducts();

  // Uploady
  ['imageInput', 'bannerFileInput', 'backgroundFileInput', 'coverFileInput'].forEach(id => {
    const input = document.getElementById(id);
    const area = document.getElementById(id.replace('FileInput', 'Upload') || id.replace('Input', 'Area'));
    if (input && area) {
      input.addEventListener('change', e => e.target.files.length && handleFiles(e.target.files, window[id.replace('FileInput', 'Custom') + 'Images'] || loadCustomImages));
      area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
      area.addEventListener('dragleave', () => area.classList.remove('dragover'));
      area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('dragover'); e.dataTransfer.files.length && handleFiles(e.dataTransfer.files, window[id.replace('FileInput', 'Custom') + 'Images'] || loadCustomImages); });
    }
  });

  // Excel
  const excelInput = document.getElementById('excelFile');
  if (excelInput) {
    excelInput.addEventListener('change', importExcel);
    document.querySelector('.file-label-wrapper')?.addEventListener('click', () => excelInput.click());
  }

  // Waluta i język
  document.getElementById('currencySelect')?.addEventListener('change', e => { globalCurrency = e.target.value; renderCatalog(); });
  document.getElementById('languageSelect')?.addEventListener('change', e => { globalLanguage = e.target.value; renderCatalog(); });

  // Czyść układ
  document.getElementById('clearLayout')?.addEventListener('click', () => {
    slotObjects.fill(null);
    barcodeObjects.fill(null);
    renderCatalog();
  });
});

// Eksportuj funkcje
window.importExcel = importExcel;
window.showEditModal = showEditModal;
window.hideEditModal = hideEditModal;
window.saveEdit = saveEdit;