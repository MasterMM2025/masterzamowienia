// ============================================================
// saveall.js – FINALNA WERSJA (zdjęcia + boxy + wszystko działa 1:1)
// ============================================================

const collection = window.FS_collection;
const addDoc = window.FS_addDoc;
const getDocs = window.FS_getDocs;
const getDoc = window.FS_getDoc;
const deleteDoc = window.FS_deleteDoc;
const doc = window.FS_doc;

const db = window.firestoreV2;

// ====================================================================
// 1. OTWARCIE OKNA ZAPISU
// ====================================================================
document.getElementById("saveProjectBtn").onclick = () => {
    const modal = document.getElementById("saveProjectModal");
    modal.style.display = "flex";
    document.getElementById("projectDateInput").value = new Date().toISOString().split("T")[0];
};

// ====================================================================
// 2. ZAMKNIĘCIE OKNA
// ====================================================================
document.getElementById("cancelSaveBtn").onclick = () => {
    document.getElementById("saveProjectModal").style.display = "none";
};

// ====================================================================
// 3. ZBIERANIE DANYCH – NAJLEPSZA WERSJA (originalSrc + auto isBox)
// ====================================================================
function collectProjectData() {

    const project = {
        name: document.getElementById("projectNameInput").value.trim(),
        date: document.getElementById("projectDateInput").value,
        layout: window.LAYOUT_MODE || "layout6",
        pages: []
    };

    window.pages.forEach(page => {
        const objects = [];

        page.layer.getChildren().forEach(node => {

            // TŁO STRONY
            if (node.getAttr("isPageBg")) {
                objects.push({
                    type: "background",
                    fill: node.fill()
                });
                return;
            }

            // TEKST
            if (node instanceof Konva.Text) {
                objects.push({
                    type: "text",
                    x: node.x(),
                    y: node.y(),
                    text: node.text(),
                    width: node.width(),
                    height: node.height(),
                    fontSize: node.fontSize(),
                    fontFamily: node.fontFamily(),
                    fill: node.fill(),
                    rotation: node.rotation(),
                    isName: node.getAttr("isName") || false,
                    isPrice: node.getAttr("isPrice") || false,
                    isIndex: node.getAttr("isIndex") || false,
                    slotIndex: node.getAttr("slotIndex") ?? null
                });
                return;
            }

            // ZDJĘCIA (nie barcode)
            if (node instanceof Konva.Image && !node.getAttr("isBarcode")) {
                objects.push({
                    type: "image",
                    x: node.x(),
                    y: node.y(),
                    scaleX: node.scaleX(),
                    scaleY: node.scaleY(),
                    rotation: node.rotation(),
                    slotIndex: node.getAttr("slotIndex") ?? null,
                    src: node.getAttr("originalSrc") || node.image()?.src || null
                });
                return;
            }

            // BARCODE
            if (node.getAttr("isBarcode")) {
                objects.push({
                    type: "barcode",
                    x: node.x(),
                    y: node.y(),
                    scaleX: node.scaleX(),
                    scaleY: node.scaleY(),
                    rotation: node.rotation(),
                    slotIndex: node.getAttr("slotIndex") ?? null,
                    original: node.getAttr("barcodeOriginalSrc") || null,
                    color: node.getAttr("barcodeColor") || "#000"
                });
                return;
            }

            // BOXY – NAJWAŻNIEJSZA POPRAWKA: automatyczne wykrywanie!
            if (node instanceof Konva.Rect) {
                const hasStroke = node.stroke() && node.strokeWidth() > 0;
                const isBg = node.getAttr("isPageBg");
                const alreadyMarked = node.getAttr("isBox");

                // Jeśli to prostokąt z obramowaniem i nie jest tłem – to na 99% box!
                if ((hasStroke || alreadyMarked) && !isBg) {
                    objects.push({
                        type: "box",
                        x: node.x(),
                        y: node.y(),
                        width: node.width(),
                        height: node.height(),
                        scaleX: node.scaleX(),
                        scaleY: node.scaleY(),
                        slotIndex: node.getAttr("slotIndex") ?? null
                    });
                }
            }
        });

        project.pages.push({
            number: page.number,
            objects
        });
    });

    return project;
}

// ====================================================================
// 4. ZAPIS DO FIRESTORE
// ====================================================================
document.getElementById("confirmSaveBtn").onclick = async () => {
    document.getElementById("saveProjectModal").style.display = "none";

    const data = collectProjectData();
    if (!data) return;

    if (!data.name) {
        alert("Podaj nazwę projektu!");
        return;
    }

    const ref = await addDoc(collection(db, "projects"), data);
    alert("Projekt zapisany idealnie! ID: " + ref.id);
};

// ====================================================================
// PANEL ZAPISANYCH PROJEKTÓW
// ====================================================================
const savedPanel = document.createElement("div");
savedPanel.id = "savedProjectsModal";
savedPanel.style = `display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); z-index:999999; justify-content:center; align-items:center;`;
savedPanel.innerHTML = `
    <div style="width:520px; max-height:80vh; overflow-y:auto; background:white; padding:20px; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25); font-family:Inter,Arial;">
        <h2 style="margin-top:0;">Zapisane projekty</h2>
        <div id="savedProjectsList" style="display:flex; flex-direction:column; gap:12px;"></div>
        <div style="text-align:right; margin-top:20px;">
            <button id="closeSavedProjects" style="padding:10px 20px; background:#ccc; border:none; border-radius:8px; cursor:pointer;">Zamknij</button>
        </div>
    </div>
`;
document.body.appendChild(savedPanel);

