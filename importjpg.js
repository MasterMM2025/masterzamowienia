// importjpg.js – DZIAŁA

window.importImagesFromFiles = function() {
  const input = document.getElementById('imageInput');
  const files = input?.files;
  if (!files || files.length === 0) return alert('Wybierz zdjęcia!');

  if (!window.ExcelImporter || !window.ExcelImporterReady || !window.ExcelImporter.pages?.length) {
    return alert('Najpierw zaimportuj Excel!');
  }

  const pages = window.ExcelImporter.pages;
  const map = new Map();
  pages.forEach((page, pi) => {
    page.products.forEach((p, si) => {
      if (p.INDEKS) map.set(p.INDEKS.toLowerCase().trim(), { pageIndex: pi, slotIndex: si });
    });
  });

  const matched = [];
  Array.from(files).forEach(file => {
    const name = file.name.toLowerCase().replace(/\.[^/.]+$/, '').replace(/[^0-9a-z]/g, '');
    for (const [indeks, pos] of map) {
      const clean = indeks.replace(/[^0-9a-z]/g, '');
      if (name.includes(clean) || clean.includes(name)) {
        matched.push({ file, ...pos });
        break;
      }
    }
  });

  if (matched.length === 0) return alert('Brak dopasowań');

  matched.forEach(({ file, pageIndex, slotIndex }) => {
    const reader = new FileReader();
    reader.onload = e => {
      fabric.Image.fromURL(e.target.result, img => {
        const page = pages[pageIndex];
        if (page.slotObjects[slotIndex]) page.canvas.remove(page.slotObjects[slotIndex]);
        const scale = Math.min((BW * 0.45 - 20) / img.width, (BH * 0.6) / img.height, 1);
        const x = ML + (slotIndex % COLS) * (BW + GAP) + 20;
        const y = MT + Math.floor(slotIndex / COLS) * (BH + GAP) + 100;
        img.set({ left: x, top: y, selectable: true, hasControls: true }).scale(scale);
        page.canvas.add(img);
        page.slotObjects[slotIndex] = img;
        page.canvas.renderAll();
      });
    };
    reader.readAsDataURL(file);
  });

  input.value = '';
  alert(`Zaimportowano ${matched.length} zdjęć`);
};