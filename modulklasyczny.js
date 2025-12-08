// ========================================================================
// modulklasyczny.js – SYSTEM WYBORU STYLU + 3 LAYOUTY + PRZEBUDOWA STRONY
// ========================================================================
console.log("🔥 modulklasyczny.js ZAŁADOWANY I NADPISUJĘ drawPage!");

// 3 GOTOWE STYLE STRONY
window.catalogStyles = {
    standard: {
        name: "Standardowy (A4)",
        width: 794,
        height: 1123,
        cols: 2,
        rows: 3,
        ml: 14,
        mt: 140,
        mb: 28,
        gap: 6
    },

    klasyczny: {
        name: "Klasyczny 230×320 mm",
        width: 2300,
        height: 3200,
        cols: 2,
        rows: 3,
        ml: 40,
        mt: 180,
        mb: 40,
        gap: 16
    },

    szeroki3: {
        name: "Szeroki – 3 kolumny",
        width: 1100, 
        height: 1500,
        cols: 3,
        rows: 3,
        ml: 20,
        mt: 120,
        mb: 30,
        gap: 10
    }
};

window.currentCatalogStyle = "standard";


// ========================================================================
// 1) OKNO USTAWIEŃ UKŁADU
// ========================================================================
(function buildCatalogSettingsModal() {
    if (document.getElementById("catalogModal")) return;

    const modal = document.createElement("div");
    modal.id = "catalogModal";
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.55);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 999999;
    `;

    modal.innerHTML = `
        <div style="
            width: 420px;
            background: #fff;
            border-radius: 12px;
            padding: 25px;
            font-family: Arial;
            box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        ">
            <h2 style="margin-top:0;">Ustawienia katalogu</h2>

            <label style="font-size:16px;font-weight:600;">Wybierz styl układu:</label>
            <div style="margin:12px 0; line-height:1.8;">
                <label><input type="radio" name="catalogStyle" value="standard" checked> Standardowy (A4)</label><br>
                <label><input type="radio" name="catalogStyle" value="klasyczny"> Klasyczny 230×320 mm</label><br>
                <label><input type="radio" name="catalogStyle" value="szeroki3"> Szeroki – 3 kolumny</label>
            </div>

            <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px;">
                <button id="modalCancel"
                    style="padding:8px 14px;border:none;background:#ccc;border-radius:6px;cursor:pointer;">
                    Anuluj
                </button>
                <button id="modalApply"
                    style="padding:8px 14px;border:none;background:#007cba;color:white;border-radius:6px;cursor:pointer;">
                    Zastosuj
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("catalogSettingsBtn").onclick = () => {
        modal.style.display = "flex";
    };

    modal.querySelector("#modalCancel").onclick = () => {
        modal.style.display = "none";
    };

    modal.querySelector("#modalApply").onclick = () => {
        const chosen = document.querySelector('input[name="catalogStyle"]:checked').value;
        window.currentCatalogStyle = chosen;
        modal.style.display = "none";
        applyCatalogStyle(chosen);
    };
})();


