// rysowanie.js – Canva‑style panel kształtów + edycja koloru/obrysu
(function () {
  if (window.shapeDrawerLoaded) return;
  window.shapeDrawerLoaded = true;

  const PANEL_ID = "shapePanel";
  const PANEL_CLASS = "shape-panel";

  const SHAPES = [
    { id: "rect", label: "Prostokąt" },
    { id: "roundRect", label: "Zaokrąglony" },
    { id: "circle", label: "Koło" },
    { id: "ellipse", label: "Elipsa" },
    { id: "triangle", label: "Trójkąt" },
    { id: "star", label: "Gwiazda" },
    { id: "star6", label: "Gwiazda 6" },
    { id: "diamond", label: "Romb" },
    { id: "pentagon", label: "Pięciokąt" },
    { id: "hexagon", label: "Sześciokąt" },
    { id: "octagon", label: "Ośmiokąt" },
    { id: "ring", label: "Pierścień" },
    { id: "bubble", label: "Dymek" },
    { id: "cloud", label: "Chmura" },
    { id: "line", label: "Linia" },
    { id: "arrow", label: "Strzałka" }
  ];

  // Presety (etykiety) – szybkie „pro” kształty
  const PRESETS = [
    { id: "saleBadge", label: "SALE" },
    { id: "newBadge", label: "NOWOŚĆ" },
    { id: "hitBadge", label: "HIT" },
    { id: "promoRibbon", label: "PROMO" },
    { id: "bestPrice", label: "BEST PRICE" },
    { id: "limited", label: "LIMITED" },
    { id: "eco", label: "EKO" },
    { id: "bestseller", label: "BESTSELLER" },
    { id: "hot", label: "HOT" },
    { id: "newArrival", label: "NOWA DOSTAWA" },
    { id: "discount20", label: "-20%" },
    { id: "discount30", label: "-30%" },
    { id: "polecamy", label: "POLECAMY" },
    { id: "premium", label: "PREMIUM" },
    { id: "vegan", label: "VEGAN" },
    { id: "oferta", label: "OFERTA" }
  ];

  // Kafelki / ramki (kontenery)
  const FRAMES = [
    { id: "cardSoft", label: "Karta soft" },
    { id: "cardOutline", label: "Karta obrys" },
    { id: "photoFrame", label: "Ramka foto" },
    { id: "bannerBar", label: "Pasek" }
  ];

  function getActivePage() {
    if (!Array.isArray(window.pages) || pages.length === 0) return null;
    return pages.find(p => p.stage === document.activeStage) || pages[0];
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = PANEL_CLASS;
    panel.style.display = "block";

    const shapeIcons = {
      rect: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="7" width="22" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      roundRect: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="7" width="22" height="18" rx="6" ry="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      circle: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      ellipse: `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="16" rx="11" ry="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      triangle: `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,6 27,25 5,25" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      star: `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,5 19.5,12 27,12.5 21,17.5 23,25 16,20.5 9,25 11,17.5 5,12.5 12.5,12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
      star6: `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,4 19,12 28,12 21,18 24,27 16,21 8,27 11,18 4,12 13,12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
      diamond: `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,5 27,16 16,27 5,16" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      pentagon: `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,5 27,12 23,26 9,26 5,12" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      hexagon: `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="10,5 22,5 28,16 22,27 10,27 4,16" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      octagon: `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="10,4 22,4 28,10 28,22 22,28 10,28 4,22 4,10" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      ring: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="4"/></svg>`,
      bubble: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6" width="22" height="16" rx="4" ry="4" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="10,22 14,22 10,27" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      cloud: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 22h13a5 5 0 0 0 0-10 6 6 0 0 0-11-2 5 5 0 0 0-2 12z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      line: `<svg viewBox="0 0 32 32" aria-hidden="true"><line x1="6" y1="16" x2="26" y2="16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
      arrow: `<svg viewBox="0 0 32 32" aria-hidden="true"><line x1="6" y1="16" x2="23" y2="16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><polygon points="23,11 28,16 23,21" fill="currentColor"/></svg>`
    };

    const presetPreview = {
      saleBadge: `<svg viewBox="0 0 120 60"><rect x="6" y="10" width="108" height="40" rx="12" fill="#ef4444"/><text x="60" y="38" text-anchor="middle" font-size="20" font-family="Arial" font-weight="700" fill="#fff">SALE</text></svg>`,
      newBadge: `<svg viewBox="0 0 120 60"><rect x="8" y="12" width="104" height="36" rx="18" fill="#22c55e"/><text x="60" y="37" text-anchor="middle" font-size="16" font-family="Arial" font-weight="700" fill="#fff">NOWOŚĆ</text></svg>`,
      hitBadge: `<svg viewBox="0 0 120 60"><rect x="10" y="12" width="100" height="36" rx="10" fill="#f59e0b"/><text x="60" y="38" text-anchor="middle" font-size="20" font-family="Arial" font-weight="800" fill="#111827">HIT</text></svg>`,
      promoRibbon: `<svg viewBox="0 0 120 60"><rect x="8" y="16" width="92" height="28" rx="6" fill="#6366f1"/><polygon points="100,16 114,30 100,44" fill="#4f46e5"/><text x="52" y="36" text-anchor="middle" font-size="16" font-family="Arial" font-weight="700" fill="#fff">PROMO</text></svg>`,
      bestPrice: `<svg viewBox="0 0 120 60"><rect x="6" y="12" width="108" height="36" rx="8" fill="#0ea5e9"/><text x="60" y="36" text-anchor="middle" font-size="14" font-family="Arial" font-weight="700" fill="#fff">BEST PRICE</text></svg>`,
      limited: `<svg viewBox="0 0 120 60"><rect x="6" y="12" width="108" height="36" rx="18" fill="#111827"/><text x="60" y="36" text-anchor="middle" font-size="16" font-family="Arial" font-weight="700" fill="#fff">LIMITED</text></svg>`,
      eco: `<svg viewBox="0 0 120 60"><rect x="12" y="14" width="96" height="32" rx="16" fill="#16a34a"/><text x="60" y="35" text-anchor="middle" font-size="18" font-family="Arial" font-weight="800" fill="#fff">EKO</text></svg>`,
      bestseller: `<svg viewBox="0 0 120 60"><rect x="6" y="12" width="108" height="36" rx="10" fill="#f97316"/><text x="60" y="36" text-anchor="middle" font-size="14" font-family="Arial" font-weight="700" fill="#fff">BESTSELLER</text></svg>`,
      hot: `<svg viewBox="0 0 120 60"><rect x="18" y="14" width="84" height="32" rx="6" fill="#dc2626"/><text x="60" y="36" text-anchor="middle" font-size="18" font-family="Arial" font-weight="800" fill="#fff">HOT</text></svg>`,
      newArrival: `<svg viewBox="0 0 120 60"><rect x="6" y="12" width="108" height="36" rx="8" fill="#22c55e"/><text x="60" y="36" text-anchor="middle" font-size="12.5" font-family="Arial" font-weight="700" fill="#fff">NOWA DOSTAWA</text></svg>`
      ,
      discount20: `<svg viewBox="0 0 120 60"><circle cx="30" cy="30" r="22" fill="#ef4444"/><text x="30" y="36" text-anchor="middle" font-size="16" font-family="Arial" font-weight="800" fill="#fff">-20%</text></svg>`,
      discount30: `<svg viewBox="0 0 120 60"><circle cx="30" cy="30" r="22" fill="#f97316"/><text x="30" y="36" text-anchor="middle" font-size="16" font-family="Arial" font-weight="800" fill="#fff">-30%</text></svg>`,
      polecamy: `<svg viewBox="0 0 120 60"><rect x="6" y="12" width="108" height="36" rx="18" fill="#3b82f6"/><text x="60" y="36" text-anchor="middle" font-size="14" font-family="Arial" font-weight="700" fill="#fff">POLECAMY</text></svg>`,
      premium: `<svg viewBox="0 0 120 60"><rect x="10" y="14" width="100" height="32" rx="10" fill="#111827"/><text x="60" y="36" text-anchor="middle" font-size="14" font-family="Arial" font-weight="700" fill="#fff">PREMIUM</text></svg>`,
      vegan: `<svg viewBox="0 0 120 60"><rect x="12" y="14" width="96" height="32" rx="16" fill="#16a34a"/><text x="60" y="35" text-anchor="middle" font-size="14" font-family="Arial" font-weight="700" fill="#fff">VEGAN</text></svg>`,
      oferta: `<svg viewBox="0 0 120 60"><rect x="6" y="12" width="108" height="36" rx="8" fill="#8b5cf6"/><text x="60" y="36" text-anchor="middle" font-size="14" font-family="Arial" font-weight="700" fill="#fff">OFERTA</text></svg>`
    };

    const framePreview = {
      cardSoft: `<svg viewBox="0 0 120 60"><rect x="10" y="8" width="100" height="44" rx="12" fill="#fff" stroke="#e5e7eb"/><rect x="12" y="12" width="96" height="40" rx="10" fill="rgba(0,0,0,0.04)"/></svg>`,
      cardOutline: `<svg viewBox="0 0 120 60"><rect x="10" y="8" width="100" height="44" rx="10" fill="#fff" stroke="#cbd5e1" stroke-width="2"/></svg>`,
      photoFrame: `<svg viewBox="0 0 120 60"><rect x="16" y="6" width="88" height="48" rx="6" fill="#fff" stroke="#111827" stroke-width="4"/></svg>`,
      bannerBar: `<svg viewBox="0 0 120 60"><rect x="6" y="18" width="108" height="24" rx="12" fill="#0ea5e9"/></svg>`
    };

    panel.innerHTML = `
      <div class="shape-panel-header">
        <div class="shape-panel-title">Kształty</div>
        <button class="shape-panel-close" aria-label="Zamknij">×</button>
      </div>

      <div class="shape-panel-search">
        <input id="shapeSearchInput" type="text" placeholder="Wyszukaj kształty">
      </div>

      <div class="shape-panel-section">
        <div class="shape-panel-subtitle">Szybkie kształty</div>
        <div class="shape-grid">
          ${SHAPES.map(s => `
            <button class="shape-tile" draggable="true" data-shape="${s.id}" data-label="${s.label}" title="${s.label}">
              <span class="shape-icon">${shapeIcons[s.id] || ""}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="shape-panel-section">
        <div class="shape-panel-subtitle">Szybkie etykiety</div>
        <div class="preset-grid">
          ${PRESETS.map(p => `
            <button class="shape-preset" draggable="true" data-preset="${p.id}" data-label="${p.label}" title="${p.label}">
              <span class="preset-preview">${presetPreview[p.id] || ""}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="shape-panel-section">
        <div class="shape-panel-subtitle">Kafelki i ramki</div>
        <div class="frame-grid">
          ${FRAMES.map(f => `
            <button class="shape-frame" draggable="true" data-frame="${f.id}" data-label="${f.label}" title="${f.label}">
              <span class="frame-preview">${framePreview[f.id] || ""}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="shape-panel-section">
        <div class="shape-panel-subtitle">Dodaj kształt</div>
        <div class="shape-panel-hint">Wybierz kształt, a edycja pojawi się przy zaznaczeniu.</div>
      </div>
    `;

    document.body.appendChild(panel);

    const style = document.createElement("style");
    style.textContent = `
      .${PANEL_CLASS}{
        transition: left .25s ease;
        position: fixed;
        left: -320px;
        top: 60px;
        width: 320px;
        height: calc(100vh - 80px);
        background: #fff;
        border-radius: 16px 16px 0 0;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        overflow-y: auto;
        z-index: 100000;
        padding: 20px;
        font-family: "Inter", Arial, sans-serif;
        color: #111827;
      }
      .shape-panel-header{
        display:flex;align-items:center;justify-content:space-between;
        margin-bottom:10px;
      }
      .shape-panel-title{font-weight:700;font-size:16px;}
      .shape-panel-close{
        width:30px;height:30px;border-radius:10px;border:1px solid #e5e7eb;
        background:#f9fafb;cursor:pointer;font-size:18px;line-height:1;
      }
      .shape-panel-search input{
        width:100%;padding:10px 12px;border-radius:12px;border:1px solid #e5e7eb;
        font-size:13px;background:#f9fafb;
      }
      .shape-panel-hint{
        margin-top:6px;
        font-size:12px;
        color:#6b7280;
      }
      .shape-panel-section{margin-top:16px;}
      .shape-panel-subtitle{font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em;}
      .shape-grid{
        display:grid;
        grid-template-columns: repeat(4, 1fr);
        gap:10px;
      }
      .shape-tile{
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:6px;height:64px;
        border:1px solid #e5e7eb;border-radius:12px;
        background:#ffffff;cursor:pointer;color:#111827;
        box-shadow:0 4px 10px rgba(16,24,40,0.08);
      }
      .shape-tile:hover{border-color:#c7d2fe; background:#f3f6ff;}
      .shape-icon{
        width:28px;height:28px;color:#111827;display:flex;align-items:center;justify-content:center;
      }
      .shape-icon svg{width:28px;height:28px;display:block;}
      .shape-name{display:none;}

      .preset-grid{
        display:grid;
        grid-template-columns: repeat(2, 1fr);
        gap:10px;
      }
      .shape-preset{
        display:flex;align-items:center;justify-content:center;
        height:70px;
        border:1px solid #e5e7eb;border-radius:14px;
        background:#ffffff;cursor:pointer;color:#111827;
        box-shadow:0 6px 14px rgba(16,24,40,0.08);
      }
      .shape-preset:hover{border-color:#c7d2fe; background:#f3f6ff;}
      .preset-preview svg{width:110px;height:54px;display:block;}
      .frame-grid{
        display:grid;
        grid-template-columns: repeat(2, 1fr);
        gap:10px;
      }
      .shape-frame{
        display:flex;align-items:center;justify-content:center;
        height:70px;
        border:1px solid #e5e7eb;border-radius:14px;
        background:#ffffff;cursor:pointer;color:#111827;
        box-shadow:0 6px 14px rgba(16,24,40,0.08);
      }
      .shape-frame:hover{border-color:#c7d2fe; background:#f3f6ff;}
      .frame-preview svg{width:110px;height:54px;display:block;}
      /* edycja przeniesiona do floating submenu */
    `;
    document.head.appendChild(style);

    // toggle (jak panel Elementów)
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "toggleShapePanel";
    toggleBtn.innerHTML = "⟨";
    toggleBtn.style.cssText = `
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      left: 0px;
      z-index: 100001;
      background: #fff;
      border-radius: 0 12px 12px 0;
      border: 1px solid #ddd;
      width: 46px;
      height: 46px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
      display: none;
      font-weight: 700;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(toggleBtn);
    panel._toggleBtn = toggleBtn;

    toggleBtn.addEventListener("click", () => {
      if (panel._visible) {
        hidePanel(panel);
      } else {
        showPanel(panel);
      }
    });

    // EVENTS
    panel.querySelector(".shape-panel-close").onclick = () => {
      hidePanel(panel);
    };

    panel.addEventListener("click", (e) => {
      const shapeBtn = e.target.closest(".shape-tile");
      if (shapeBtn) {
        addShape(shapeBtn.dataset.shape);
        return;
      }
      const presetBtn = e.target.closest(".shape-preset");
      if (presetBtn) {
        addPreset(presetBtn.dataset.preset);
        return;
      }
      const frameBtn = e.target.closest(".shape-frame");
      if (frameBtn) {
        addFrame(frameBtn.dataset.frame);
        return;
      }
    });

    panel.addEventListener("dragstart", (e) => {
      const shapeBtn = e.target.closest(".shape-tile");
      if (shapeBtn) {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-shape", shapeBtn.dataset.shape);
        e.dataTransfer.setData("text/plain", shapeBtn.dataset.shape);
        return;
      }
      const presetBtn = e.target.closest(".shape-preset");
      if (presetBtn) {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-preset", presetBtn.dataset.preset);
        e.dataTransfer.setData("text/plain", presetBtn.dataset.preset);
        return;
      }
      const frameBtn = e.target.closest(".shape-frame");
      if (frameBtn) {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/x-frame", frameBtn.dataset.frame);
        e.dataTransfer.setData("text/plain", frameBtn.dataset.frame);
      }
    });

    panel.querySelector("#shapeSearchInput").oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      panel.querySelectorAll(".shape-tile, .shape-preset, .shape-frame").forEach(b => {
        const label = (b.dataset.label || "").toLowerCase();
        const match = label.includes(q);
        b.style.display = match ? "flex" : "none";
      });
    };

    return panel;
  }

  function addShape(type, pos) {
    const page = getActivePage();
    if (!page) {
      alert("Najpierw zaimportuj Excel lub dodaj stronę!");
      return;
    }

    const layer = page.layer;
    const stage = page.stage;
    const centerX = (pos && pos.x) ? pos.x : stage.width() / 2;
    const centerY = (pos && pos.y) ? pos.y : stage.height() / 2;

    let node = null;
    const stroke = "#111111";
    const fill = "#ffffff";
    const strokeWidth = 2;

    if (type === "rect") {
      const w = 180, h = 120;
      node = new Konva.Rect({
        x: centerX - w / 2, y: centerY - h / 2, width: w, height: h,
        fill, stroke, strokeWidth, draggable: true, listening: true
      });
    }
    if (type === "roundRect") {
      const w = 180, h = 120;
      node = new Konva.Rect({
        x: centerX - w / 2, y: centerY - h / 2, width: w, height: h,
        cornerRadius: 16, fill, stroke, strokeWidth, draggable: true, listening: true
      });
    }
    if (type === "circle") {
      node = new Konva.Circle({
        x: centerX, y: centerY, radius: 60, fill, stroke, strokeWidth,
        draggable: true, listening: true
      });
    }
    if (type === "ellipse") {
      node = new Konva.Ellipse({
        x: centerX, y: centerY, radiusX: 90, radiusY: 55, fill, stroke, strokeWidth,
        draggable: true, listening: true
      });
    }
    if (type === "triangle") {
      node = new Konva.RegularPolygon({
        x: centerX, y: centerY, sides: 3, radius: 70, fill, stroke, strokeWidth,
        draggable: true, listening: true
      });
    }
    if (type === "star") {
      node = new Konva.Star({
        x: centerX, y: centerY, numPoints: 5, innerRadius: 30, outerRadius: 60,
        fill, stroke, strokeWidth, draggable: true, listening: true
      });
    }
    if (type === "star6") {
      node = new Konva.Star({
        x: centerX, y: centerY, numPoints: 6, innerRadius: 26, outerRadius: 60,
        fill, stroke, strokeWidth, draggable: true, listening: true
      });
    }
    if (type === "diamond") {
      node = new Konva.RegularPolygon({
        x: centerX, y: centerY, sides: 4, radius: 65, fill, stroke, strokeWidth,
        rotation: 45, draggable: true, listening: true
      });
    }
    if (type === "pentagon") {
      node = new Konva.RegularPolygon({
        x: centerX, y: centerY, sides: 5, radius: 65, fill, stroke, strokeWidth,
        draggable: true, listening: true
      });
    }
    if (type === "hexagon") {
      node = new Konva.RegularPolygon({
        x: centerX, y: centerY, sides: 6, radius: 65, fill, stroke, strokeWidth,
        draggable: true, listening: true
      });
    }
    if (type === "octagon") {
      node = new Konva.RegularPolygon({
        x: centerX, y: centerY, sides: 8, radius: 65, fill, stroke, strokeWidth,
        draggable: true, listening: true
      });
    }
    if (type === "ring") {
      node = new Konva.Ring({
        x: centerX, y: centerY, innerRadius: 32, outerRadius: 60,
        fill, stroke, strokeWidth, draggable: true, listening: true
      });
    }
    if (type === "bubble") {
      const group = new Konva.Group({
        x: centerX,
        y: centerY,
        draggable: true,
        listening: true
      });
      const bubble = new Konva.Rect({
        x: -90, y: -50, width: 180, height: 90,
        cornerRadius: 16, fill, stroke, strokeWidth
      });
      const tail = new Konva.Line({
        points: [-30, 40, -8, 40, -24, 68],
        closed: true,
        fill, stroke, strokeWidth
      });
      bubble.setAttr("shapeType", "bubble");
      tail.setAttr("shapeType", "bubble");
      if (bubble.strokeScaleEnabled) bubble.strokeScaleEnabled(false);
      if (tail.strokeScaleEnabled) tail.strokeScaleEnabled(false);
      group.add(bubble);
      group.add(tail);
      group.setAttrs({ isShape: true, shapeType: "bubble" });
      node = group;
    }
    if (type === "cloud") {
      const group = new Konva.Group({
        x: centerX,
        y: centerY,
        draggable: true,
        listening: true
      });
      const parts = [
        new Konva.Circle({ x: -55, y: 5, radius: 26, fill, stroke, strokeWidth }),
        new Konva.Circle({ x: -15, y: -10, radius: 34, fill, stroke, strokeWidth }),
        new Konva.Circle({ x: 25, y: 0, radius: 28, fill, stroke, strokeWidth }),
        new Konva.Circle({ x: 55, y: 8, radius: 22, fill, stroke, strokeWidth }),
        new Konva.Rect({ x: -75, y: 8, width: 150, height: 40, fill, stroke, strokeWidth, cornerRadius: 18 })
      ];
      parts.forEach(p => {
        if (p.strokeScaleEnabled) p.strokeScaleEnabled(false);
        p.setAttr("shapeType", "cloud");
        group.add(p);
      });
      group.setAttrs({ isShape: true, shapeType: "cloud" });
      node = group;
    }
    if (type === "line") {
      node = new Konva.Line({
        points: [centerX - 80, centerY, centerX + 80, centerY],
        stroke, strokeWidth: 4, lineCap: "round", draggable: true, listening: true, hitStrokeWidth: 20
      });
    }
    if (type === "arrow") {
      node = new Konva.Arrow({
        points: [centerX - 80, centerY, centerX + 80, centerY],
        stroke, strokeWidth: 4, pointerLength: 14, pointerWidth: 14,
        lineCap: "round", lineJoin: "round", draggable: true, listening: true, hitStrokeWidth: 20
      });
    }

    if (!node) return;
    node.setAttrs({ isShape: true, shapeType: type });
    if (node.strokeScaleEnabled) node.strokeScaleEnabled(false);

    layer.add(node);
    node.moveToTop();
    layer.batchDraw();
    page.transformerLayer.batchDraw();

    page.selectedNodes = [node];
    page.transformer.nodes([node]);
    document.activeStage = stage;
    if (window.showFloatingButtons) window.showFloatingButtons();

    updatePanelFromSelection();
  }

  function addPreset(type, pos) {
    const page = getActivePage();
    if (!page) {
      alert("Najpierw zaimportuj Excel lub dodaj stronę!");
      return;
    }

    const layer = page.layer;
    const stage = page.stage;
    const centerX = (pos && pos.x) ? pos.x : stage.width() / 2;
    const centerY = (pos && pos.y) ? pos.y : stage.height() / 2;

    const group = new Konva.Group({
      x: centerX,
      y: centerY,
      draggable: true,
      listening: true
    });

    let mainShape = null;
    let text = null;

    if (type === "saleBadge") {
      mainShape = new Konva.Rect({
        x: -90, y: -30, width: 180, height: 60,
        cornerRadius: 14, fill: "#ef4444", stroke: "#b91c1c", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -90, y: -18, width: 180, align: "center",
        text: "SALE", fontSize: 28, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "newBadge") {
      mainShape = new Konva.Rect({
        x: -90, y: -26, width: 180, height: 52,
        cornerRadius: 26, fill: "#22c55e", stroke: "#16a34a", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -90, y: -10, width: 180, align: "center",
        text: "NOWOŚĆ", fontSize: 20, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "hitBadge") {
      mainShape = new Konva.Rect({
        x: -75, y: -28, width: 150, height: 56,
        cornerRadius: 10, fill: "#f59e0b", stroke: "#d97706", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -75, y: -8, width: 150, align: "center",
        text: "HIT", fontSize: 26, fontStyle: "bold", fill: "#111827", fontFamily: "Arial"
      });
    }
    if (type === "promoRibbon") {
      mainShape = new Konva.Rect({
        x: -90, y: -22, width: 160, height: 44,
        cornerRadius: 8, fill: "#6366f1", stroke: "#4f46e5", strokeWidth: 2
      });
      const tail = new Konva.Line({
        points: [70, -22, 96, 0, 70, 22],
        fill: "#4f46e5",
        closed: true
      });
      if (tail.strokeScaleEnabled) tail.strokeScaleEnabled(false);
      tail.setAttr("isPresetShape", true);
      group.add(tail);

      text = new Konva.Text({
        x: -90, y: -6, width: 160, align: "center",
        text: "PROMO", fontSize: 20, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "bestPrice") {
      mainShape = new Konva.Rect({
        x: -90, y: -22, width: 180, height: 44,
        cornerRadius: 8, fill: "#0ea5e9", stroke: "#0284c7", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -90, y: -6, width: 180, align: "center",
        text: "BEST PRICE", fontSize: 16, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "limited") {
      mainShape = new Konva.Rect({
        x: -90, y: -22, width: 180, height: 44,
        cornerRadius: 20, fill: "#111827", stroke: "#0f172a", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -90, y: -6, width: 180, align: "center",
        text: "LIMITED", fontSize: 18, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "eco") {
      mainShape = new Konva.Rect({
        x: -70, y: -20, width: 140, height: 40,
        cornerRadius: 18, fill: "#16a34a", stroke: "#15803d", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -70, y: -6, width: 140, align: "center",
        text: "EKO", fontSize: 18, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "bestseller") {
      mainShape = new Konva.Rect({
        x: -95, y: -22, width: 190, height: 44,
        cornerRadius: 10, fill: "#f97316", stroke: "#ea580c", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -95, y: -6, width: 190, align: "center",
        text: "BESTSELLER", fontSize: 15, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "hot") {
      mainShape = new Konva.Rect({
        x: -60, y: -20, width: 120, height: 40,
        cornerRadius: 6, fill: "#dc2626", stroke: "#b91c1c", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -60, y: -6, width: 120, align: "center",
        text: "HOT", fontSize: 18, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "newArrival") {
      mainShape = new Konva.Rect({
        x: -105, y: -22, width: 210, height: 44,
        cornerRadius: 8, fill: "#22c55e", stroke: "#16a34a", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -105, y: -6, width: 210, align: "center",
        text: "NOWA DOSTAWA", fontSize: 13, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "discount20") {
      mainShape = new Konva.Circle({
        x: 0, y: 0, radius: 34, fill: "#ef4444", stroke: "#b91c1c", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -50, y: -10, width: 100, align: "center",
        text: "-20%", fontSize: 20, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "discount30") {
      mainShape = new Konva.Circle({
        x: 0, y: 0, radius: 34, fill: "#f97316", stroke: "#ea580c", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -50, y: -10, width: 100, align: "center",
        text: "-30%", fontSize: 20, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "polecamy") {
      mainShape = new Konva.Rect({
        x: -90, y: -22, width: 180, height: 44,
        cornerRadius: 18, fill: "#3b82f6", stroke: "#2563eb", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -90, y: -6, width: 180, align: "center",
        text: "POLECAMY", fontSize: 16, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "premium") {
      mainShape = new Konva.Rect({
        x: -90, y: -22, width: 180, height: 44,
        cornerRadius: 10, fill: "#111827", stroke: "#0f172a", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -90, y: -6, width: 180, align: "center",
        text: "PREMIUM", fontSize: 16, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "vegan") {
      mainShape = new Konva.Rect({
        x: -80, y: -20, width: 160, height: 40,
        cornerRadius: 18, fill: "#16a34a", stroke: "#15803d", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -80, y: -6, width: 160, align: "center",
        text: "VEGAN", fontSize: 16, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }
    if (type === "oferta") {
      mainShape = new Konva.Rect({
        x: -80, y: -20, width: 160, height: 40,
        cornerRadius: 8, fill: "#8b5cf6", stroke: "#7c3aed", strokeWidth: 2
      });
      text = new Konva.Text({
        x: -80, y: -6, width: 160, align: "center",
        text: "OFERTA", fontSize: 16, fontStyle: "bold", fill: "#ffffff", fontFamily: "Arial"
      });
    }

    if (!mainShape) return;
    mainShape.setAttr("isPresetPrimary", true);
    mainShape.setAttr("isPresetShape", true);
    if (mainShape.strokeScaleEnabled) mainShape.strokeScaleEnabled(false);
    if (text) text.setAttr("isPresetText", true);

    group.add(mainShape);
    if (text) group.add(text);

    // dzieci nie są przeciągane – grupą sterujemy całościowo
    group.getChildren().forEach(ch => {
      ch.draggable(false);
      ch.listening(true);
      ch.setAttr("isPresetChild", true);
    });

    group.setAttrs({
      isShape: true,
      isPreset: true,
      shapeType: "preset",
      presetType: type
    });

    layer.add(group);
    group.moveToTop();
    layer.batchDraw();
    page.transformerLayer.batchDraw();

    page.selectedNodes = [group];
    page.transformer.nodes([group]);
    document.activeStage = stage;
    if (window.showFloatingButtons) window.showFloatingButtons();
    updatePanelFromSelection();
  }

  function addFrame(type, pos) {
    const page = getActivePage();
    if (!page) {
      alert("Najpierw zaimportuj Excel lub dodaj stronę!");
      return;
    }

    const layer = page.layer;
    const stage = page.stage;
    const centerX = (pos && pos.x) ? pos.x : stage.width() / 2;
    const centerY = (pos && pos.y) ? pos.y : stage.height() / 2;

    const group = new Konva.Group({
      x: centerX,
      y: centerY,
      draggable: true,
      listening: true
    });

    let main = null;
    let shadow = null;

    if (type === "cardSoft") {
      shadow = new Konva.Rect({
        x: -120, y: -80, width: 240, height: 160,
        cornerRadius: 16, fill: "rgba(0,0,0,0.12)"
      });
      main = new Konva.Rect({
        x: -120, y: -88, width: 240, height: 160,
        cornerRadius: 16, fill: "#ffffff", stroke: "#e5e7eb", strokeWidth: 1
      });
    }
    if (type === "cardOutline") {
      main = new Konva.Rect({
        x: -120, y: -80, width: 240, height: 160,
        cornerRadius: 12, fill: "#ffffff", stroke: "#cbd5e1", strokeWidth: 2
      });
    }
    if (type === "photoFrame") {
      main = new Konva.Rect({
        x: -130, y: -90, width: 260, height: 180,
        cornerRadius: 8, fill: "#ffffff", stroke: "#111827", strokeWidth: 4
      });
    }
    if (type === "bannerBar") {
      main = new Konva.Rect({
        x: -150, y: -28, width: 300, height: 56,
        cornerRadius: 18, fill: "#0ea5e9", stroke: "#0284c7", strokeWidth: 2
      });
    }

    if (!main) return;
    if (shadow) {
      shadow.setAttr("isPresetShape", true);
      shadow.listening(true);
      shadow.draggable(false);
      if (shadow.strokeScaleEnabled) shadow.strokeScaleEnabled(false);
      group.add(shadow);
    }

    main.setAttr("isPresetPrimary", true);
    main.setAttr("isPresetShape", true);
    if (main.strokeScaleEnabled) main.strokeScaleEnabled(false);
    group.add(main);

    group.getChildren().forEach(ch => {
      ch.draggable(false);
      ch.listening(true);
      ch.setAttr("isPresetChild", true);
    });

    group.setAttrs({
      isShape: true,
      isPreset: true,
      shapeType: "frame",
      presetType: type
    });

    layer.add(group);
    group.moveToTop();
    layer.batchDraw();
    page.transformerLayer.batchDraw();

    page.selectedNodes = [group];
    page.transformer.nodes([group]);
    document.activeStage = stage;
    if (window.showFloatingButtons) window.showFloatingButtons();
    updatePanelFromSelection();
  }

  function getSelectedShapes() {
    const page = getActivePage();
    if (!page || !page.selectedNodes) return [];
    return page.selectedNodes.filter(n => n.getAttr && n.getAttr("isShape") === true);
  }

  // Udostępnij pomocniczo do globalnych handlerów (np. submenu hide)
  window._shapeToolsHasSelection = () => getSelectedShapes().length > 0;

  function updatePanelFromSelection() {
    const panel = ensurePanel();
    const shapes = getSelectedShapes();
    if (shapes.length === 0) {
      if (window._shapeToolsVisible) {
        window.hideSubmenu?.();
        window._shapeToolsVisible = false;
      }
      return;
    }

    showShapeTools(shapes);
  }

  function applyFill(color) {
    const shapes = getSelectedShapes();
    if (!shapes.length) return;
    shapes.forEach(s => {
      eachShapeNode(s, (node) => {
        if (isLineLike(node)) {
          node.stroke(color);
        } else if (node.fill) {
          node.fill(color);
        }
      });
      updatePresetTextColor(s, color);
    });
    const page = getActivePage();
    page?.layer.batchDraw();
  }

  function applyStroke(color) {
    const shapes = getSelectedShapes();
    if (!shapes.length) return;
    shapes.forEach(s => {
      eachShapeNode(s, (node) => {
        if (node.stroke) node.stroke(color);
      });
    });
    const page = getActivePage();
    page?.layer.batchDraw();
  }

  function applyStrokeWidth(w) {
    const shapes = getSelectedShapes();
    if (!shapes.length) return;
    shapes.forEach(s => {
      eachShapeNode(s, (node) => {
        if (node.strokeWidth) node.strokeWidth(w);
      });
    });
    const page = getActivePage();
    page?.layer.batchDraw();
  }

  function applyRadius(r) {
    const shapes = getSelectedShapes();
    if (!shapes.length) return;
    shapes.forEach(s => {
      eachShapeNode(s, (node) => {
        if (node.cornerRadius) node.cornerRadius(r);
      });
    });
    const page = getActivePage();
    page?.layer.batchDraw();
  }

  function applyOpacity(val) {
    const shapes = getSelectedShapes();
    if (!shapes.length) return;
    shapes.forEach(s => {
      s.opacity(val);
    });
    const page = getActivePage();
    page?.layer.batchDraw();
  }

  function applyDash(style) {
    const shapes = getSelectedShapes();
    if (!shapes.length) return;
    const dash = style === "dash" ? [10, 6] : style === "dot" ? [2, 6] : [];
    shapes.forEach(s => {
      eachShapeNode(s, (node) => {
        if (node.dash) node.dash(dash);
      });
    });
    const page = getActivePage();
    page?.layer.batchDraw();
  }

  function applyShadow(enabled, blur) {
    const shapes = getSelectedShapes();
    if (!shapes.length) return;
    shapes.forEach(s => {
      eachShapeNode(s, (node) => {
        if (!node.shadowColor) return;
        if (!enabled) {
          node.shadowOpacity(0);
          node.shadowBlur(0);
          return;
        }
        node.shadowColor("rgba(0,0,0,0.35)");
        node.shadowBlur(blur);
        node.shadowOffset({ x: 0, y: Math.round(blur / 3) });
        node.shadowOpacity(0.35);
      });
    });
    const page = getActivePage();
    page?.layer.batchDraw();
  }

  function showShapeTools(shapes) {
    const page = getActivePage();
    if (!page || !window.showSubmenu) return;

    const first = shapes[0];
    const primary = getPrimaryShape(first);
    const type = primary?.getAttr ? primary.getAttr("shapeType") : first.getAttr("shapeType");
    const isLine = isLineLike(primary || first);
    const isRect = isRectLike(primary || first);

    const fill = rgbToHexSafe(isLine ? (primary?.stroke?.() || first.stroke?.()) : (primary?.fill?.() || first.fill?.()));
    const stroke = rgbToHexSafe(primary?.stroke?.() || first.stroke?.());
    const strokeWidth = Math.round(primary?.strokeWidth ? primary.strokeWidth() : (first.strokeWidth ? first.strokeWidth() : 2));
    const radius = isRect ? (Array.isArray(primary?.cornerRadius?.()) ? primary.cornerRadius()[0] : (primary?.cornerRadius?.() || 0)) : 0;
    const opacity = Math.round(((first.opacity ? first.opacity() : 1) * 100));
    const dashArr = (primary?.dash && Array.isArray(primary.dash())) ? primary.dash() : [];
    const dashStyle = dashArr.length ? (dashArr[0] <= 3 ? "dot" : "dash") : "solid";
    const shadowBlur = Math.round(primary?.shadowBlur ? primary.shadowBlur() : 0);
    const shadowEnabled = shadowBlur > 0;

    // zabezpieczenie: nie skaluj obrysu podczas transformacji
    shapes.forEach(s => {
      eachShapeNode(s, (node) => {
        if (node.strokeScaleEnabled) node.strokeScaleEnabled(false);
      });
    });

    const html = `
      <div class="shape-bar">
        <div class="shape-bar-group">
          <span class="shape-bar-label">Wypełnienie</span>
          <input type="color" id="shapeFillQuick" class="shape-bar-color" value="${fill}">
        </div>

        <div class="shape-bar-group">
          <span class="shape-bar-label">Obrys</span>
          <input type="color" id="shapeStrokeQuick" class="shape-bar-color" value="${stroke}">
        </div>

        <div class="shape-bar-group">
          <span class="shape-bar-label">Grubość</span>
          <input type="range" id="shapeStrokeWidthQuick" class="shape-bar-range" min="0" max="14" step="1" value="${strokeWidth}">
        </div>

        <div class="shape-bar-group">
          <span class="shape-bar-label">Przezr.</span>
          <input type="range" id="shapeOpacityQuick" class="shape-bar-range" min="20" max="100" step="5" value="${opacity}">
        </div>

        <div class="shape-bar-group">
          <span class="shape-bar-label">Linia</span>
          <select id="shapeDashQuick" class="shape-bar-select">
            <option value="solid" ${dashStyle === "solid" ? "selected" : ""}>ciągła</option>
            <option value="dash" ${dashStyle === "dash" ? "selected" : ""}>kresk.</option>
            <option value="dot" ${dashStyle === "dot" ? "selected" : ""}>kropki</option>
          </select>
        </div>

        ${isRect ? `
        <div class="shape-bar-group">
          <span class="shape-bar-label">Zaokrąglenie</span>
          <input type="range" id="shapeRadiusQuick" class="shape-bar-range" min="0" max="40" step="1" value="${radius}">
        </div>` : ``}

        <div class="shape-bar-group">
          <span class="shape-bar-label">Cień</span>
          <input type="checkbox" id="shapeShadowToggle" ${shadowEnabled ? "checked" : ""}>
          <input type="range" id="shapeShadowBlur" class="shape-bar-range" min="0" max="30" step="2" value="${shadowBlur}">
        </div>

        <div class="shape-bar-swatches">
          <button class="shape-bar-swatch" data-fill="#ffffff"></button>
          <button class="shape-bar-swatch" data-fill="#111827"></button>
          <button class="shape-bar-swatch" data-fill="#3b82f6"></button>
          <button class="shape-bar-swatch" data-fill="#10b981"></button>
          <button class="shape-bar-swatch" data-fill="#f59e0b"></button>
          <button class="shape-bar-swatch" data-fill="#ef4444"></button>
        </div>
      </div>
    `;

    window.showSubmenu(html);
    window._shapeToolsVisible = true;

    const styleId = "shapeToolsStyle";
      if (!document.getElementById(styleId)) {
        const st = document.createElement("style");
        st.id = styleId;
        st.textContent = `
          #floatingSubmenu{border-radius:14px;padding:10px 14px;}
          #floatingSubmenu .shape-bar{
            display:flex;align-items:center;gap:16px;flex-wrap:wrap;min-width:560px;
          }
          #floatingSubmenu .shape-bar-group{
            display:flex;align-items:center;gap:8px;font-size:12.5px;color:#111827;font-weight:600;
            background:#f8fafc;border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;
          }
          #floatingSubmenu .shape-bar-label{color:#374151;font-weight:600;}
          #floatingSubmenu .shape-bar-color{
            width:24px;height:24px;border:none;background:transparent;cursor:pointer;
          }
          #floatingSubmenu .shape-bar-range{width:90px;}
          #floatingSubmenu .shape-bar-select{
            border:1px solid #e5e7eb;border-radius:8px;background:#fff;padding:4px 6px;font-size:12px;
          }
          #floatingSubmenu .shape-bar-swatches{
            display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;
          }
          #floatingSubmenu .shape-bar-swatch{
            width:20px;height:20px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;
        }
        #floatingSubmenu .shape-bar-swatch[data-fill="#111827"]{background:#111827;}
        #floatingSubmenu .shape-bar-swatch[data-fill="#3b82f6"]{background:#3b82f6;}
        #floatingSubmenu .shape-bar-swatch[data-fill="#10b981"]{background:#10b981;}
        #floatingSubmenu .shape-bar-swatch[data-fill="#f59e0b"]{background:#f59e0b;}
        #floatingSubmenu .shape-bar-swatch[data-fill="#ef4444"]{background:#ef4444;}
      `;
      document.head.appendChild(st);
    }

    document.getElementById("shapeFillQuick")?.addEventListener("input", (e) => applyFill(e.target.value));
    document.getElementById("shapeStrokeQuick")?.addEventListener("input", (e) => applyStroke(e.target.value));
    document.getElementById("shapeStrokeWidthQuick")?.addEventListener("input", (e) => applyStrokeWidth(parseInt(e.target.value, 10)));
    document.getElementById("shapeRadiusQuick")?.addEventListener("input", (e) => applyRadius(parseInt(e.target.value, 10)));
    document.getElementById("shapeOpacityQuick")?.addEventListener("input", (e) => applyOpacity(parseInt(e.target.value, 10) / 100));
    document.getElementById("shapeDashQuick")?.addEventListener("change", (e) => applyDash(e.target.value));
    document.getElementById("shapeShadowToggle")?.addEventListener("change", (e) => {
      const blur = parseInt(document.getElementById("shapeShadowBlur")?.value || "0", 10);
      applyShadow(e.target.checked, blur);
    });
    document.getElementById("shapeShadowBlur")?.addEventListener("input", (e) => {
      const enabled = document.getElementById("shapeShadowToggle")?.checked;
      applyShadow(enabled, parseInt(e.target.value, 10));
    });

    document.querySelectorAll(".shape-bar-swatch").forEach(sw => {
      sw.onclick = () => applyFill(sw.dataset.fill);
    });
  }

  function rgbToHexSafe(rgb) {
    if (!rgb) return "#111111";
    if (rgb[0] === "#") return rgb;
    const arr = rgb.match(/\d+/g);
    if (!arr) return "#111111";
    return "#" + arr.map(n => {
      const h = parseInt(n, 10).toString(16);
      return h.length === 1 ? "0" + h : h;
    }).join("");
  }

  function eachShapeNode(node, cb) {
    if (node instanceof Konva.Group) {
      node.getChildren().forEach(ch => {
        if (ch instanceof Konva.Text) return;
        cb(ch);
      });
      return;
    }
    cb(node);
  }

  function getPrimaryShape(node) {
    if (node instanceof Konva.Group) {
      const preferred = node.findOne(n => n.getAttr && n.getAttr("isPresetPrimary"));
      return preferred || node.findOne(n => !(n instanceof Konva.Text));
    }
    return node;
  }

  function isLineLike(node) {
    if (!node) return false;
    const t = node.getAttr && node.getAttr("shapeType");
    if (t === "line" || t === "arrow") return true;
    if (node instanceof Konva.Arrow) return true;
    if (node instanceof Konva.Line) {
      return !(node.closed && node.closed());
    }
    return false;
  }

  function isRectLike(node) {
    if (!node) return false;
    const t = node.getAttr && node.getAttr("shapeType");
    if (t === "rect" || t === "roundRect") return true;
    return node instanceof Konva.Rect;
  }

  function updatePresetTextColor(node, fillColor) {
    if (!(node instanceof Konva.Group)) return;
    if (!node.getAttr("isPreset")) return;
    const text = node.findOne(n => n.getAttr && n.getAttr("isPresetText"));
    if (!text) return;
    text.fill(getContrastColor(fillColor));
  }

  function getContrastColor(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return "#ffffff";
    const y = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    return y > 150 ? "#111827" : "#ffffff";
  }

  function hexToRgb(hex) {
    if (!hex) return null;
    const v = hex.replace("#", "");
    if (v.length !== 6) return null;
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16)
    };
  }

  function bindSidebar() {
    const btn = document.querySelector('.sidebar-item[title="Kształty"]');
    if (!btn || btn._shapeBound) return;
    btn._shapeBound = true;
    btn.addEventListener("click", () => {
      const panel = ensurePanel();
      if (panel._visible) {
        hidePanel(panel);
      } else {
        showPanel(panel);
      }
      updatePanelFromSelection();
    });
  }

  // Aktualizuj panel po kliknięciu na scenie (wybór obiektu)
  window.addEventListener("canvasCreated", (e) => {
    const stage = e.detail;
    stage.on("click.shapePanel tap.shapePanel", () => {
      setTimeout(updatePanelFromSelection, 0);
    });

    const container = stage.container();
    if (!container._shapeDropBound) {
      container._shapeDropBound = true;
      container.addEventListener("dragover", (ev) => {
        const dt = ev.dataTransfer;
        if (!dt) return;
        if (dt.types && (dt.types.includes("application/x-shape") || dt.types.includes("application/x-preset") || dt.types.includes("application/x-frame"))) {
          ev.preventDefault();
          dt.dropEffect = "copy";
        }
      });
      container.addEventListener("drop", (ev) => {
        const dt = ev.dataTransfer;
        if (!dt) return;
        const shapeType = dt.getData("application/x-shape");
        const presetType = dt.getData("application/x-preset");
        const frameType = dt.getData("application/x-frame");
        if (!shapeType && !presetType && !frameType) return;
        ev.preventDefault();
        document.activeStage = stage;
        stage.setPointersPositions(ev);
        const pos = stage.getPointerPosition();
        if (!pos) return;
        if (shapeType) addShape(shapeType, pos);
        if (presetType) addPreset(presetType, pos);
        if (frameType) addFrame(frameType, pos);
      });
    }
  });

  document.addEventListener("DOMContentLoaded", bindSidebar);
  window.addEventListener("excelImported", () => setTimeout(bindSidebar, 200));

  function showPanel(panel) {
    panel._visible = true;
    panel.style.left = "90px";
    if (panel._toggleBtn) {
      panel._toggleBtn.style.display = "flex";
      panel._toggleBtn.style.left = "400px";
      panel._toggleBtn.innerHTML = "⟨";
    }
  }

  function hidePanel(panel) {
    panel._visible = false;
    panel.style.left = "-320px";
    if (panel._toggleBtn) {
      panel._toggleBtn.style.left = "0px";
      panel._toggleBtn.innerHTML = "⟩";
      setTimeout(() => {
        if (!panel._visible) panel._toggleBtn.style.display = "none";
      }, 250);
    }
  }
})();
