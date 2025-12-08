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
      background: white;
      border-radius: 10px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.25);
      z-index: 99999;
      display: none;
      font-family: Arial, sans-serif;
    `;

    panel.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:16px;">Edytuj element</h3>

      <!-- TEKST -->
      <div id="textEditor" style="display:none;">
        <label>Tekst:</label>
        <textarea id="textValue" style="width:100%;height:70px;"></textarea>

        <label>Kolor:</label>
        <input type="color" id="textColor" style="width:100%;height:36px;">

        <label>Rozmiar:</label>
        <input type="number" id="textSize" min="8" max="80" style="width:100%;padding:6px;">

        <label>Czcionka:</label>
        <select id="textFont" style="width:100%;padding:6px;">
          <option value="Arial">Arial</option>
          <option value="Roboto">Roboto</option>
          <option value="Verdana">Verdana</option>
          <option value="Georgia">Georgia</option>
          <option value="Tahoma">Tahoma</option>
          <option value="Courier New">Courier New</option>
        </select>

        <label>Styl:</label>
        <div style="display:flex;gap:8px;">
          <label><input type="checkbox" id="textBold"> B</label>
          <label><input type="checkbox" id="textItalic"> I</label>
          <label><input type="checkbox" id="textUnderline"> U</label>
        </div>

        <label>Wyrównanie:</label>
        <select id="textAlign" style="width:100%;padding:6px;">
          <option value="left">Do lewej</option>
          <option value="center">Wyśrodkuj</option>
          <option value="right">Do prawej</option>
        </select>
      </div>

      <!-- BOX -->
      <div id="boxEditor" style="display:none;">
        <label>Kolor obramowania:</label>
        <input type="color" id="boxStrokeColor" style="width:100%;height:38px;">

        <label>Grubość obramowania:</label>
        <input type="number" id="boxStrokeWidth" min="0" max="20" style="width:100%;padding:6px;">

        <label>Kolor tła:</label>
        <input type="color" id="boxFillColor" style="width:100%;height:38px;">

        <label>Zaokrąglenie:</label>
        <input type="number" id="boxRadius" min="0" max="50" style="width:100%;padding:6px;">

        <button id="applyBoxToAll" style="margin-top:8px;width:100%;padding:9px;background:#00b37a;color:#fff;border:none;border-radius:6px;">
          Zastosuj do wszystkich boxów
        </button>
      </div>

      <!-- PAGE BG -->
<div id="pageEditor" style="display:none;">
    <label>Kolor tła strony:</label>
    <input type="color" id="pageBgColor" style="width:100%;height:38px;">

    <label>Przezroczystość:</label>
    <input type="number" id="pageOpacity" min="0" max="1" step="0.05" style="width:100%;padding:6px;">

    <button id="applyPageBgToAll" 
        style="margin-top:10px;width:100%;padding:9px;background:#ff9900;color:white;border:none;border-radius:6px;">
        Zastosuj tło do wszystkich stron
    </button>
</div>


      <button id="applyEdit" style="margin-top:12px;width:100%;padding:11px;background:#007cba;color:white;border:none;border-radius:6px;">
        Zastosuj
      </button>
    `;
    document.body.appendChild(panel);

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

            if (node instanceof Konva.Text) {
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

            if (node instanceof Konva.Rect && node.getAttr("isBox")) {
                currentBox = node;
                document.getElementById("textEditor").style.display = "none";
                document.getElementById("boxEditor").style.display = "block";
                document.getElementById("pageEditor").style.display = "none";

                document.getElementById("boxStrokeColor").value = node.stroke() || "#cccccc";
                document.getElementById("boxStrokeWidth").value = node.strokeWidth() || 2;
                document.getElementById("boxFillColor").value = node.fill() || "#ffffff";
                document.getElementById("boxRadius").value = node.cornerRadius() || 0;
                return;
            }

            if (node === stage || node.getAttr("isPageBg") === true) {
                currentPage = page;
                const wrapper = page.container.querySelector(".canvas-wrapper");
                const cs = getComputedStyle(wrapper);
                document.getElementById("pageEditor").style.display = "block";
                document.getElementById("boxEditor").style.display = "none";
                document.getElementById("textEditor").style.display = "none";

                document.getElementById("pageBgColor").value = rgbToHex(cs.backgroundColor);
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