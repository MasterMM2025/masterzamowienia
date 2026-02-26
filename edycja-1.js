// =======================================================
// edycja-1.js – Double Click Panel + FULL Undo/Redo Support
// =======================================================

// Konwersja rgb → hex
function rgbToHex(rgb) {
    if (!rgb) return "#ffffff";
    if (rgb[0] === "#") return rgb;
    const arr = rgb.match(/\d+/g);
    if (!arr) return "#ffffff";
    return "#" + arr.map(n => {
        const h = parseInt(n).toString(16);
        return h.length === 1 ? "0" + h : h;
    }).join("");
}

document.addEventListener("DOMContentLoaded", () => {

    let currentText = null;
    let currentBox = null;
    let currentPage = null;
    let currentStage = null;
    let boxChanged = false;
    let textChanged = false;

    // Panel
    const panel = document.createElement("div");
    panel.id = "simpleEditPanel";
    panel.style.cssText = `
      position: fixed;
      top: 120px;
      right: 20px;
      width: 360px;
      padding: 16px;
      background: #ffffff;
      border-radius: 14px;
      border: 1px solid #e7e7e7;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      z-index: 99999;
      display: none;
      font-family: Arial, sans-serif;
    `;

    panel.innerHTML = `
      <div class="edit-panel-header" style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px;">
        <div id="editPanelTitle" style="font-weight:700;font-size:16px;color:#111827;">Edytuj tekst</div>
        <button id="editPanelClose" aria-label="Zamknij" style="border:none;background:#f3f4f6;width:30px;height:30px;border-radius:10px;cursor:pointer;font-size:18px;line-height:1;">×</button>
      </div>

      <!-- TEKST -->
      <div id="textEditor" style="display:none;">
        <label style="font-weight:600;color:#374151;">Tekst:</label>
        <textarea id="textValue" style="width:100%;height:70px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;"></textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;">
          <div>
            <label style="font-weight:600;color:#374151;">Kolor:</label>
            <input type="color" id="textColor" style="width:100%;height:36px;">
          </div>
          <div>
            <label style="font-weight:600;color:#374151;">Rozmiar:</label>
            <input type="number" id="textSize" min="8" max="80" style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:8px;">
          </div>
        </div>

        <label style="margin-top:8px;font-weight:600;color:#374151;">Czcionka:</label>
        <select id="textFont" style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:8px;">
          <option value="Arial">Arial</option>
          <option value="Roboto">Roboto</option>
          <option value="Verdana">Verdana</option>
          <option value="Georgia">Georgia</option>
          <option value="Tahoma">Tahoma</option>
          <option value="Courier New">Courier New</option>
        </select>

        <label style="margin-top:8px;font-weight:600;color:#374151;">Styl:</label>
        <div class="text-style-group">
          <label class="toggle-btn" data-toggle="bold"><input type="checkbox" id="textBold"> B</label>
          <label class="toggle-btn" data-toggle="italic"><input type="checkbox" id="textItalic"> I</label>
          <label class="toggle-btn" data-toggle="underline"><input type="checkbox" id="textUnderline"> U</label>
        </div>

        <label style="margin-top:8px;font-weight:600;color:#374151;">Wyrównanie:</label>
        <div class="align-group">
          <button type="button" class="align-btn" data-align="left" title="Do lewej">⟵</button>
          <button type="button" class="align-btn" data-align="center" title="Wyśrodkuj">⇤⇥</button>
          <button type="button" class="align-btn" data-align="right" title="Do prawej">⟶</button>
        </div>
        <select id="textAlign" style="display:none;">
          <option value="left">Do lewej</option>
          <option value="center">Wyśrodkuj</option>
          <option value="right">Do prawej</option>
        </select>
      </div>

      <!-- BOX -->
      <div id="boxEditor" style="display:none;">
        <label style="font-weight:600;color:#374151;">Kolor obramowania:</label>
        <input type="color" id="boxStrokeColor" style="width:100%;height:38px;">

        <label style="font-weight:600;color:#374151;">Grubość obramowania:</label>
        <input type="number" id="boxStrokeWidth" min="0" max="20" style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

        <label style="font-weight:600;color:#374151;">Kolor tła:</label>
        <input type="color" id="boxFillColor" style="width:100%;height:38px;">

        <label style="font-weight:600;color:#374151;">Zaokrąglenie:</label>
        <input type="number" id="boxRadius" min="0" max="50" style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

        <button id="applyBoxToAll" style="margin-top:8px;width:100%;padding:9px;background:#00b37a;color:#fff;border:none;border-radius:6px;">
          Zastosuj do wszystkich boxów
        </button>
      </div>

      <!-- PAGE BG -->
<div id="pageEditor" style="display:none;">
    <label style="font-weight:600;color:#374151;">Kolor tła strony:</label>
    <input type="color" id="pageBgColor" style="width:100%;height:38px;">

    <label style="font-weight:600;color:#374151;">Przezroczystość:</label>
    <input type="number" id="pageOpacity" min="0" max="1" step="0.05" style="width:100%;padding:6px;border:1px solid #e5e7eb;border-radius:8px;">

    <button id="applyPageBgToAll" 
        style="margin-top:10px;width:100%;padding:9px;background:#ff9900;color:white;border:none;border-radius:6px;">
        Zastosuj tło do wszystkich stron
    </button>
</div>


      <button id="applyEdit" style="margin-top:12px;width:100%;padding:11px;background:#2563eb;color:white;border:none;border-radius:10px;font-weight:600;">
        Zastosuj
      </button>
    `;
    document.body.appendChild(panel);
    // Nie zamykaj panelu przy klikach w jego wnętrzu
    panel.addEventListener("mousedown", (e) => e.stopPropagation());
    panel.addEventListener("click", (e) => e.stopPropagation());

    // === Floating toolbar dla tekstu (Canva‑style) ===
    const syncTextBrushCursor = () => {
        const modeOn = !!window._textStyleBrushMode;
        document.body.style.cursor = modeOn ? "copy" : "";
        document.body.classList.toggle("text-brush-cursor", modeOn);
        if (Array.isArray(window.pages)) {
            window.pages.forEach(p => {
                const container = p?.stage?.container?.();
                if (container) container.style.cursor = modeOn ? "copy" : "default";
            });
        }
    };
    if (!document.getElementById("textBrushCursorStyle")) {
        const st = document.createElement("style");
        st.id = "textBrushCursorStyle";
        st.textContent = `
          body.text-brush-cursor,
          body.text-brush-cursor * {
            cursor: copy !important;
          }
        `;
        document.head.appendChild(st);
    }

    const getTextBrushStyle = (node) => ({
        fontFamily: node.fontFamily() || "Arial",
        fontSize: Math.round(node.fontSize() || 12),
        fill: node.fill() || "#000000",
        fontStyle: (node.fontStyle() || "").toLowerCase(),
        underline: !!node.getAttr("underline"),
        align: node.align() || "left"
    });

    const applyTextBrushStyle = (node, style) => {
        if (!node || !style) return;
        node.fontFamily(style.fontFamily || node.fontFamily());
        node.fontSize(Number(style.fontSize || node.fontSize() || 12));
        node.fill(style.fill || node.fill() || "#000000");
        node.fontStyle(style.fontStyle || "");
        node.setAttr("underline", !!style.underline);
        node.align(style.align || node.align() || "left");
    };

    window.showTextToolbar = (node) => {
        if (!node || !(node instanceof Konva.Text)) return;
        if (node.getParent && node.getParent().getAttr && node.getParent().getAttr("isPriceGroup")) return;
        if (!window.showSubmenu) return;

        // Jednorazowy "pędzel stylu" dla tekstu
        if (
            window._textStyleBrushMode &&
            window._textStyleBrush &&
            window._textStyleBrushSource &&
            node !== window._textStyleBrushSource
        ) {
            applyTextBrushStyle(node, window._textStyleBrush);
            node.getLayer()?.batchDraw();
            window.dispatchEvent(new CustomEvent("canvasModified", { detail: node.getStage() }));
            window._textStyleBrushMode = false;
            window._textStyleBrush = null;
            window._textStyleBrushSource = null;
            syncTextBrushCursor();
        }

        window._activeTextToolbarNode = node;
        window._textToolbarPinned = true;

        const font = node.fontFamily() || "Arial";
        const size = Math.round(node.fontSize() || 12);
        const fill = node.fill() || "#000000";
        const style = (node.fontStyle() || "").toLowerCase();
        const isBold = style.includes("bold");
        const isItalic = style.includes("italic");
        const isUnderline = !!node.getAttr("underline");
        const align = node.align() || "left";

        const html = `
          <div class="text-toolbar">
            <div class="text-tool">
              <select id="tbFont" class="tb-select" title="Czcionka">
                <option ${font==="Arial"?"selected":""}>Arial</option>
                <option ${font==="Roboto"?"selected":""}>Roboto</option>
                <option ${font==="Verdana"?"selected":""}>Verdana</option>
                <option ${font==="Georgia"?"selected":""}>Georgia</option>
                <option ${font==="Tahoma"?"selected":""}>Tahoma</option>
                <option ${font==="Courier New"?"selected":""}>Courier New</option>
              </select>
            </div>
            <span class="tb-sep"></span>
            <div class="text-tool tb-size">
              <button id="tbSizeDown" class="tb-btn" title="Zmniejsz">−</button>
              <input id="tbSize" class="tb-input" type="number" min="6" max="120" value="${size}" title="Rozmiar">
              <button id="tbSizeUp" class="tb-btn" title="Zwiększ">+</button>
            </div>
            <span class="tb-sep"></span>
            <div class="text-tool">
              <button id="tbColorBtn" class="tb-btn tb-color-btn" title="Kolor tekstu">
                <span class="tb-color-dot" style="background:${fill}"></span>
                A
              </button>
              <input id="tbColor" type="color" class="tb-color" value="${fill}" aria-label="Kolor tekstu">
            </div>
            <span class="tb-sep"></span>
            <div class="text-tool tb-toggle">
              <button id="tbBold" class="tb-btn ${isBold ? "is-on":""}" title="Pogrubienie">B</button>
              <button id="tbItalic" class="tb-btn ${isItalic ? "is-on":""}" title="Kursywa">I</button>
              <button id="tbUnderline" class="tb-btn ${isUnderline ? "is-on":""}" title="Podkreślenie">U</button>
            </div>
            <span class="tb-sep"></span>
            <div class="text-tool">
              <button id="tbStyleBrush" class="tb-btn ${window._textStyleBrushMode ? "is-on":""}" title="Kopiuj styl tekstu">🖌</button>
            </div>
            <span class="tb-sep"></span>
            <div class="text-tool tb-align">
              <button id="tbAlignLeft" class="tb-btn ${align==="left"?"is-on":""}" title="Do lewej" aria-label="Do lewej">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="2" y="3" width="10" height="2" fill="currentColor"/>
                  <rect x="2" y="7" width="7" height="2" fill="currentColor"/>
                  <rect x="2" y="11" width="12" height="2" fill="currentColor"/>
                </svg>
              </button>
              <button id="tbAlignCenter" class="tb-btn ${align==="center"?"is-on":""}" title="Wyśrodkuj" aria-label="Wyśrodkuj">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="3" y="3" width="10" height="2" fill="currentColor"/>
                  <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
                  <rect x="2" y="11" width="12" height="2" fill="currentColor"/>
                </svg>
              </button>
              <button id="tbAlignRight" class="tb-btn ${align==="right"?"is-on":""}" title="Do prawej" aria-label="Do prawej">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="4" y="3" width="10" height="2" fill="currentColor"/>
                  <rect x="7" y="7" width="7" height="2" fill="currentColor"/>
                  <rect x="2" y="11" width="12" height="2" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
        `;

        window.showSubmenu(html, { className: "text-toolbar-submenu", width: "auto", maxWidth: "96vw" });
        // nie zamykaj menu po kliknięciach w toolbar
        document.querySelectorAll("#floatingSubmenu .tb-btn, #floatingSubmenu .tb-select, #floatingSubmenu .tb-input")
          .forEach(el => el.addEventListener("click", (e) => e.stopPropagation()));
        const styleId = "textToolbarStyle";
        if (!document.getElementById(styleId)) {
            const st = document.createElement("style");
            st.id = styleId;
            st.textContent = `
              #floatingSubmenu.text-toolbar-submenu{
                padding:8px 10px;
                border-radius:14px;
              }
              #floatingSubmenu .text-toolbar{
                display:flex;align-items:center;gap:8px;
                padding:8px 12px;background:#fff;border-radius:12px;
                box-shadow:0 8px 22px rgba(0,0,0,0.14);
                border:1px solid #e5e7eb;
              }
              #floatingSubmenu .text-tool{display:flex;align-items:center;gap:6px;}
              #floatingSubmenu .tb-sep{width:1px;height:24px;background:#e5e7eb;display:inline-block;}
              #floatingSubmenu .tb-select{padding:6px 10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font-size:12.5px;color:#111827;}
              #floatingSubmenu .tb-input{width:54px;padding:6px 6px;border:1px solid #e5e7eb;border-radius:10px;text-align:center;font-size:12.5px;}
              #floatingSubmenu .tb-btn{padding:6px 8px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;font-weight:700;cursor:pointer;color:#111827;min-width:30px;}
              #floatingSubmenu .tb-btn.is-on{background:#eef2ff;border-color:#c7d2fe;color:#1d4ed8;}
              #floatingSubmenu .tb-color{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none;}
              #floatingSubmenu .tb-color-btn{display:flex;align-items:center;gap:6px;}
              #floatingSubmenu .tb-color-dot{width:12px;height:12px;border-radius:4px;border:1px solid #cbd5e1;display:inline-block;}
            `;
            document.head.appendChild(st);
        }

        const applyToNode = (fn) => {
            const t = window._activeTextToolbarNode;
            if (!t) return;
            fn(t);
            t.getLayer()?.batchDraw();
            window.dispatchEvent(new CustomEvent("canvasModified",{detail:t.getStage()}));
        };

        document.getElementById("tbFont")?.addEventListener("change", (e) => {
            applyToNode(t => t.fontFamily(e.target.value));
        });
        document.getElementById("tbSizeDown")?.addEventListener("click", () => {
            const input = document.getElementById("tbSize");
            input.value = Math.max(6, Number(input.value) - 1);
            applyToNode(t => t.fontSize(Number(input.value)));
        });
        document.getElementById("tbSizeUp")?.addEventListener("click", () => {
            const input = document.getElementById("tbSize");
            input.value = Math.min(120, Number(input.value) + 1);
            applyToNode(t => t.fontSize(Number(input.value)));
        });
        document.getElementById("tbSize")?.addEventListener("input", (e) => {
            applyToNode(t => t.fontSize(Number(e.target.value)));
        });
        document.getElementById("tbColorBtn")?.addEventListener("click", () => {
            document.getElementById("tbColor")?.click();
        });
        document.getElementById("tbColor")?.addEventListener("input", (e) => {
            const val = e.target.value;
            const dot = document.querySelector("#floatingSubmenu .tb-color-dot");
            if (dot) dot.style.background = val;
            applyToNode(t => t.fill(val));
        });
        document.getElementById("tbBold")?.addEventListener("click", (e) => {
            e.currentTarget.classList.toggle("is-on");
            applyToNode(t => {
                let s = (t.fontStyle() || "").toLowerCase();
                const boldOn = e.currentTarget.classList.contains("is-on");
                s = s.replace("bold","").trim();
                if (boldOn) s = (s + " bold").trim();
                t.fontStyle(s);
            });
        });
        document.getElementById("tbItalic")?.addEventListener("click", (e) => {
            e.currentTarget.classList.toggle("is-on");
            applyToNode(t => {
                let s = (t.fontStyle() || "").toLowerCase();
                const itOn = e.currentTarget.classList.contains("is-on");
                s = s.replace("italic","").trim();
                if (itOn) s = (s + " italic").trim();
                t.fontStyle(s);
            });
        });
        document.getElementById("tbUnderline")?.addEventListener("click", (e) => {
            e.currentTarget.classList.toggle("is-on");
            applyToNode(t => t.setAttr("underline", e.currentTarget.classList.contains("is-on")));
        });
        document.getElementById("tbStyleBrush")?.addEventListener("click", (e) => {
            const btn = e.currentTarget;
            if (window._textStyleBrushMode) {
                window._textStyleBrushMode = false;
                window._textStyleBrush = null;
                window._textStyleBrushSource = null;
                btn.classList.remove("is-on");
                syncTextBrushCursor();
                return;
            }
            window._textStyleBrush = getTextBrushStyle(window._activeTextToolbarNode);
            window._textStyleBrushSource = window._activeTextToolbarNode;
            window._textStyleBrushMode = true;
            btn.classList.add("is-on");
            syncTextBrushCursor();
        });
        document.getElementById("tbAlignLeft")?.addEventListener("click", () => {
            applyToNode(t => t.align("left"));
            window.showTextToolbar(window._activeTextToolbarNode);
        });
        document.getElementById("tbAlignCenter")?.addEventListener("click", () => {
            applyToNode(t => t.align("center"));
            window.showTextToolbar(window._activeTextToolbarNode);
        });
        document.getElementById("tbAlignRight")?.addEventListener("click", () => {
            applyToNode(t => t.align("right"));
            window.showTextToolbar(window._activeTextToolbarNode);
        });
    };

    window.hideTextToolbar = () => {
        if (window._activeTextToolbarNode) window._activeTextToolbarNode = null;
        window._textToolbarPinned = false;
        window._textStyleBrushMode = false;
        window._textStyleBrush = null;
        window._textStyleBrushSource = null;
        syncTextBrushCursor();
        window.hideSubmenu?.();
    };

    if (!document.getElementById("textEditPanelStyle")) {
      const st = document.createElement("style");
      st.id = "textEditPanelStyle";
      st.textContent = `
        .text-style-group{display:flex;gap:8px;margin-top:4px;}
        .toggle-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;color:#111827;font-weight:700;cursor:pointer;user-select:none;min-width:38px;}
        .toggle-btn input{display:none;}
        .toggle-btn.is-on{background:#eef2ff;border-color:#c7d2fe;color:#1d4ed8;}
        .align-group{display:flex;gap:8px;margin-top:4px;}
        .align-btn{border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;padding:6px 10px;cursor:pointer;font-weight:700;color:#111827;min-width:44px;}
        .align-btn.is-on{background:#eef2ff;border-color:#c7d2fe;color:#1d4ed8;}
      `;
      document.head.appendChild(st);
    }

    const syncTextStyleUI = () => {
        const bold = document.getElementById("textBold");
        const italic = document.getElementById("textItalic");
        const underline = document.getElementById("textUnderline");
        const align = document.getElementById("textAlign");
        const map = [
          { el: bold, sel: '.toggle-btn[data-toggle="bold"]' },
          { el: italic, sel: '.toggle-btn[data-toggle="italic"]' },
          { el: underline, sel: '.toggle-btn[data-toggle="underline"]' }
        ];
        map.forEach(m => {
          const btn = panel.querySelector(m.sel);
          if (!btn || !m.el) return;
          btn.classList.toggle("is-on", !!m.el.checked);
        });
        panel.querySelectorAll(".align-btn").forEach(b => {
          b.classList.toggle("is-on", align && b.dataset.align === align.value);
        });
    };

    // Zamknij systemowy picker koloru po wyborze, żeby nie blokował przycisków
    const autoCloseColorPicker = (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const close = () => { try { el.blur(); } catch (e) {} };
      el.addEventListener("input", () => requestAnimationFrame(close));
      el.addEventListener("change", () => requestAnimationFrame(close));
    };
    autoCloseColorPicker("boxStrokeColor");
    autoCloseColorPicker("boxFillColor");
    autoCloseColorPicker("pageBgColor");

    // Klik poza pickerem — zamknij aktywny color input
    if (!window._colorPickerCloseBound) {
      document.addEventListener("mousedown", (e) => {
        const active = document.activeElement;
        if (active && active.type === "color") {
          if (e.target !== active) {
            try { active.blur(); } catch (err) {}
          }
        }
      }, true);
      window._colorPickerCloseBound = true;
    }

    ["textBold","textItalic","textUnderline"].forEach(id => {
        document.getElementById(id).addEventListener("change", syncTextStyleUI);
    });
    panel.querySelectorAll(".align-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const align = document.getElementById("textAlign");
            align.value = btn.dataset.align;
            textChanged = true;
            syncTextStyleUI();
        });
    });

    document.getElementById("editPanelClose").onclick = () => {
        panel.style.display = "none";
        currentText = null;
        currentBox = null;
        currentPage = null;
        currentStage = null;
    };

    // === PUBLIC: pokaż panel tylko dla tekstu (bez dblclick) ===
    window.openTextPanel = (node, stage) => {
        if (!node || !(node instanceof Konva.Text)) return;
        if (node.getParent && node.getParent().getAttr && node.getParent().getAttr("isPriceGroup")) return;
        if (typeof window.showTextToolbar === "function") {
            window.showTextToolbar(node);
            if (panel) panel.style.display = "none";
            currentText = node;
            currentStage = stage || document.activeStage || node.getStage();
            return;
        }

        currentStage = stage || document.activeStage || node.getStage();
        currentText = node;
        currentBox = null;
        currentPage = null;
        textChanged = false;
        boxChanged = false;

        const title = document.getElementById("editPanelTitle");
        if (title) title.textContent = "Edytuj tekst";
        const applyBtn = document.getElementById("applyEdit");
        if (applyBtn) applyBtn.textContent = "Zastosuj tekst";
        panel.style.display = "block";
        document.getElementById("textEditor").style.display = "block";
        document.getElementById("boxEditor").style.display = "none";
        document.getElementById("pageEditor").style.display = "none";

        document.getElementById("textValue").value = node.text();
        document.getElementById("textColor").value = node.fill();
        document.getElementById("textSize").value = node.fontSize();
        document.getElementById("textFont").value = node.fontFamily();
        document.getElementById("textBold").checked = node.fontStyle().includes("bold");
        document.getElementById("textItalic").checked = node.fontStyle().includes("italic");
        document.getElementById("textUnderline").checked = node.getAttr("underline") || false;
        document.getElementById("textAlign").value = node.align();
        // odśwież styl przycisków
        const evt = new Event("change");
        document.getElementById("textBold").dispatchEvent(evt);
        document.getElementById("textItalic").dispatchEvent(evt);
        document.getElementById("textUnderline").dispatchEvent(evt);
        panel.querySelectorAll(".align-btn").forEach(btn => {
            btn.classList.toggle("is-on", btn.dataset.align === node.align());
        });
    };

    window.hideTextPanel = () => {
        if (panel) panel.style.display = "none";
        currentText = null;
    };

    // — Mark changes
    [
      "textValue","textColor","textSize","textFont","textBold","textItalic","textUnderline","textAlign",
      "boxStrokeColor","boxStrokeWidth","boxFillColor","boxRadius"
    ].forEach(id => {
        document.getElementById(id).addEventListener("input", () => {
            if (id.startsWith("text")) textChanged = true;
            if (id.startsWith("box")) boxChanged = true;
        });
    });

    // =================================
    // DOUBLE CLICK HANDLER
    // =================================
    window.addEventListener("canvasCreated", e => {
        const stage = e.detail;

        stage.on("dblclick.edit", ev => {
            ev.evt.preventDefault();
            document.activeStage = stage;

            const node = ev.target;
            currentStage = stage;
            currentText = null;
            currentBox = null;
            currentPage = null;
            panel.style.display = "block";
            boxChanged = false;
            textChanged = false;

            const page = pages.find(p => p.stage === stage);
            const isTextNode = node instanceof Konva.Text;
            const isBoxNode = node instanceof Konva.Rect && node.getAttr("isBox");
            const isPageNode = (node === stage || node.getAttr("isPageBg") === true);

            // ✅ Tekst edytujemy inline (Canva‑style) – panel boczny się nie pokazuje
            if (isTextNode) {
                panel.style.display = "none";
                currentText = null;
                currentBox = null;
                currentPage = null;
                currentStage = null;
                return;
            }

            // ⛔ Nie pokazuj panelu dla innych elementów (np. obraz/QR/EAN)
            if (!isTextNode && !isBoxNode && !isPageNode) {
                panel.style.display = "none";
                currentText = null;
                currentBox = null;
                currentPage = null;
                currentStage = null;
                return;
            }

            if (isTextNode) {
                currentText = node;
                document.getElementById("textEditor").style.display = "block";
                document.getElementById("boxEditor").style.display = "none";
                document.getElementById("pageEditor").style.display = "none";

                document.getElementById("textValue").value = node.text();
                document.getElementById("textColor").value = node.fill();
                document.getElementById("textSize").value = node.fontSize();
                document.getElementById("textFont").value = node.fontFamily();
                document.getElementById("textBold").checked = node.fontStyle().includes("bold");
                document.getElementById("textItalic").checked = node.fontStyle().includes("italic");
                document.getElementById("textUnderline").checked = node.getAttr("underline") || false;
                document.getElementById("textAlign").value = node.align();
                return;
            }

            if (isBoxNode) {
                currentBox = node;
                const title = document.getElementById("editPanelTitle");
                if (title) title.textContent = "Edytuj box";
                const applyBtn = document.getElementById("applyEdit");
                if (applyBtn) applyBtn.textContent = "Zastosuj box";
                document.getElementById("textEditor").style.display = "none";
                document.getElementById("boxEditor").style.display = "block";
                document.getElementById("pageEditor").style.display = "none";

                document.getElementById("boxStrokeColor").value = node.stroke() || "#cccccc";
                document.getElementById("boxStrokeColor").dispatchEvent(new Event("input", { bubbles: true }));
                document.getElementById("boxStrokeWidth").value = node.strokeWidth() || 2;
                document.getElementById("boxFillColor").value = node.fill() || "#ffffff";
                document.getElementById("boxFillColor").dispatchEvent(new Event("input", { bubbles: true }));
                document.getElementById("boxRadius").value = node.cornerRadius() || 0;
                return;
            }

            if (isPageNode) {
                currentPage = page;
                const title = document.getElementById("editPanelTitle");
                if (title) title.textContent = "Edytuj tło strony";
                const applyBtn = document.getElementById("applyEdit");
                if (applyBtn) applyBtn.textContent = "Zastosuj tło";
                const wrapper = page.container.querySelector(".canvas-wrapper");
                const cs = getComputedStyle(wrapper);
                document.getElementById("pageEditor").style.display = "block";
                document.getElementById("boxEditor").style.display = "none";
                document.getElementById("textEditor").style.display = "none";

                document.getElementById("pageBgColor").value = rgbToHex(cs.backgroundColor);
                document.getElementById("pageBgColor").dispatchEvent(new Event("input", { bubbles: true }));
                document.getElementById("pageOpacity").value = parseFloat(cs.opacity) || 1;
            }
            // === TŁO STRONY — kliknięto w Stage albo w bgRect ===
if (node === stage || node.getAttr("isPageBg") === true) {

    currentPage = pages.find(p => p.stage === stage);
    if (!currentPage) return;

    const wrapper = currentPage.container.querySelector(".canvas-wrapper");
    const cs = getComputedStyle(wrapper);

    document.getElementById("pageEditor").style.display = "block";
    document.getElementById("boxEditor").style.display = "none";
    document.getElementById("textEditor").style.display = "none";

    document.getElementById("pageBgColor").value = rgbToHex(cs.backgroundColor);
    document.getElementById("pageBgColor").dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("pageOpacity").value = parseFloat(cs.opacity) || 1;

    panel.style.display = "block";
    return;
}

        });
    });

    // ===================
    // APPLY (ZATWIERDŹ)
    // ===================
    document.getElementById("applyEdit").onclick = () => {

        if (currentText && textChanged) {
            currentText.text(document.getElementById("textValue").value);
            currentText.fill(document.getElementById("textColor").value);
            currentText.fontSize(Number(document.getElementById("textSize").value));
            currentText.fontFamily(document.getElementById("textFont").value);

            let style = "";
            if (document.getElementById("textBold").checked) style += "bold ";
            if (document.getElementById("textItalic").checked) style += "italic";
            currentText.fontStyle(style.trim());
            currentText.setAttr("underline", document.getElementById("textUnderline").checked);
            currentText.align(document.getElementById("textAlign").value);

            currentText.getLayer().batchDraw();
            window.dispatchEvent(new CustomEvent("canvasModified",{detail:currentStage}));
        }

        if (currentBox && boxChanged) {
            currentBox.stroke(document.getElementById("boxStrokeColor").value);
            currentBox.strokeWidth(Number(document.getElementById("boxStrokeWidth").value));
            currentBox.fill(document.getElementById("boxFillColor").value);
            currentBox.cornerRadius(Number(document.getElementById("boxRadius").value));
            currentBox.getLayer().batchDraw();
            window.dispatchEvent(new CustomEvent("canvasModified",{detail:currentStage}));
        }

        if (currentPage) {
    const bg = document.getElementById("pageBgColor").value;
    const opacity = Number(document.getElementById("pageOpacity").value);

    const bgRect = currentPage.stage.findOne(n => n.getAttr('isPageBg') === true);

    if (bgRect) {
        bgRect.fill(bg);
        bgRect.opacity(opacity);
        bgRect.moveToBottom();
        bgRect.getLayer().batchDraw();
    }

    // 🔥 usuń CSS — tylko Konva decyduje
    const wrapper = currentPage.container.querySelector(".canvas-wrapper");
    wrapper.style.background = "transparent";
    wrapper.style.opacity = 1;

    const canvas = currentPage.stage.container().querySelector(".konvajs-content");
    if (canvas) {
        canvas.style.background = "transparent";
        canvas.style.opacity = 1;
    }

    currentPage.layer.draw(); // 🔥 pełne odświeżenie!
    window.dispatchEvent(new CustomEvent("canvasModified",{detail:currentStage}));
    panel.style.display = "none";
}


        panel.style.display = "none";
    };

   // ==============================
