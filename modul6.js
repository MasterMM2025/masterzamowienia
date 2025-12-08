// modul6.js – KOD KRESKOWY W PUDEŁKU (10px od dołu, 10px od prawej)

const W = 794, H = 1123;
const ML = 14, MT = 105, MB = 28, COLS = 2, ROWS = 3, GAP = 6;
const BW = (W - ML * 2 - GAP) / COLS;
const BH = (H - MT - MB - GAP * (ROWS - 1)) / ROWS;

// === RYSOWANIE MODUŁU 6 ===
window.drawModule6 = function(page, forceRedraw = false) {
  const { canvas, products } = page;

  if (forceRedraw) {
    canvas.clear();
    canvas.backgroundColor = '#fff';
  }

  const showEan = document.getElementById('showEan')?.checked ?? true;
  const showCena = document.getElementById('showCena')?.checked ?? true;
  const frame3D = document.querySelector('input[name="frameStyle"]:checked')?.value === '3d';

  products.forEach((p, i) => {
    const x = ML + (i % COLS) * (BW + GAP);
    const y = MT + Math.floor(i / COLS) * (BH + GAP);

    // 1. Ramka – ZAWSZE RYSUJ
    canvas.add(new fabric.Rect({
      left: x, top: y, width: BW, height: BH,
      fill: '#fff', stroke: '#ccc', strokeWidth: 2, rx: 5, ry: 5,
      shadow: frame3D ? '5px 5px 10px rgba(0,0,0,0.2)' : null,
      selectable: false
    }));

    // 2. Nazwa – ZAWSZE RYSUJ
    const name = p.NAZWA || 'Brak nazwy';
    const lines = name.match(/.{1,40}(\s|$)/g) || [name];
    lines.slice(0, 2).forEach((line, j) => {
      canvas.add(new fabric.Text(line.trim(), {
        left: x + BW / 2, top: y + 25 + j * 12,
        fontSize: 11, fontWeight: 'bold', fill: '#000',
        originX: 'center', selectable: false
      }));
    });

    // 3. Indeks – ZAWSZE RYSUJ
    canvas.add(new fabric.Text(`Indeks: ${p.INDEKS || '-'}`, {
      left: x + BW / 2, top: y + 61,
      fontSize: 10, fill: '#000', originX: 'center', selectable: false
    }));

    // 4. Cena – ZAWSZE RYSUJ (jeśli włączona)
    if (showCena && p.CENA) {
      canvas.add(new fabric.Text(`Cena: ${p.CENA} €`, {
        left: x + BW / 2, top: y + 80,
        fontSize: 12, fill: '#d00', fontWeight: 'bold',
        originX: 'center', selectable: false
      }));
    }

    // 5. Zdjęcie – ZAWSZE RYSUJ (jeśli istnieje)
    if (page.slotObjects[i]) {
      const img = page.slotObjects[i];
      const maxImgW = (BW * 0.45) - 20;
      const maxImgH = BH * 0.6;
      const scale = Math.min(maxImgW / img.width, maxImgH / img.height, 1);
      img.scale(scale).set({ left: x + 20, top: y + 80, selectable: true, hasControls: true });
      canvas.add(img);
    }

    // 6. Kod kreskowy – RYSUJ TYLKO RAZ
    if (showEan && p['KOD EAN'] && !page.barcodeObjects[i]) {
      window.generateBarcode(p['KOD EAN'], data => {
        if (!data) return;
        fabric.Image.fromURL(data, img => {
          const bw = 100, bh = 35;
          const bx = x + BW - bw - 10; // 10px od prawej
          const by = y + BH - bh - 10; // 10px od dołu
          img.set({ left: bx, top: by, selectable: true, hasControls: true, lockUniScaling: true });
          canvas.add(img);
          page.barcodeObjects[i] = img;
          canvas.renderAll();
        });
      });
    }
  });

  if (forceRedraw) canvas.renderAll();
};

// === KOD KRESKOWY BEZ TŁA ===
window.generateBarcode = function(ean, cb) {
  const key = ean.trim();
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
    cb(null);
  }
};