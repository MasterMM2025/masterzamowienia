// importexcel.js – DZIAŁA 100%

let allProducts = [], pages = [];
const W = 794, H = 1123;
const ML = 14, MT = 105, MB = 28, COLS = 2, ROWS = 3, GAP = 6;
const BW = (W - ML * 2 - GAP) / COLS;
const BH = (H - MT - MB - GAP * (ROWS - 1)) / ROWS;

window.importExcelMultiPage = async function() {
  const file = document.getElementById('excelFile')?.files[0];
  if (!file) return alert('Wybierz plik Excel!');

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: ['INDEKS', 'NAZWA', 'CENA', 'KOD EAN', 'RANKING', 'LOGO'], defval: ''
    });

    allProducts = json.map(p => ({
      INDEKS: String(p.INDEKS || '').trim(),
      NAZWA: String(p.NAZWA || '').trim(),
      CENA: String(p.CENA || '').trim(),
      'KOD EAN': String(p['KOD EAN'] || '').trim(),
      RANKING: String(p.RANKING || '').trim(),
      LOGO: String(p.LOGO || '').trim()
    })).filter(p => p.INDEKS || p.NAZWA);

    pages.forEach(p => { p.canvas?.dispose(); p.container?.remove(); });
    pages = [];
    document.getElementById('pagesContainer').innerHTML = '';

    const perPage = 6;
    for (let i = 0; i < Math.ceil(allProducts.length / perPage); i++) {
      let prods = allProducts.slice(i * perPage, (i + 1) * perPage);
      while (prods.length < 6) prods.push({ INDEKS: '', NAZWA: '', CENA: '', 'KOD EAN': '' });
      createPage(i + 1, prods);
    }

    document.getElementById('pdfButton').disabled = false;
    document.getElementById('previewButton').disabled = false;
    document.getElementById('fileLabel').textContent = file.name;

    window.ExcelImporterReady = true;
  } catch (e) {
    alert('Błąd: ' + e.message);
  }
};

function createPage(n, prods) {
  const div = document.createElement('div');
  div.className = 'page-container';
  div.innerHTML = `<h3>Strona ${n}</h3><div class="canvas-wrapper"><canvas id="c${n}"></canvas><div class="grid-overlay" id="g${n}"></div></div>`;
  document.getElementById('pagesContainer').appendChild(div);

  const canvas = new fabric.Canvas(`c${n}`, { width: W, height: H, backgroundColor: '#fff' });
  const page = { number: n, products: prods, canvas, container: div, slotObjects: Array(6).fill(null), barcodeObjects: Array(6).fill(null) };
  pages.push(page);
  drawPage(page);
}

function drawPage(page) {
  const { canvas, products } = page;
  canvas.clear();
  canvas.backgroundColor = '#fff';

  const showEan = document.getElementById('showEan')?.checked ?? true;
  const showCena = document.getElementById('showCena')?.checked ?? true;
  const frame3D = document.querySelector('input[name="frameStyle"]:checked')?.value === '3d';

  products.forEach((p, i) => {
    const x = ML + (i % 2) * (BW + GAP);
    const y = MT + Math.floor(i / 2) * (BH + GAP);

    canvas.add(new fabric.Rect({ left: x, top: y, width: BW, height: BH, fill: '#fff', stroke: '#ccc', strokeWidth: 2, rx: 5, ry: 5, shadow: frame3D ? '5px 5px 10px rgba(0,0,0,0.2)' : null, selectable: false }));

    const name = p.NAZWA || 'Pusty';
    canvas.add(new fabric.Text(name.length > 40 ? name.slice(0, 40) + '...' : name, { left: x + BW / 2, top: y + 25, fontSize: 11, fontWeight: 'bold', fill: '#000', originX: 'center', selectable: false }));
    if (name.length > 40) canvas.add(new fabric.Text(name.slice(40, 80), { left: x + BW / 2, top: y + 37, fontSize: 11, fontWeight: 'bold', fill: '#000', originX: 'center', selectable: false }));

    canvas.add(new fabric.Text(`Indeks: ${p.INDEKS}`, { left: x + BW / 2, top: y + 61, fontSize: 10, fill: '#000', originX: 'center', selectable: false }));

    if (showCena && p.CENA) canvas.add(new fabric.Text(`Cena: ${p.CENA} €`, { left: x + BW / 2, top: y + 80, fontSize: 12, fill: '#d00', fontWeight: 'bold', originX: 'center', selectable: false }));

    if (page.slotObjects[i]) {
      const img = page.slotObjects[i];
      const scale = Math.min((BW * 0.45 - 20) / img.width, (BH * 0.6) / img.height, 1);
      img.scale(scale).set({ left: x + 20, top: y + 100, selectable: true, hasControls: true });
      canvas.add(img);
    }

    if (showEan && p['KOD EAN']) {
      generateBarcode(p['KOD EAN'], data => {
        if (!data) return;
        if (page.barcodeObjects[i]) canvas.remove(page.barcodeObjects[i]);
        fabric.Image.fromURL(data, img => {
          img.set({ left: x + BW - 110, top: y + BH - 55, selectable: true, hasControls: true, lockUniScaling: true });
          canvas.add(img);
          page.barcodeObjects[i] = img;
        });
      });
    }
  });
  canvas.renderAll();
}

function generateBarcode(ean, cb) {
  const key = ean.trim();
  if (window.barcodeCache && window.barcodeCache[key]) return cb(window.barcodeCache[key]);
  const c = document.createElement('canvas');
  try {
    JsBarcode(c, key, { format: 'EAN13', width: 2.2, height: 42, displayValue: true, fontSize: 11, margin: 6, flat: true });
    const url = c.toDataURL('image/png');
    if (!window.barcodeCache) window.barcodeCache = {};
    window.barcodeCache[key] = url;
    cb(url);
  } catch (e) { cb(null); }
}

window.generatePDF = async function() {
  if (!pages.length) return alert('Brak stron');
  const pdf = new jsPDF({ orientation: 'p', unit: 'px', format: [W, H] });
  for (let i = 0; i < pages.length; i++) {
    const overlay = document.getElementById(`g${pages[i].number}`);
    if (overlay) overlay.style.display = 'none';
    const data = pages[i].canvas.toDataURL({ multiplier: 2 });
    if (i > 0) pdf.addPage();
    pdf.addImage(data, 'PNG', 0, 0, W, H);
    if (overlay) overlay.style.display = '';
  }
  pdf.save('katalog.pdf');
};

window.generatePDFBlob = async function() {
  if (!pages.length) throw new Error();
  const pdf = new jsPDF({ orientation: 'p', unit: 'px', format: [W, H] });
  for (let i = 0; i < pages.length; i++) {
    const overlay = document.getElementById(`g${pages[i].number}`);
    if (overlay) overlay.style.display = 'none';
    const data = pages[i].canvas.toDataURL({ multiplier: 2 });
    if (i > 0) pdf.addPage();
    pdf.addImage(data, 'PNG', 0, 0, W, H);
    if (overlay) overlay.style.display = '';
  }
  return pdf.output('blob');
};

window.ExcelImporter = {
  pages,
  clear: () => {
    pages.forEach(p => { p.canvas?.dispose(); p.container?.remove(); });
    pages = [];
    document.getElementById('pagesContainer').innerHTML = '';
    window.ExcelImporterReady = false;
  }
};

window.ExcelImporterReady = false;