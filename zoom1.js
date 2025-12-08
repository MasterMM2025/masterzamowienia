// zoom.js – SUWAK ZOOM DLA CAŁEJ STRONY A4 (CZEKA NA pages, DZIAŁA)

let zoomLevel = 1.0;
const zoomMin = 0.5;
const zoomMax = 3.0;
let zoomSlider = null;

// === ZOOM DLA STRONY (wrapper + canvas) ===
function applyZoomToPage(page, scale) {
  const wrapper = page.container?.querySelector('.canvas-wrapper');
  const canvas = page.canvas;
  if (!wrapper || !canvas) return;

  wrapper.style.transition = 'transform 0.1s ease-out';
  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.transformOrigin = 'top center';

  canvas.setWidth(794 * scale);
  canvas.setHeight(1123 * scale);
  canvas.setZoom(scale);
  canvas.calcOffset();
  canvas.renderAll();
}

// === TWÓRZ SUWAK ===
function createZoomSlider() {
  if (zoomSlider) return;

  zoomSlider = document.createElement('div');
  zoomSlider.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: white; padding: 10px; border-radius: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 1000; text-align: center; min-width: 200px;
  `;

  zoomSlider.innerHTML = `
    <button id="zoomInBtn" style="border: none; background: none; font-size: 20px; color: #666; margin: 0 5px;">+</button>
    <input type="range" id="zoomSlider" min="${zoomMin}" max="${zoomMax}" step="0.1" value="${zoomLevel}" style="width: 120px; margin: 0 10px;">
    <span id="zoomValue" style="font-weight: bold; color: #333;">${Math.round(zoomLevel * 100)}%</span>
    <button id="zoomOutBtn" style="border: none; background: none; font-size: 20px; color: #666; margin: 0 5px;">−</button>
  `;

  document.body.appendChild(zoomSlider);

  const slider = document.getElementById('zoomSlider');
  const valueSpan = document.getElementById('zoomValue');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');

  const updateZoom = (newZoom) => {
    zoomLevel = newZoom;
    valueSpan.textContent = `${Math.round(newZoom * 100)}%`;
    if (window.pages && Array.isArray(window.pages)) {
      window.pages.forEach(page => applyZoomToPage(page, newZoom));
    }
  };

  slider.oninput = (e) => updateZoom(parseFloat(e.target.value));
  zoomInBtn.onclick = () => updateZoom(Math.min(zoomLevel + 0.1, zoomMax));
  zoomOutBtn.onclick = () => updateZoom(Math.max(zoomLevel - 0.1, zoomMin));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
      zoomSlider.style.display = zoomSlider.style.display === 'none' ? 'block' : 'none';
    }
  });
}

// === CZEKAJ NA pages (z importdanych.js) ===
const waitForPages = setInterval(() => {
  if (window.pages && Array.isArray(window.pages) && window.pages.length > 0) {
    createZoomSlider();
    window.pages.forEach(page => applyZoomToPage(page, zoomLevel));
    clearInterval(waitForPages);
  }
}, 100);

// === DLA NOWYCH STRON (po imporcie) ===
const originalCreatePage = window.createPage;
window.createPage = function(...args) {
  const page = originalCreatePage(...args);
  if (page && page.canvas && zoomSlider) {
    applyZoomToPage(page, zoomLevel);
  }
  return page;
};

// === RESET ZOOM (Ctrl + 0) ===
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '0') {
    zoomLevel = 1.0;
    const slider = document.getElementById('zoomSlider');
    const valueSpan = document.getElementById('zoomValue');
    if (slider && valueSpan) {
      slider.value = 1.0;
      valueSpan.textContent = '100%';
      if (window.pages) window.pages.forEach(page => applyZoomToPage(page, 1.0));
    }
  }
});