// ZASTOSUJ DLA WSZYSTKICH BOXÓW
// ==============================
document.getElementById("applyBoxToAll").onclick = () => {
    if (!currentStage || !boxChanged) return;
    const page = pages.find(p=>p.stage===currentStage);
    const stroke=document.getElementById("boxStrokeColor").value;
    const width=Number(document.getElementById("boxStrokeWidth").value);
    const fill=document.getElementById("boxFillColor").value;
    const radius=Number(document.getElementById("boxRadius").value);

    page.layer.getChildren().forEach(n=>{
        if(n.getAttr("isBox")){
            n.stroke(stroke);
            n.strokeWidth(width);
            n.fill(fill);
            n.cornerRadius(radius);
        }
    });

    page.layer.batchDraw();
    window.dispatchEvent(new CustomEvent("canvasModified",{detail:currentStage}));
    panel.style.display="none";
};


// ==============================
// ZASTOSUJ TŁO STRONY — DO WSZYSTKICH STRON
// ==============================
document.getElementById("applyPageBgToAll").onclick = () => {

    if (!currentStage) return;

    const bg = document.getElementById("pageBgColor").value;
    const opacity = Number(document.getElementById("pageOpacity").value);

    pages.forEach(p => {
        const bgRect = p.stage.findOne(n => n.getAttr('isPageBg') === true);
        if (!bgRect) return;

        bgRect.fill(bg);
        bgRect.opacity(opacity);
        bgRect.moveToBottom();
        bgRect.getLayer().batchDraw();

        const wrapper = p.container.querySelector(".canvas-wrapper");
        wrapper.style.background = "transparent";
        wrapper.style.opacity = 1;

        const canvas = p.stage.container().querySelector(".konvajs-content");
        if (canvas) {
            canvas.style.background = "transparent";
            canvas.style.opacity = 1;
        }
    });

    pages.forEach(p => p.layer.draw()); // 🔥 pełne odświeżenie!

    window.dispatchEvent(new CustomEvent("canvasModified",{detail:currentStage}));
    panel.style.display = "none";
};
});
// dziala poprawnie
