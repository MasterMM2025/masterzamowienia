// baner-konva.js – BANER 21 × 3 cm (Konva.js)

const DPI = 96;
const CM_TO_PX = DPI / 2.54;

// Stałe rozmiary banera
const BANNER_WIDTH_CM = 21;
const BANNER_HEIGHT_CM = 3;

const BANNER_WIDTH_PX = BANNER_WIDTH_CM * CM_TO_PX;   // ≈ 794 px
const BANNER_HEIGHT_PX = BANNER_HEIGHT_CM * CM_TO_PX; // ≈ 113 px

let bannerImage = null;        // surowy <img>
let bannerDataURL = null;      // gotowy URL
let bannerAddedPages = [];     // zapis referencji dla usuwania

// ======================================================
// DODAWANIE BANERA NA STRONĘ KONVA
// ======================================================
window.addBannerToPage = function(page) {
  // NIE dodawaj banera do okładki
  if (page.isCover) return;

  if (!bannerImage) return;

  const layer = page.layer;

  // usuń poprzedni baner
  layer.getChildren().forEach(n => {
    if (n.getAttr("name") === "banner") n.destroy();
  });

  // Konva.Image → MUSI używać dataURL, nie raw image
  Konva.Image.fromURL(bannerDataURL, img => {

    // Obliczenie skali zachowującej proporcje
    const scaleX = BANNER_WIDTH_PX / bannerImage.width;
    const scaleY = BANNER_HEIGHT_PX / bannerImage.height;
    const scale = Math.min(scaleX, scaleY);

    img.setAttrs({
      x: 0,
      y: 0,
      scaleX: scale,
      scaleY: scale,
      name: "banner",
      draggable: true,              // możesz przesuwać
      listening: true
    });

    layer.add(img);
    img.moveToTop();
    page.transformer.nodes([]);     // brak transformera dla banera
    layer.batchDraw();

    bannerAddedPages.push({ page, img });
  });
};

// ======================================================
// IMPORT BANERA (Konva)
// ======================================================
window.importBanner = function() {
  const input = document.getElementById("bannerFileInput");
  const file = input?.files[0];
  if (!file) return alert("Wybierz plik banera!");

  const reader = new FileReader();
  reader.onload = e => {
    bannerDataURL = e.target.result;

    const img = new Image();
    img.onload = () => {
      bannerImage = img;

      // Dodaj baner na wszystkie istniejące strony (oprócz okładki)
      pages.forEach(p => {
        if (!p.isCover) addBannerToPage(p);
      });

      alert("Baner zaimportowany (21×3 cm)");
      input.value = "";
    };
    img.src = bannerDataURL;
  };

  reader.readAsDataURL(file);
};

// ======================================================
// USUWANIE BANERA (Konva)
// ======================================================
window.removeBanner = function() {
  bannerAddedPages.forEach(({ page, img }) => {
    img.destroy();
    page.layer.batchDraw();
  });

  bannerAddedPages = [];
  bannerImage = null;
  bannerDataURL = null;

  alert("Baner usunięty");
};

// ======================================================
// OBSŁUGA DROPZONE
// ======================================================
document.addEventListener("DOMContentLoaded", () => {
  const bannerInput = document.getElementById("bannerFileInput");
  const bannerZone = document.getElementById("bannerUpload");

  if (bannerInput) {
    bannerInput.addEventListener("change", importBanner);
  }

  if (bannerZone) {
    bannerZone.addEventListener("click", () => bannerInput.click());

    ["dragover", "dragenter"].forEach(evt =>
      bannerZone.addEventListener(evt, e => e.preventDefault())
    );

    bannerZone.addEventListener("drop", ev => {
      ev.preventDefault();
      const file = ev.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        const dt = new DataTransfer();
        dt.items.add(file);
        bannerInput.files = dt.files;
        bannerInput.dispatchEvent(new Event("change"));
      }
    });
  }
});
