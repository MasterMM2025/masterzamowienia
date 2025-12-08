// okladka.js – OKŁADKA JAKO PIERWSZA STRONA (KONVA.JS)

document.addEventListener('DOMContentLoaded', () => {
  const coverInput = document.getElementById('coverFileInput');
  if (!coverInput) return;

  coverInput.addEventListener('change', () => {
    const file = coverInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      addCoverPage(e.target.result);
    };
    reader.readAsDataURL(file);
  });
});

function addCoverPage(imgUrl) {
    // Usuń starą okładkę jeśli istnieje (nie zależy od jej pozycji w tablicy)
  const oldCoverIndex = pages.findIndex(p => p.isCover);

  if (oldCoverIndex !== -1) {
      pages[oldCoverIndex].stage.destroy();
      pages[oldCoverIndex].container.remove();
      pages.splice(oldCoverIndex, 1);
  }


  // === TWORZENIE STRUKTURY STRONY OKŁADKI ===
  const div = document.createElement('div');
  div.className = 'page-container';
  const coverId = `coverCanvas_${Date.now()}`;

  div.innerHTML = `
  <div class="cover-toolbar" 
       style="display:flex; justify-content:space-between; align-items:center; width:${W}px; margin-bottom:10px;">
      
      <h3 style="margin:0;">Okładka</h3>

      <div style="display:flex; gap:10px;">
          <button id="changeCoverBtn"
              style="padding:6px 14px; font-size:13px; border-radius:8px; background:#f3f3f3; border:1px solid #bbb; cursor:pointer;">
              Zmień okładkę
          </button>

          <button id="deleteCoverBtn"
              style="padding:6px 14px; font-size:13px; border-radius:8px; background:#d9534f; color:white; border:1px solid #b52b27; cursor:pointer;">
              Usuń okładkę
          </button>
      </div>

  </div>

  <div class="canvas-wrapper" style="width:${W}px; height:${H}px;">
      <div id="${coverId}"></div>
  </div>
`;


  document
    .getElementById('pagesContainer')
    .insertBefore(div, document.getElementById('pagesContainer').firstChild);

  // === KONVA ===
  const stage = new Konva.Stage({
    container: coverId,

    width: W,
    height: H
  });

  const layer = new Konva.Layer();
  stage.add(layer);

  // === WCZYTANIE OBRAZU OKŁADKI ===
  Konva.Image.fromURL(imgUrl, (img) => {
    const scale = Math.max(W / img.width(), H / img.height());

    img.x(W / 2);
    img.y(H / 2);
    img.offsetX(img.width() / 2);
    img.offsetY(img.height() / 2);
    img.scaleX(scale);
    img.scaleY(scale);
    img.draggable(true);

    layer.add(img);
    layer.draw();
  });

  const page = {
    number: 'Okładka',
    stage,
    layer,
    container: div,
    isCover: true
  };

  pages.unshift(page);

  if (typeof applyZoomToPage === 'function') {
    applyZoomToPage(page, currentZoom);
  }

  // === PODPIĘCIE PRZYCISKU "Zmień okładkę" ===
  div.querySelector('#changeCoverBtn').onclick = () => {
    document.getElementById('coverFileInput').click();
  };
 // === PODPIĘCIE PRZYCISKU "Usuń okładkę" ===
// === PODPIĘCIE PRZYCISKU "Usuń okładkę" ===
div.querySelector('#deleteCoverBtn').onclick = () => {

    if (!confirm("Czy na pewno chcesz usunąć okładkę?")) return;

    page.stage.destroy();
    page.container.remove();

    const index = pages.indexOf(page);
    if (index !== -1) pages.splice(index, 1);

    console.log("Okładka została usunięta — możesz dodać kolejną.");
};

// 🔥 WAŻNE — reset inputa, żeby można było dodać TEN SAM plik ponownie
document.getElementById('coverFileInput').value = "";
}
