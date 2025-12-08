// main.js – Wersja jednostronicowa (kompatybilna z wielostronicową)
// Używana tylko jeśli NIE ma importexcel.js

const { jsPDF } = window.jspdf;

// === KONFIGURACJA CANVAS (A4 @ 96 DPI) ===
const canvasWidth = 794;
const canvasHeight = 1123;

// Sprawdź, czy canvas istnieje w DOM
const canvasEl = document.getElementById('canvas');
if (!canvasEl) {
  console.warn('main.js: Brak elementu <canvas id="canvas"> w HTML. Pomijam inicjalizację.');
} else {
  const canvas = new fabric.Canvas('canvas', {
    width: canvasWidth,
    height: canvasHeight,
    backgroundColor: '#fff'
  });

  // === UKŁAD MODUŁU 6 (2×3) ===
  const marginLeftRight = 14;
  const bannerHeight = 85;
  const marginTop = 20 + bannerHeight;
  const marginBottom = 28;
  const cols = 2, rows = 3;
  const gap = 6;
  const boxWidth = (canvasWidth - marginLeftRight * 2 - gap) / cols;
  const boxHeight = (canvasHeight - marginTop - marginBottom - (gap * (rows - 1))) / rows;

  // === GLOBALNE DANE ===
  let products = [];
  let slotObjects = Array(6).fill(null);
  let barcodeObjects = Array(6).fill(null);
  let barcodeCache = {};

  // === GENERUJ KOD KRESKOWY EAN-13 ===
  function generateBarcode(ean, callback) {
    if (!ean || ean.length < 8) return callback(null);
    const cacheKey = ean.trim();
    if (barcodeCache[cacheKey]) return callback(barcodeCache[cacheKey]);

    const tempCanvas = document.createElement('canvas');
    try {
      JsBarcode(tempCanvas, cacheKey, {
        format: "EAN13",
        width: 2.2,
        height: 42,
        displayValue: true,
        fontSize: 11,
        margin: 6,
        flat: true
      });
      const dataUrl = tempCanvas.toDataURL("image/png");
      barcodeCache[cacheKey] = dataUrl;
      callback(dataUrl);
    } catch (e) {
      console.warn("Błąd kodu kreskowego:", ean, e);
      callback(null);
    }
  }

  // === RYSUJ SIATKĘ DEBUG (tylko jeśli istnieje #gridOverlay) ===
  function drawGridOverlay() {
    const overlay = document.getElementById('gridOverlay');
    if (!overlay) return; // Bezpieczne wyjście

    overlay.innerHTML = '';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const slotIndex = row * cols + col;
        const x = marginLeftRight + col * (boxWidth + gap);
        const y = marginTop + row * (boxHeight + gap);

        const div = document.createElement('div');
        div.className = 'grid-cell';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.width = `${boxWidth}px`;
        div.style.height = `${boxHeight}px`;
        div.innerHTML = `Slot ${slotIndex + 1}<br>X: ${Math.round(x)}px<br>Y: ${Math.round(y)}px`;
        overlay.appendChild(div);
      }
    }
  }

  // === GŁÓWNA FUNKCJA RYSOWANIA ===
  function drawGrid() {
    if (!canvasEl) return;
    canvas.clear();
    canvas.backgroundColor = '#ffffff';
    drawGridOverlay();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const slotIndex = row * cols + col;
        const p = products[slotIndex] || { INDEKS: '', NAZWA: `Produkt ${slotIndex + 1}`, CENA: '', KOD_EAN: '' };
        const currentX = marginLeftRight + col * (boxWidth + gap);
        const currentY = marginTop + row * (boxHeight + gap);

        // 1. Ramka
        const rect = new fabric.Rect({
          left: currentX, top: currentY, width: boxWidth, height: boxHeight,
          fill: 'transparent', stroke: '#ccc', strokeWidth: 2, rx: 5, ry: 5, selectable: false
        });
        canvas.add(rect);

        // 2. Nazwa
        const nameLines = p.NAZWA.match(/.{1,40}(\s|$)/g) || [p.NAZWA];
        nameLines.slice(0, 2).forEach((line, i) => {
          const text = new fabric.Text(line.trim(), {
            left: currentX + boxWidth / 2, top: currentY + 25 + i * 12,
            fontSize: 11, fontWeight: 'bold', fill: '#000',
            originX: 'center', selectable: false
          });
          canvas.add(text);
        });

        // 3. Indeks
        const indexText = new fabric.Text(`Indeks: ${p.INDEKS}`, {
          left: currentX + boxWidth / 2, top: currentY + 61,
          fontSize: 10, fill: '#000', originX: 'center', selectable: false
        });
        canvas.add(indexText);

        // 4. Zdjęcie
        if (slotObjects[slotIndex]) {
          const img = slotObjects[slotIndex];
          const maxImgW = (boxWidth * 0.45) - 20;
          const maxImgH = boxHeight * 0.6;
          const scale = Math.min(maxImgW / img.width, maxImgH / img.height, 1);
          img.scale(scale);
          img.set({ left: currentX + 20, top: currentY + 80, selectable: true, hasControls: true });
          canvas.add(img);
        }

        // 5. Kod kreskowy
        if (p.KOD_EAN && p.KOD_EAN.trim()) {
          const bw = 100, bh = 35;
          const bx = currentX + boxWidth - bw - 10;
          const by = currentY + boxHeight - bh - 20;

          generateBarcode(p.KOD_EAN, barcodeData => {
            if (barcodeData && barcodeObjects[slotIndex]) {
              canvas.remove(barcodeObjects[slotIndex]);
            }
            if (barcodeData) {
              fabric.Image.fromURL(barcodeData, barcodeImg => {
                barcodeImg.set({
                  left: bx, top: by,
                  selectable: true, hasControls: true, lockUniScaling: true
                });
                canvas.add(barcodeImg);
                barcodeObjects[slotIndex] = barcodeImg;
                canvas.renderAll();
              });
            }
          });
        }
      }
    }
    canvas.renderAll();
  }

  // === IMPORT EXCEL (jednostronicowy) ===
  window.importExcel = async function() {
    const file = document.getElementById('excelFile')?.files[0];
    if (!file) {
      alert('Wybierz plik Excel!');
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, {
        header: ['INDEKS', 'NAZWA', 'CENA', 'KOD_EAN', 'RANKING', 'LOGO', 'KRAJ_POCHODZENIA'],
        defval: ''
      });

      products = json.slice(0, 6).map(p => ({
        INDEKS: String(p.INDEKS || '').trim(),
        NAZWA: String(p.NAZWA || '').trim(),
        CENA: String(p.CENA || '').trim(),
        KOD_EAN: String(p.KOD_EAN || '').trim(),
        RANKING: String(p.RANKING || '').trim(),
        LOGO: String(p.LOGO || '').trim(),
        KRAJ_POCHODZENIA: String(p.KRAJ_POCHODZENIA || '').trim()
      }));

      slotObjects.fill(null);
      barcodeObjects.fill(null);
      barcodeCache = {};

      drawGrid();

      const pdfBtn = document.getElementById('pdfButton');
      const previewBtn = document.getElementById('previewButton');
      if (pdfBtn) pdfBtn.disabled = false;
      if (previewBtn) previewBtn.disabled = false;

    } catch (e) {
      alert('Błąd odczytu Excela: ' + e.message);
      console.error(e);
    }
  };

  // === GENERUJ PDF (jednostronicowy) ===
  window.generatePDF = async function() {
    if (!canvasEl) return alert('Brak canvas do eksportu.');

    const overlay = document.getElementById('gridOverlay');
    if (overlay) overlay.style.display = 'none';

    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [794, 1123] });
    pdf.addImage(dataUrl, 'PNG', 0, 0, 794, 1123);
    pdf.save('modul6.pdf');

    if (overlay) overlay.style.display = '';
  };

  // === PODGLĄD PDF ===
  window.generatePDFBlob = async function() {
    if (!canvasEl) throw new Error('Brak canvas');

    const overlay = document.getElementById('gridOverlay');
    if (overlay) overlay.style.display = 'none';

    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2 });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [794, 1123] });
    pdf.addImage(dataUrl, 'PNG', 0, 0, 794, 1123);

    if (overlay) overlay.style.display = '';
    return pdf.output('blob');
  };

  // === WYCZYŚĆ CANVAS ===
  window.clearCanvas = function() {
    if (!canvasEl) return;
    slotObjects.forEach(obj => obj && canvas.remove(obj));
    barcodeObjects.forEach(obj => obj && canvas.remove(obj));
    slotObjects.fill(null);
    barcodeObjects.fill(null);
    products = [];
    barcodeCache = {};
    drawGrid();

    const pdfBtn = document.getElementById('pdfButton');
    const previewBtn = document.getElementById('previewButton');
    if (pdfBtn) pdfBtn.disabled = true;
    if (previewBtn) previewBtn.disabled = true;
  };

  // === DEBUG RUCHU ===
  canvas.on('object:moving', e => {
    const obj = e.target;
    const debug = document.getElementById('debug');
    if (debug) {
      debug.style.display = 'block';
      debug.innerHTML = `Przeciągasz: X=${Math.round(obj.left)} Y=${Math.round(obj.top)}`;
    }
  });

  canvas.on('object:scaling', e => {
    const obj = e.target;
    const debug = document.getElementById('debug');
    if (debug) {
      debug.style.display = 'block';
      debug.innerHTML = `Skalujesz: X=${Math.round(obj.left)} Y=${Math.round(obj.top)} Skala=${obj.scaleX.toFixed(2)}x`;
    }
  });

  // === INICJALIZACJA ===
  drawGrid();

  // === EKSPORT DLA importjpg.js (kompatybilność) ===
  window.App = {
    canvas,
    drawGrid,
    slotObjects,
    boxWidth,
    boxHeight,
    marginLeftRight,
    marginTop,
    gap,
    cols,
    products
  };

  console.log('main.js załadowany – wersja jednostronicowa');
}