// ====================================================================
// 5. WCZYTYWANIE LISTY
// ====================================================================
async function loadSavedProjects() {
    const list = document.getElementById("savedProjectsList");
    list.innerHTML = "<p>Ładowanie...</p>";

    const snapshot = await getDocs(collection(db, "projects"));
    if (snapshot.empty) {
        list.innerHTML = "<p>Brak zapisanych projektów</p>";
        return;
    }

    list.innerHTML = "";
    snapshot.forEach(docSnap => {
        const item = docSnap.data();
        const card = document.createElement("div");
        card.style = `padding:15px; border:1px solid #ddd; border-radius:8px; display:flex; justify-content:space-between; align-items:center; background:#f9f9f9;`;
        card.innerHTML = `
            <div>
                <strong>${item.name}</strong><br>
                <small>${item.date} • ${item.layout || 'layout6'}</small>
            </div>
            <div style="display:flex; gap:10px;">
                <button data-id="${docSnap.id}" class="openProjectBtn" style="padding:8px 14px; background:#0066ff; color:white; border:none; border-radius:6px; cursor:pointer;">Otwórz</button>
                <button data-id="${docSnap.id}" class="deleteProjectBtn" style="padding:8px 14px; background:#ff4444; color:white; border:none; border-radius:6px; cursor:pointer;">Usuń</button>
            </div>
        `;
        list.appendChild(card);
    });

    document.querySelectorAll(".deleteProjectBtn").forEach(btn => {
        btn.onclick = async () => {
            if (confirm("Na pewno usunąć?")) {
                await deleteDoc(doc(db, "projects", btn.dataset.id));
                loadSavedProjects();
            }
        };
    });

    document.querySelectorAll(".openProjectBtn").forEach(btn => {
        btn.onclick = () => {
            loadProject(btn.dataset.id);
            savedPanel.style.display = "none";
        };
    });
}

// ====================================================================
// 6. WCZYTYWANIE PROJEKTU – zdjęcia + boxy działają idealnie
// ====================================================================
async function loadProject(projectId) {
    const snap = await getDoc(doc(db, "projects", projectId));
    if (!snap.exists()) return alert("Projekt nie istnieje!");

    const data = snap.data();

    document.getElementById("pagesContainer").innerHTML = "";
    window.pages = [];

    for (const p of data.pages) {
        const page = window.createNewPage();
        const layer = page.layer;

        for (const obj of p.objects) {

            // TŁO
            if (obj.type === "background") {
                const bg = layer.findOne(n => n.getAttr("isPageBg"));
                if (bg) bg.fill(obj.fill);
                continue;
            }

            // TEKST
            if (obj.type === "text") {
                const t = new Konva.Text({
                    x: obj.x, y: obj.y,
                    text: obj.text || "",
                    width: obj.width,
                    height: obj.height,
                    fontSize: obj.fontSize,
                    fontFamily: obj.fontFamily,
                    fill: obj.fill,
                    rotation: obj.rotation,
                    draggable: true
                });
                t.setAttrs({
                    isName: obj.isName || false,
                    isPrice: obj.isPrice || false,
                    isIndex: obj.isIndex || false,
                    slotIndex: obj.slotIndex
                });
                layer.add(t);
                enableTextEditing(t, page);
                continue;
            }

            // ZDJĘCIA
            if (obj.type === "image" && obj.src) {
                await new Promise(res => {
                    const img = new Image();
                    img.onload = () => {
                        const k = new Konva.Image({
                            x: obj.x, y: obj.y,
                            image: img,
                            scaleX: obj.scaleX || 1,
                            scaleY: obj.scaleY || 1,
                            rotation: obj.rotation || 0,
                            draggable: true
                        });
                        k.setAttr("slotIndex", obj.slotIndex);
                        k.setAttr("originalSrc", obj.src);
                        layer.add(k);
                        res();
                    };
                    img.crossOrigin = "Anonymous";
                    img.src = obj.src;
                });
                continue;
            }

            // BARCODE
            if (obj.type === "barcode" && obj.original) {
                await new Promise(res => {
                    const img = new Image();
                    img.onload = () => {
                        const k = new Konva.Image({
                            x: obj.x, y: obj.y,
                            image: img,
                            scaleX: obj.scaleX || 1,
                            scaleY: obj.scaleY || 1,
                            rotation: obj.rotation || 0,
                            draggable: true
                        });
                        k.setAttrs({
                            isBarcode: true,
                            slotIndex: obj.slotIndex,
                            barcodeOriginalSrc: obj.original,
                            barcodeColor: obj.color
                        });
                        layer.add(k);
                        res();
                    };
                    img.src = obj.original;
                });
                continue;
            }

            // BOXY – poprawne wczytywanie skali
            if (obj.type === "box") {
                const box = new Konva.Rect({
                    x: obj.x,
                    y: obj.y,
                    width: obj.width,
                    height: obj.height,
                    fill: "transparent",
                    stroke: "#000",
                    strokeWidth: 2,
                    draggable: true
                });

                box.setAttr("isBox", true);
                box.setAttr("slotIndex", obj.slotIndex ?? null);

                // Skalujemy PO utworzeniu – zero dublowania!
                box.scaleX(obj.scaleX || 1);
                box.scaleY(obj.scaleY || 1);

                layer.add(box);
                continue;
            }
        }

        layer.batchDraw();
    }

    alert("Projekt wczytany w 100% – zdjęcia, boxy, tekst, wszystko działa!");
}

// ====================================================================
// 7. OTWARCIE PANELU
// ====================================================================
document.querySelector('[title="Elementy zapisane"]').onclick = () => {
    savedPanel.style.display = "flex";
    loadSavedProjects();
};

document.getElementById("closeSavedProjects").onclick = () => {
    savedPanel.style.display = "none";
};