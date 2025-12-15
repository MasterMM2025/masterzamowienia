// =====================================================
// edytor.js – CENTRALNY EDYTOR LAYOUTU (6 / 8)
// współpraca z importdanych.js
// =====================================================

(function () {

  if (window.editorLoaded) return;
  window.editorLoaded = true;

  // =====================================================
  // GLOBALNE USTAWIENIA EDYTORA
  // =====================================================
  window.editorState = {
    layout: null   // "layout6" | "layout8"
  };

  // =====================================================
  // PUBLICZNA FUNKCJA – WYBÓR LAYOUTU (MODAL)
// =====================================================
  window.openLayoutSelector = function (force = false) {
    return new Promise(resolve => {

      // jeśli już wybrany → nie pytamy ponownie
      if (window.editorState.layout && !force) {
        resolve(window.editorState.layout);
        return;
      }

      // ================= MODAL =================
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000000;
        font-family: Arial;
      `;

      const box = document.createElement("div");
      box.style.cssText = `
        width: 680px;
        max-width: 90vw;
        background: #fff;
        border-radius: 20px;
        padding: 30px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.35);
        text-align: center;
      `;

      box.innerHTML = `
        <h2 style="margin:0 0 10px 0;font-size:28px;">
          Wybierz układ katalogu
        </h2>

        <p style="color:#555;margin-bottom:30px;">
          Możesz zmienić układ później w edytorze strony
        </p>

        <div style="display:flex;gap:24px;justify-content:center;">
          <div class="layout-card" data-layout="layout6">
            <div class="layout-preview">6</div>
            <h3>6 produktów</h3>
            <p>Większe boxy<br>bardziej czytelne</p>
          </div>

          <div class="layout-card" data-layout="layout8">
            <div class="layout-preview">8</div>
            <h3>8 produktów</h3>
            <p>Więcej produktów<br>na jednej stronie</p>
          </div>
        </div>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      // ================= STYLES =================
      const style = document.createElement("style");
      style.textContent = `
        .layout-card {
          width: 260px;
          padding: 24px;
          border-radius: 16px;
          border: 2px solid #ddd;
          cursor: pointer;
          transition: all .2s ease;
        }
        .layout-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 25px rgba(0,0,0,.2);
          border-color: #007cba;
        }
        .layout-preview {
          height: 120px;
          border-radius: 12px;
          background: linear-gradient(135deg,#f0f0f0,#dcdcdc);
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:48px;
          font-weight:700;
          margin-bottom:16px;
        }
        .layout-card h3 {
          margin: 8px 0;
          font-size: 20px;
        }
        .layout-card p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }
      `;
      document.head.appendChild(style);

      // ================= EVENTS =================
      box.querySelectorAll(".layout-card").forEach(card => {
        card.onclick = () => {
          const layout = card.dataset.layout;
          window.editorState.layout = layout;
          overlay.remove();
          style.remove();
          resolve(layout);
        };
      });
    });
  };

  // =====================================================
  // 🔥 FUNKCJA WYMUSZAJĄCA ZMIANĘ LAYOUTU
  // (wysyła żądanie do importdanych.js)
  // =====================================================
  window.forceCatalogLayoutChange = async function () {
    const layout = await window.openLayoutSelector(true);
    if (!layout) return;

    window.editorState.layout = layout;

    window.dispatchEvent(
      new CustomEvent("forceCatalogLayoutChange", {
        detail: layout
      })
    );
  };

})();

// =====================================================
// PODPIĘCIE: ⚙ Ustawienia katalogu
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("catalogSettingsBtn");
  if (!btn) {
    console.warn("catalogSettingsBtn nie znaleziony");
    return;
  }
btn.addEventListener("click", async () => {

    const layout = await window.openLayoutSelector(true);
    if (!layout) return;

    window.editorState.layout = layout;

    if (typeof window.setCatalogLayout === "function") {
        window.setCatalogLayout(layout);
    }

});

});