// ========================================================================
// 2) PRZEBUDOWA STRONY PO ZMIANIE STYLU
// ========================================================================
window.applyCatalogStyle = function(styleKey) {
    const s = window.catalogStyles[styleKey];
    if (!s) return;

    console.log("🔄 Zmieniam układ na:", s.name);

    // ustawiamy nowe globalne parametry
    window.W = s.width;
    window.H = s.height;

    window.ML = s.ml;
    window.MT = s.mt;
    window.MB = s.mb;
    window.COLS = s.cols;
    window.ROWS = s.rows;
    window.GAP = s.gap;

    window.BW = (W - ML * 2 - GAP) / COLS;
    window.BH = (H - MT - MB - GAP * (ROWS - 1)) / ROWS;


    // ====================================================================
    // 🔥 PRZEBUDOWA KAŻDEJ ISTNIEJĄCEJ STRONY
    // ====================================================================
    pages.forEach(page => {

        // ----------------------------------------------------------------
        // 1) ZMIANA ROZMIARU KONVA + POPRAWKA WRAPPERA (USUWA BIAŁE LINIE)
        // ----------------------------------------------------------------
        page.stage.width(W);
        page.stage.height(H);

        const wrapper = page.container.querySelector(".canvas-wrapper");
        if (wrapper) {
            wrapper.style.width = `${W}px`;
            wrapper.style.height = `${H}px`;
            wrapper.style.overflow = "hidden";
        }

        // ----------------------------------------------------------------
        // 2) USUNIĘCIE TYLKO ELEMENTÓW AUTOMATYCZNYCH (layoutu)
        // ----------------------------------------------------------------
        page.layer.getChildren().forEach(n => {
    if (
        n.getAttr("isBox") ||
        n.getAttr("isName") ||
        n.getAttr("isIndex") ||
        n.getAttr("isPrice") ||
        n.getAttr("isProductImage") ||
        n.getAttr("isBarcode")
    ) {
        n.destroy();
    }
});


        // NIE ruszamy:
        // - droppedImage
        // - ręcznych tekstów
        // - bannerów
        // - elementów ze schowka
        // - dekoracji użytkownika

        // ----------------------------------------------------------------
        // 3) RYSUJEMY NOWY UKŁAD PUDEŁEK
        // ----------------------------------------------------------------
        drawPage(page);

        // ----------------------------------------------------------------
        // 4) RĘCZNE OBIEKTY IDĄ NA WIERZCH
        // ----------------------------------------------------------------
        page.layer.find("*").forEach(n => {
            if (n.getAttr("slotIndex") == null && !n.getAttr("isPageBg")) {
                n.moveToTop();
            }
        });

        page.layer.batchDraw();
        page.transformerLayer.batchDraw();
    });

    console.log("✅ Styl aktywowany:", s.name);
    
};
// ========================================================================
// NADPISANIE drawPage() – NOWA WERSJA OBSŁUGUJĄCA 3 KOLUMNY
// ========================================================================
window.drawPage = function (page) {
    console.log("🔥 AKTYWNY UKŁAD 3×3 (SCREEN STYLE)");

    const { layer, products, settings } = page;

    // Usuń automatyczne elementy
    layer.getChildren().forEach(n => {
        if (n.getAttr("autoElement")) n.destroy();
    });

    // 3×3 = 9 produktów
    const ITEMS = 9;
    const pageProducts = products.slice(0, ITEMS);

    // Proporcje podobne do twojego screenshotu
    const COLS = 3;
    const ROWS = 3;

    // Marginesy dopasowane pod SCREEN
    const ML = 40;
    const MT = 120;
    const GAP = 35;

    const BW = (W - ML * 2 - GAP * (COLS - 1)) / COLS;
    const BH = (H - MT - GAP * (ROWS - 1) - 100) / ROWS; // 100px pod kontrolek

    pageProducts.forEach((p, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);

        const x = ML + col * (BW + GAP);
        const y = MT + row * (BH + GAP);

        // === BOX ===
        const box = new Konva.Rect({
            x, y,
            width: BW,
            height: BH,
            cornerRadius: 8,
            stroke: "#C8C7C7",
            strokeWidth: 3,
            fill: "#fff",
            autoElement: true
        });
        layer.add(box);

        // === NAZWA ===
        const nameText = new Konva.Text({
            x: x + 20,
            y: y + 25,
            width: BW - 40,
            text: p.NAZWA || "",
            fontSize: 22,
            fontFamily: "Arial",
            fontStyle: "bold",
            align: "center",
            fill: "#333",
            autoElement: true
        });
        layer.add(nameText);

        // === INDEKS ===
        const indexText = new Konva.Text({
            x: x + 20,
            y: y + 85,
            width: BW - 40,
            text: `Indeks: ${p.INDEKS || "-"}`,
            fontSize: 22,
            fontFamily: "Arial",
            align: "center",
            fill: "#333",
            autoElement: true
        });
        layer.add(indexText);

        // === BARCODE ===
        if (p["KOD EAN"]) {
            window.generateBarcode(p["KOD EAN"], data => {
                Konva.Image.fromURL(data, img => {
                    img.x(x + BW / 2 - 90);
                    img.y(y + BH - 95); // idealne pod twoje proporcje
                    img.scale({ x: 0.85, y: 0.85 });
                    img.setAttr("autoElement", true);
                    layer.add(img);
                    layer.batchDraw();
                });
            });
        }
    });

    layer.batchDraw();
};

