let products = [];
let jsonProducts = [];
let selectedBanner = null;
let selectedCover = null;
let selectedBackground = null;
let uploadedImages = {};
let productEdits = {};
let globalCurrency = 'EUR';
let globalLanguage = 'pl';
let pendingProducts = null; // Tymczasowe przechowywanie produktów z Excela

async function toBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadProducts() {
  try {
    const response = await fetch("https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/UKRAINA.json");
    if (!response.ok) throw new Error(`Nie udało się załadować JSON: ${response.status}`);
    const jsonData = await response.json();
    jsonProducts = await Promise.all(jsonData.map(async (p) => {
      const urls = [
        `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-ukraina/${p.INDEKS}.jpg`,
        `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-ukraina/${p.INDEKS}.png`,
        `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/rumunia/${p.INDEKS}.jpg`,
        `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/rumunia/${p.INDEKS}.png`
      ];
      let base64Img = null;
      for (const url of urls) {
        base64Img = await toBase64(url);
        if (base64Img) break;
      }
      return {
        nazwa: p.NAZWA,
        opakowanie: p.OPAKOWANIE,
        ean: p["unit barcode"],
        ranking: p.RANKING || '',
        cena: p.CENA || '',
        indeks: p.INDEKS.toString(),
        img: base64Img
      };
    }));
    console.log("Załadowano jsonProducts:", jsonProducts.length);
  } catch (error) {
    document.getElementById('debug').innerText = "Błąd ładowania JSON: " + error.message;
    console.error("Błąd loadProducts:", error);
  }
}

function handleFiles(files, callback) {
  if (!files || files.length === 0) {
    console.error("Brak plików do załadowania");
    document.getElementById('debug').innerText = "Brak zdjęć do załadowania";
    return;
  }
  [...files].forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      callback(file, e.target.result);
      document.getElementById('debug').innerText = `Załadowano plik: ${file.name}`;
    };
    reader.onerror = () => {
      console.error(`Błąd ładowania pliku: ${file.name}`);
      document.getElementById('debug').innerText = `Błąd ładowania pliku: ${file.name}`;
    };
    reader.readAsDataURL(file);
  });
}

function loadCustomBanner(file, data) {
  selectedBanner = { id: "custom", data };
  console.log("Załadowano baner:", file.name);
}

function loadCustomBackground(file, data) {
  selectedBackground = { id: "customBackground", data };
  console.log("Załadowano tło:", file.name);
}

function loadCustomCover(file, data) {
  selectedCover = { id: "customCover", data };
  console.log("Załadowano okładkę:", file.name);
}

function loadCustomImages(file, data) {
  const fileName = file.name.split('.')[0];
  uploadedImages[fileName] = data;
  console.log(`Załadowano obraz dla indeksu: ${fileName}`);
  // Jeśli mamy oczekujące produkty, przypisz obrazy i renderuj katalog
  if (pendingProducts) {
    console.log("Przypisuję obrazy do oczekujących produktów");
    pendingProducts.forEach(p => {
      if (uploadedImages[p.indeks]) {
        p.img = uploadedImages[p.indeks];
      }
    });
    products = pendingProducts;
    pendingProducts = null;
    renderCatalog();
    document.getElementById('pdfButton').disabled = false;
    document.getElementById('previewButton').disabled = false;
    document.getElementById('debug').innerText = `Zaimportowano ${products.length} produktów z obrazami`;
  } else {
    renderCatalog();
  }
}

function showEditModal(productIndex) {
  const product = products[productIndex];
  const edit = productEdits[productIndex] || {
    font: 'Arial',
    fontColor: '#000000',
    indeksFont: 'Arial',
    indeksFontColor: '#000000',
    rankingFont: 'Arial',
    rankingFontColor: '#000000',
    cenaFont: 'Arial',
    cenaFontColor: '#000000',
    priceCurrency: globalCurrency,
    priceFontSize: 'medium'
  };
  const showRanking = document.getElementById('showRanking')?.checked || false;
  const showCena = document.getElementById('showCena')?.checked || false;
  const showLogo = document.getElementById('showLogo')?.checked || false;
  const priceLabel = globalLanguage === 'en' ? 'Price' : 'Cena';
  const editForm = document.getElementById('editForm');
  editForm.innerHTML = `
    <div class="edit-field">
      <label>Zdjęcie:</label>
      <img src="${uploadedImages[product.indeks] || product.img || 'https://dummyimage.com/120x84/eee/000&text=brak'}" style="width:100px;height:100px;object-fit:contain;margin-bottom:10px;">
      <input type="file" id="editImage" accept="image/*">
    </div>
    <div class="edit-field">
      <label>Nazwa:</label>
      <input type="text" id="editNazwa" value="${product.nazwa || ''}">
      <select id="editNazwaFont">
        <option value="Arial" ${edit.font === 'Arial' ? 'selected' : ''}>Arial</option>
        <option value="Helvetica" ${edit.font === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
        <option value="Times" ${edit.font === 'Times' ? 'selected' : ''}>Times New Roman</option>
      </select>
      <input type="color" id="editNazwaColor" value="${edit.fontColor}">
    </div>
    <div class="edit-field">
      <label>Indeks:</label>
      <input type="text" id="editIndeks" value="${product.indeks || ''}">
      <select id="editIndeksFont">
        <option value="Arial" ${edit.indeksFont === 'Arial' ? 'selected' : ''}>Arial</option>
        <option value="Helvetica" ${edit.indeksFont === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
        <option value="Times" ${edit.font === 'Times' ? 'selected' : ''}>Times New Roman</option>
      </select>
      <input type="color" id="editIndeksColor" value="${edit.indeksFontColor}">
    </div>
    ${showRanking ? `
      <div class="edit-field">
        <label>Ranking:</label>
        <input type="text" id="editRanking" value="${product.ranking || ''}">
        <select id="editRankingFont">
          <option value="Arial" ${edit.rankingFont === 'Arial' ? 'selected' : ''}>Arial</option>
          <option value="Helvetica" ${edit.rankingFont === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
          <option value="Times" ${edit.rankingFont === 'Times' ? 'selected' : ''}>Times New Roman</option>
        </select>
        <input type="color" id="editRankingColor" value="${edit.rankingFontColor}">
      </div>
    ` : ''}
    ${showCena ? `
      <div class="edit-field">
        <label>${priceLabel}:</label>
        <input type="text" id="editCena" value="${product.cena || ''}">
        <select id="editCenaFont">
          <option value="Arial" ${edit.cenaFont === 'Arial' ? 'selected' : ''}>Arial</option>
          <option value="Helvetica" ${edit.cenaFont === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
          <option value="Times" ${edit.cenaFont === 'Times' ? 'selected' : ''}>Times New Roman</option>
        </select>
        <input type="color" id="editCenaColor" value="${edit.cenaFontColor}">
        <select id="editCenaCurrency">
          <option value="EUR" ${edit.priceCurrency === 'EUR' ? 'selected' : ''}>EUR (EUR)</option>
          <option value="GBP" ${edit.priceCurrency === 'GBP' ? 'selected' : ''}>GBP (GBP)</option>
        </select>
        <select id="editCenaFontSize">
          <option value="small" ${edit.priceFontSize === 'small' ? 'selected' : ''}>Mały</option>
          <option value="medium" ${edit.priceFontSize === 'medium' ? 'selected' : ''}>Średni</option>
          <option value="large" ${edit.priceFontSize === 'large' ? 'selected' : ''}>Duży</option>
        </select>
      </div>
    ` : ''}
    ${showLogo ? `
      <div class="edit-field">
        <label>Logo:</label>
        <input type="file" id="editLogo" accept="image/*">
      </div>
    ` : ''}
    <button onclick="saveEdit(${productIndex})" class="btn-primary">Zapisz</button>
  `;
  document.getElementById('editModal').style.display = 'block';
}

function hideEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

function saveEdit(productIndex) {
  const product = products[productIndex];
  const editImage = document.getElementById('editImage').files[0];
  if (editImage) {
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImages[product.indeks] = e.target.result;
      renderCatalog();
    };
    reader.readAsDataURL(editImage);
  }
  product.nazwa = document.getElementById('editNazwa').value;
  product.indeks = document.getElementById('editIndeks').value;
  if (document.getElementById('showRanking')?.checked) {
    product.ranking = document.getElementById('editRanking')?.value || '';
  }
  if (document.getElementById('showCena')?.checked) {
    product.cena = document.getElementById('editCena')?.value || '';
  }
  productEdits[productIndex] = {
    font: document.getElementById('editNazwaFont').value,
    fontColor: document.getElementById('editNazwaColor').value,
    indeksFont: document.getElementById('editIndeksFont').value,
    indeksFontColor: document.getElementById('editIndeksColor').value,
    rankingFont: document.getElementById('editRankingFont')?.value || 'Arial',
    rankingFontColor: document.getElementById('editRankingColor')?.value || '#000000',
    cenaFont: document.getElementById('editCenaFont')?.value || 'Arial',
    cenaFontColor: document.getElementById('editCenaColor')?.value || '#000000',
    priceCurrency: document.getElementById('editCenaCurrency')?.value || globalCurrency,
    priceFontSize: document.getElementById('editCenaFontSize')?.value || 'medium'
  };
  renderCatalog();
  hideEditModal();
}

document.addEventListener("DOMContentLoaded", () => {
  const imageInput = document.getElementById("imageInput");
  const uploadArea = document.getElementById("uploadArea");
  if (imageInput && uploadArea) {
    imageInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        console.log("Zmiana w imageInput, pliki:", e.target.files.length);
        handleFiles(e.target.files, loadCustomImages);
      }
    });
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("dragover");
    });
    uploadArea.addEventListener("dragleave", () => {
      uploadArea.classList.remove("dragover");
    });
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        console.log("Drop zdjęć:", e.dataTransfer.files.length);
        handleFiles(e.dataTransfer.files, loadCustomImages);
      }
    });
    uploadArea.querySelector('.file-label').addEventListener("click", (e) => {
      e.preventDefault();
      imageInput.click();
    });
  } else {
    console.error("Nie znaleziono elementów: imageInput lub uploadArea");
    document.getElementById('debug').innerText = "Błąd: Brak elementów do obsługi zdjęć";
  }
  const bannerFileInput = document.getElementById("bannerFileInput");
  const bannerUpload = document.getElementById("bannerUpload");
  if (bannerFileInput && bannerUpload) {
    bannerFileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        console.log("Zmiana w bannerFileInput, pliki:", e.target.files.length);
        handleFiles(e.target.files, loadCustomBanner);
      }
    });
    bannerUpload.addEventListener("dragover", (e) => {
      e.preventDefault();
      bannerUpload.classList.add("dragover");
    });
    bannerUpload.addEventListener("dragleave", () => {
      bannerUpload.classList.remove("dragover");
    });
    bannerUpload.addEventListener("drop", (e) => {
      e.preventDefault();
      bannerUpload.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        console.log("Drop banera:", e.dataTransfer.files.length);
        handleFiles(e.dataTransfer.files, loadCustomBanner);
      }
    });
    bannerUpload.querySelector('.file-label').addEventListener("click", (e) => {
      e.preventDefault();
      bannerFileInput.click();
    });
  } else {
    console.error("Nie znaleziono elementów: bannerFileInput lub bannerUpload");
    document.getElementById('debug').innerText = "Błąd: Brak elementów do obsługi banera";
  }
  const backgroundFileInput = document.getElementById("backgroundFileInput");
  const backgroundUpload = document.getElementById("backgroundUpload");
  if (backgroundFileInput && backgroundUpload) {
    backgroundFileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        console.log("Zmiana w backgroundFileInput, pliki:", e.target.files.length);
        handleFiles(e.target.files, loadCustomBackground);
      }
    });
    backgroundUpload.addEventListener("dragover", (e) => {
      e.preventDefault();
      backgroundUpload.classList.add("dragover");
    });
    backgroundUpload.addEventListener("dragleave", () => {
      backgroundUpload.classList.remove("dragover");
    });
    backgroundUpload.addEventListener("drop", (e) => {
      e.preventDefault();
      backgroundUpload.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        console.log("Drop tła:", e.dataTransfer.files.length);
        handleFiles(e.dataTransfer.files, loadCustomBackground);
      }
    });
    backgroundUpload.querySelector('.file-label').addEventListener("click", (e) => {
      e.preventDefault();
      backgroundFileInput.click();
    });
  } else {
    console.error("Nie znaleziono elementów: backgroundFileInput lub backgroundUpload");
    document.getElementById('debug').innerText = "Błąd: Brak elementów do obsługi tła";
  }
  const coverFileInput = document.getElementById("coverFileInput");
  const coverUpload = document.getElementById("coverUpload");
  if (coverFileInput && coverUpload) {
    coverFileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        console.log("Zmiana w coverFileInput, pliki:", e.target.files.length);
        handleFiles(e.target.files, loadCustomCover);
      }
    });
    coverUpload.addEventListener("dragover", (e) => {
      e.preventDefault();
      coverUpload.classList.add("dragover");
    });
    coverUpload.addEventListener("dragleave", () => {
      coverUpload.classList.remove("dragover");
    });
    coverUpload.addEventListener("drop", (e) => {
      e.preventDefault();
      coverUpload.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        console.log("Drop okładki:", e.dataTransfer.files.length);
        handleFiles(e.dataTransfer.files, loadCustomCover);
      }
    });
    coverUpload.querySelector('.file-label').addEventListener("click", (e) => {
      e.preventDefault();
      coverFileInput.click();
    });
  } else {
    console.error("Nie znaleziono elementów: coverFileInput lub coverUpload");
    document.getElementById('debug').innerText = "Błąd: Brak elementów do obsługi okładki";
  }
  const excelFileInput = document.getElementById("excelFile");
  const fileLabelWrapper = document.querySelector(".file-label-wrapper");
  if (excelFileInput && fileLabelWrapper) {
    excelFileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        console.log("Zmiana w excelFileInput, plik:", e.target.files[0].name);
        importExcel();
      }
    });
    fileLabelWrapper.addEventListener("click", (e) => {
      e.preventDefault();
      excelFileInput.click();
    });
  } else {
    console.error("Nie znaleziono elementów: excelFileInput lub fileLabelWrapper");
    document.getElementById('debug').innerText = "Błąd: Brak elementów do obsługi importu Excel";
  }
  const currencySelect = document.getElementById('currencySelect');
  if (currencySelect) {
    currencySelect.addEventListener('change', (e) => {
      globalCurrency = e.target.value;
      console.log("Zmieniono walutę na:", globalCurrency);
      renderCatalog();
    });
  }
  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
      globalLanguage = e.target.value;
      console.log("Zmieniono język na:", globalLanguage);
      renderCatalog();
    });
  }
});

function showBannerModal() {
  const bannerModal = document.getElementById('bannerModal');
  if (bannerModal) {
    bannerModal.style.display = 'block';
    loadBanners();
  } else {
    console.error("Nie znaleziono elementu bannerModal");
    document.getElementById('debug').innerText = "Błąd: Brak modalu banera";
  }
}

function hideBannerModal() {
  const bannerModal = document.getElementById('bannerModal');
  if (bannerModal) {
    bannerModal.style.display = 'none';
  }
}

async function loadBanners() {
  const bannerOptions = document.getElementById('bannerOptions');
  if (!bannerOptions) {
    console.error("Nie znaleziono elementu bannerOptions");
    document.getElementById('debug').innerText = "Błąd: Brak kontenera opcji banera";
    return;
  }
  bannerOptions.innerHTML = '';
  const bannerList = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  for (const id of bannerList) {
    const urls = [
      `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/BANER/${id}.JPG`,
      `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/BANER/${id}.jpg`,
      `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/BANER/${id}.png`
    ];
    let base64Banner = null;
    for (const url of urls) {
      base64Banner = await toBase64(url);
      if (base64Banner) break;
    }
    if (base64Banner) {
      const preview = document.createElement('img');
      preview.src = base64Banner;
      preview.className = 'banner-preview';
      preview.onclick = () => selectBanner(id, base64Banner);
      bannerOptions.appendChild(preview);
    }
  }
}

function selectBanner(id, data) {
  selectedBanner = { id, data };
  document.querySelectorAll('.banner-preview').forEach(p => p.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  hideBannerModal();
}

function renderCatalog() {
  // Wyłącz stare renderowanie
  // document.getElementById('catalog').innerHTML = "";
  
  // Użyj main.js do rysowania
  drawGrid(); // ← wywołaj funkcję z main.js
}
function importExcel() {
  const file = document.getElementById('excelFile').files[0];
  if (!file) {
    alert('Wybierz plik Excel lub CSV do importu');
    document.getElementById('debug').innerText = "Błąd: Nie wybrano pliku";
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    let rows;
    if (file.name.endsWith('.csv')) {
      const parsed = Papa.parse(e.target.result, { 
        header: true, 
        skipEmptyLines: true, 
        encoding: 'UTF-8',
        delimiter: ','
      });
      rows = parsed.data;
      if (rows.length === 0) {
        console.error("Plik CSV jest pusty lub niepoprawny");
        document.getElementById('debug').innerText = "Błąd: Plik CSV jest pusty";
        return;
      }
      const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
      console.log("Nagłówki CSV:", headers);
      rows = rows.map((row, index) => {
        let obj = {};
        console.log(`Surowy wiersz ${index}:`, row);
        Object.keys(row).forEach(key => {
          const value = row[key];
          const lowerKey = key.toLowerCase().trim();
          console.log(`Wiersz ${index}, klucz: ${lowerKey}, wartość: ${value}`);
          if (lowerKey === 'index-cell') {
            obj['indeks'] = value ? value.toString().trim() : '';
          }
          if (lowerKey === 'text-decoration-none') {
            obj['nazwa'] = value ? value.toString().trim() : '';
          }
          if (lowerKey === 'kod ean') {
            obj['ean'] = value ? value.toString().trim() : '';
          }
        });
        console.log(`Przetworzony wiersz CSV ${index}:`, obj);
        return obj;
      });
    } else {
      const workbook = XLSX.read(e.target.result, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
      const headers = rows[0].map(h => h.toString().toLowerCase().trim());
      console.log("Nagłówki Excel:", headers);
      rows = rows.slice(1).map((row, index) => {
        let obj = {};
        console.log(`Surowy wiersz ${index}:`, row);
        headers.forEach((header, i) => {
          const value = row[i];
          console.log(`Wiersz ${index}, klucz: ${header}, wartość: ${value}`);
          if (header === 'index-cell') {
            obj['indeks'] = value ? value.toString().trim() : '';
          }
          if (header === 'text-decoration-none') {
            obj['nazwa'] = value ? value.toString().trim() : '';
          }
          if (header === 'kod ean') {
            obj['ean'] = value ? value.toString().trim() : '';
          }
        });
        console.log(`Przetworzony wiersz Excel ${index}:`, obj);
        return obj;
      });
    }
    console.log("Przetworzone wiersze CSV/Excel:", rows);
    const newProducts = [];
    rows.forEach(row => {
      const indeks = row['indeks'] || (row[0] ? row[0].toString().trim() : null);
      if (indeks) {
        const matched = jsonProducts.find(p => p.indeks === indeks.toString());
        let barcodeImg = null;
      
        if (row['ean']) {
          const rawEan = row['ean'].toString().trim();
          let finalEan = rawEan;
          let format = null;
          let jsBarcodeOptions = {
            width: 2.2,
            height: 42,
            displayValue: true,
            fontSize: 11,
            margin: 6,
            flat: false,
            background: "#FFFFFF",
            lineColor: "#000000"
          };

          // 7 cyfr → dodaj 0 → EAN-8
          if (/^\d{7}$/.test(rawEan)) {
            finalEan = rawEan + '0';
            format = "EAN8";
            console.log(`7-cyfrowy → EAN8: ${rawEan} → ${finalEan}`);

          // 13 cyfr → popraw cyfrę kontrolną
          } else if (/^\d{13}$/.test(rawEan)) {
            finalEan = fixEan13Checksum(rawEan);
            if (finalEan !== rawEan) {
              console.warn(`Poprawiono EAN-13: ${rawEan} → ${finalEan}`);
            }
            format = "EAN13";

          // 8 cyfr → EAN-8
          } else if (/^\d{8}$/.test(rawEan)) {
            format = "EAN8";

          } else {
            console.warn(`Nieobsługiwany EAN: ${rawEan} (długość: ${rawEan.length})`);
            return;
          }

          try {
            const barcodeCanvas = document.createElement('canvas');
            JsBarcode(barcodeCanvas, finalEan, {
              ...jsBarcodeOptions,
              format: format
            });
            barcodeImg = barcodeCanvas.toDataURL("image/png", 1.0);
            console.log(`Wygenerowano ${format}: ${finalEan}`);
          } catch (e) {
            console.error(`Błąd JsBarcode (${format}):`, finalEan, e);
            try {
              const fallbackCanvas = document.createElement('canvas');
              JsBarcode(fallbackCanvas, finalEan, {
                format: format,
                width: 2.0,
                height: 40,
                displayValue: true,
                fontSize: 10,
                margin: 5
              });
              barcodeImg = fallbackCanvas.toDataURL("image/png", 1.0);
              console.log(`Fallback: Wygenerowano ${format}: ${finalEan}`);
            } catch (e2) {
              console.error(`Fallback nie działa:`, e2);
            }
          }
        }
        
        newProducts.push({
          nazwa: row['nazwa'] || (matched ? matched.nazwa : 'Brak nazwy'),
          ean: row['ean'] || (matched ? matched.ean : ''),
          ranking: row['ranking'] || (matched ? matched.ranking : ''),
          cena: row['cena'] || (matched ? matched.cena : ''),
          indeks: indeks.toString(),
          img: uploadedImages[indeks.toString()] || (matched ? matched.img : null),
          barcode: barcodeImg
        });
      }
    });
    console.log("Nowe produkty:", newProducts);
    if (newProducts.length) {
      pendingProducts = newProducts;
      document.getElementById('debug').innerText = `Zaimportowano ${newProducts.length} produktów. Wybierz zdjęcia, aby kontynuować.`;
      alert('Dane z Excela zaimportowane. Teraz wybierz zdjęcia produktów.');
    } else {
      document.getElementById('debug').innerText = "Brak produktów po imporcie. Sprawdź format pliku.";
    }
    window.products = products; // ← udostępnij dla main.js
drawGrid(); // ← od razu rysuj
  };
  reader.onerror = () => {
    console.error("Błąd odczytu pliku");
    document.getElementById('debug').innerText = "Błąd odczytu pliku CSV/Excel";
  };
  if (file.name.endsWith('.csv')) reader.readAsText(file, 'UTF-8');
  else reader.readAsBinaryString(file);
}

function drawBox(doc, x, y, w, h, style) {
  if (style === "3d") {
    doc.setFillColor(220, 220, 220);
    doc.roundedRect(x + 2, y + 2, w, h, 5, 5, 'F');
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, h, 5, 5, 'F');
    doc.setDrawColor(80, 80, 80);
    doc.roundedRect(x, y, w, h, 5, 5, 'S');
  } else {
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, w, h, 'F');
  }
}

async function buildPDF(jsPDF, save = true) {
  showProgressModal();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const bannerHeight = 85;
  let pageNumber = 1;
  let totalProducts = products.length;
  let processedProducts = 0;
  if (selectedCover) {
    try {
      doc.addImage(selectedCover.data, selectedCover.data.includes('image/png') ? "PNG" : "JPEG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
      if (products.length > 0) {
        doc.addPage();
      }
    } catch (e) {
      console.error('Błąd dodawania okładki:', e);
      document.getElementById('debug').innerText = "Błąd dodawania okładki";
    }
  }
  const bannerImg = selectedBanner ? selectedBanner.data : null;
  const backgroundImg = selectedBackground ? selectedBackground.data : null;
  const priceLabel = globalLanguage === 'en' ? 'PRICE' : 'CENA';
  if (products.length > 0) {
    if (backgroundImg) {
      try {
        doc.addImage(backgroundImg, backgroundImg.includes('image/png') ? "PNG" : "JPEG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
      } catch (e) {
        console.error('Błąd dodawania tła:', e);
        document.getElementById('debug').innerText = "Błąd dodawania tła";
      }
    }
    if (bannerImg) {
      try {
        doc.addImage(bannerImg, bannerImg.includes('image/png') ? "PNG" : "JPEG", 0, 0, pageWidth, bannerHeight, undefined, "FAST");
      } catch (e) {
        console.error('Błąd dodawania banera:', e);
        document.getElementById('debug').innerText = "Błąd dodawania banera";
      }
    }
    doc.setFont("Arial", "bold");
    doc.setFontSize(12);
    doc.text(`${pageNumber}`, pageWidth - 20, pageHeight - 10, { align: "right" });
  }
  const marginTop = 20 + bannerHeight;
  const marginBottom = 28;
  const marginLeftRight = 14;
  const layout = document.getElementById('layoutSelect')?.value || "16";
  const frameStyle = document.querySelector('input[name="frameStyle"]:checked')?.value || "3d";
  const showEan = document.getElementById('showEan')?.checked || false;
  const showRanking = document.getElementById('showRanking')?.checked || false;
  const showCena = document.getElementById('showCena')?.checked || false;
  let x = marginLeftRight;
  let y = marginTop;
  let productIndex = 0;
  const drawSection = async (sectionCols, sectionRows, boxWidth, boxHeight, isLarge) => {
    for (let row = 0; row < sectionRows && productIndex < products.length; row++) {
      for (let col = 0; col < sectionCols && productIndex < products.length; col++) {
        const p = products[productIndex];
        const edit = productEdits[productIndex] || {
          font: 'Arial',
          fontColor: '#000000',
          indeksFont: 'Arial',
          indeksFontColor: '#000000',
          rankingFont: 'Arial',
          rankingFontColor: '#000000',
          cenaFont: 'Arial',
          cenaFontColor: '#000000',
          priceCurrency: globalCurrency,
          priceFontSize: 'medium'
        };
        drawBox(doc, x, y, boxWidth, boxHeight, frameStyle);
        let imgSrc = uploadedImages[p.indeks] || p.img;
        if (isLarge) {
          if (imgSrc) {
            try {
              const img = new Image();
              img.src = imgSrc;
              await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
              const maxW = boxWidth - (sectionCols === 1 ? 80 : 40);
              const maxH = boxHeight * 0.4;
              let scale = Math.min(maxW / img.width, maxH / img.height);
              let w = img.width * scale;
              let h = img.height * scale;
              let imgX = x + (boxWidth - w) / 2;
              let imgY = y + 5;
              doc.addImage(imgSrc, imgSrc.includes('image/png') ? "PNG" : "JPEG", imgX, imgY, w, h);
            } catch (e) {
              console.error('Błąd dodawania obrazka:', e);
            }
          }
          let textY = y + 5 + (boxHeight * 0.4) + 10;
          doc.setFont(edit.font, "bold");
          doc.setFontSize(sectionCols === 1 ? 14 : 11);
          doc.setTextColor(parseInt(edit.fontColor.substring(1, 3), 16), parseInt(edit.fontColor.substring(3, 5), 16), parseInt(edit.fontColor.substring(5, 7), 16));
          const lines = doc.splitTextToSize(p.nazwa || "Brak nazwy", boxWidth - (sectionCols === 1 ? 80 : 40));
          const maxLines = 3;
          lines.slice(0, maxLines).forEach((line, index) => {
            doc.text(line, x + boxWidth / 2, textY + (index * 18), { align: "center" });
          });
          textY += Math.min(lines.length, maxLines) * 18 + 10;
          doc.setFont(edit.indeksFont, "normal");
          doc.setFontSize(sectionCols === 1 ? 11 : 9);
          doc.setTextColor(parseInt(edit.indeksFontColor.substring(1, 3), 16), parseInt(edit.indeksFontColor.substring(3, 5), 16), parseInt(edit.indeksFontColor.substring(5, 7), 16));
          doc.text(`Indeks: ${p.indeks || '-'}`, x + boxWidth / 2, textY, { align: "center" });
          textY += sectionCols === 1 ? 22 : 18;
          if (showRanking && p.ranking) {
            doc.setFont(edit.rankingFont, "normal");
            doc.setTextColor(parseInt(edit.rankingFontColor.substring(1, 3), 16), parseInt(edit.rankingFontColor.substring(3, 5), 16), parseInt(edit.rankingFontColor.substring(5, 7), 16));
            doc.text(`RANKING: ${p.ranking}`, x + boxWidth / 2, textY, { align: "center" });
            textY += sectionCols === 1 ? 22 : 18;
          }
          if (showCena && p.cena) {
            doc.setFont(edit.cenaFont, "bold");
            const priceFontSize = sectionCols === 1 ? (edit.priceFontSize === 'small' ? 16 : edit.priceFontSize === 'medium' ? 20 : 24) : (edit.priceFontSize === 'small' ? 12 : edit.priceFontSize === 'medium' ? 14 : 16);
            doc.setFontSize(priceFontSize);
            doc.setTextColor(parseInt(edit.cenaFontColor.substring(1, 3), 16), parseInt(edit.cenaFontColor.substring(3, 5), 16), parseInt(edit.cenaFontColor.substring(5, 7), 16));
            const currencySymbol = edit.priceCurrency === 'EUR' ? 'EUR' : 'GBP';
            doc.text(`${priceLabel}: ${p.cena} ${currencySymbol}`, x + boxWidth / 2, textY, { align: "center" });
          }
          if (showEan && p.ean && p.barcode) {
            try {
              const bw = sectionCols === 1 ? 180 : 140;
              const bh = sectionCols === 1 ? 50 : 40;
              const bx = x + (boxWidth - bw) / 2;
              const by = y + boxHeight - bh - 5;
              doc.addImage(p.barcode, "PNG", bx, by, bw, bh);
            } catch (e) {
              console.error('Błąd dodawania kodu kreskowego:', e);
            }
          }
        } else {
          if (imgSrc) {
            try {
              const img = new Image();
              img.src = imgSrc;
              await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
              const maxW = 90;
              const maxH = 60;
              let scale = Math.min(maxW / img.width, maxH / img.height);
              let w = img.width * scale;
              let h = img.height * scale;
              let imgX = x + 5 + (maxW - w) / 2;
              let imgY = y + 8 + (maxH - h) / 2;
              doc.addImage(imgSrc, imgSrc.includes('image/png') ? "PNG" : "JPEG", imgX, imgY, w, h);
            } catch (e) {
              console.error('Błąd dodawania obrazka:', e);
            }
          }
          let textY = y + 20;
          doc.setFont(edit.font, "bold");
          doc.setFontSize(8);
          doc.setTextColor(parseInt(edit.fontColor.substring(1, 3), 16), parseInt(edit.fontColor.substring(3, 5), 16), parseInt(edit.fontColor.substring(5, 7), 16));
          doc.text(p.nazwa || "Brak nazwy", x + 105, textY, { maxWidth: boxWidth - 110 });
          textY += 25;
          doc.setFont(edit.indeksFont, "normal");
          doc.setFontSize(7);
          doc.setTextColor(parseInt(edit.indeksFontColor.substring(1, 3), 16), parseInt(edit.indeksFontColor.substring(3, 5), 16), parseInt(edit.indeksFontColor.substring(5, 7), 16));
          doc.text(`Indeks: ${p.indeks || 'Brak indeksu'}`, x + 105, textY, { maxWidth: 150 });
          textY += 12;
          if (showRanking && p.ranking) {
            doc.setFont(edit.rankingFont, "normal");
            doc.setTextColor(parseInt(edit.rankingFontColor.substring(1, 3), 16), parseInt(edit.rankingFontColor.substring(3, 5), 16), parseInt(edit.rankingFontColor.substring(5, 7), 16));
            doc.text(`RANKING: ${p.ranking}`, x + 105, textY, { maxWidth: 150 });
            textY += 12;
          }
          if (showCena && p.cena) {
            doc.setFont(edit.cenaFont, "bold");
            const priceFontSize = edit.priceFontSize === 'small' ? 10 : edit.priceFontSize === 'medium' ? 12 : 14;
            doc.setFontSize(priceFontSize);
            doc.setTextColor(parseInt(edit.cenaFontColor.substring(1, 3), 16), parseInt(edit.cenaFontColor.substring(3, 5), 16), parseInt(edit.cenaFontColor.substring(5, 7), 16));
            const currencySymbol = edit.priceCurrency === 'EUR' ? 'EUR' : 'GBP';
            doc.text(`${priceLabel}: ${p.cena} ${currencySymbol}`, x + 105, textY, { maxWidth: 150 });
            textY += 16;
          }
          if (showEan && p.ean && p.barcode) {
            try {
              const bw = 85;
              const bh = 32;
              const bx = x + boxWidth - bw - 10;
              const by = y + boxHeight - bh - 5;
              doc.addImage(p.barcode, "PNG", bx, by, bw, bh);
            } catch (e) {
              console.error('Błąd dodawania kodu kreskowego:', e);
            }
          }
        }
        processedProducts++;
        const progress = (processedProducts / totalProducts) * 100;
        document.getElementById('progressBar').style.width = `${progress}%`;
        document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
        x += boxWidth + 6;
        productIndex++;
      }
      x = marginLeftRight;
      y += boxHeight + 6;
    }
    return y;
  };
  while (productIndex < products.length) {
    let cols, rows, boxWidth, boxHeight, isLarge;
    if (layout === "1") {
      cols = 1;
      rows = 1;
      boxWidth = pageWidth - marginLeftRight * 2;
      boxHeight = pageHeight - marginTop - marginBottom;
      isLarge = true;
      y = await drawSection(cols, rows, boxWidth, boxHeight, isLarge);
    } else if (layout === "2") {
      cols = 2;
      rows = 1;
      boxWidth = (pageWidth - marginLeftRight * 2 - (cols - 1) * 6) / cols;
      boxHeight = pageHeight - marginTop - marginBottom;
      isLarge = true;
      y = await drawSection(cols, rows, boxWidth, boxHeight, isLarge);
    } else if (layout === "4") {
      cols = 2;
      rows = 2;
      boxWidth = (pageWidth - marginLeftRight * 2 - (cols - 1) * 6) / cols;
      boxHeight = (pageHeight - marginTop - marginBottom - (rows - 1) * 6) / rows;
      isLarge = true;
      y = await drawSection(cols, rows, boxWidth, boxHeight, isLarge);
    } else if (layout === "8") {
      cols = 2;
      rows = 4;
      boxWidth = (pageWidth - marginLeftRight * 2 - (cols - 1) * 6) / cols;
      boxHeight = (pageHeight - marginTop - marginBottom - (rows - 1) * 6) / rows;
      isLarge = false;
      y = await drawSection(cols, rows, boxWidth, boxHeight, isLarge);
    } else if (layout === "16") {
      cols = 2;
      rows = 8;
      boxWidth = (pageWidth - marginLeftRight * 2 - (cols - 1) * 6) / cols;
      boxHeight = (pageHeight - marginTop - marginBottom - (rows - 1) * 6) / rows;
      isLarge = false;
      y = await drawSection(cols, rows, boxWidth, boxHeight, isLarge);
    } else if (layout === "4-2-4") {
      cols = 2;
      rows = 2;
      boxWidth = (pageWidth - marginLeftRight * 2 - (cols - 1) * 6) / cols;
      boxHeight = ((pageHeight - marginTop - marginBottom) * 0.3 - (rows - 1) * 6) / rows;
      isLarge = false;
      y = await drawSection(cols, rows, boxWidth, boxHeight, isLarge);
      cols = 2;
      rows = 1;
      boxWidth = (pageWidth - marginLeftRight * 2 - (cols - 1) * 6) / cols;
      boxHeight = ((pageHeight - marginTop - marginBottom) * 0.4 - (rows - 1) * 6) / rows;
      isLarge = true;
      y = await drawSection(cols, rows, boxWidth, boxHeight, isLarge);
      cols = 2;
      rows = 2;
      boxWidth = (pageWidth - marginLeftRight * 2 - (cols - 1) * 6) / cols;
      boxHeight = ((pageHeight - marginTop - marginBottom) * 0.3 - (rows - 1) * 6) / rows;
      isLarge = false;
      y = await drawSection(cols, rows, boxWidth, boxHeight, isLarge);
    }
    if (productIndex < products.length) {
      doc.addPage();
      pageNumber++;
      if (backgroundImg) {
        try {
          doc.addImage(backgroundImg, backgroundImg.includes('image/png') ? "PNG" : "JPEG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
        } catch (e) {
          console.error('Błąd dodawania tła:', e);
          document.getElementById('debug').innerText = "Błąd dodawania tła";
        }
      }
      if (bannerImg) {
        try {
          doc.addImage(bannerImg, bannerImg.includes('image/png') ? "PNG" : "JPEG", 0, 0, pageWidth, bannerHeight, undefined, "FAST");
        } catch (e) {
          console.error('Błąd dodawania banera:', e);
          document.getElementById('debug').innerText = "Błąd dodawania banera";
        }
      }
      doc.setFont("Arial", "bold");
      doc.setFontSize(12);
      doc.text(`${pageNumber}`, pageWidth - 20, pageHeight - 10, { align: "right" });
      x = marginLeftRight;
      y = marginTop;
    }
  }
  hideProgressModal();
  if (save) doc.save("katalog.pdf");
  return doc;
}

// === POPRAW CYFRĘ KONTROLNĄ EAN-13 ===
function fixEan13Checksum(ean13) {
  if (!/^\d{13}$/.test(ean13)) return ean13;
  const d = ean13.slice(0,12).split('').map(Number);
  let s = 0;
  for (let i = 0; i < 12; i++) s += d[i] * (i % 2 === 0 ? 1 : 3);
  return ean13.slice(0,12) + ((10 - s % 10) % 10);
}

async function generatePDF() {
  const { jsPDF } = window.jspdf;
  await buildPDF(jsPDF, true);
}

async function previewPDF() {
  showProgressModal();
  const { jsPDF } = window.jspdf;
  const doc = await buildPDF(jsPDF, false);
  const blobUrl = doc.output("bloburl");
  document.getElementById("pdfIframe").src = blobUrl;
  document.getElementById("pdfPreview").style.display = "block";
}

function showProgressModal() {
  document.getElementById('progressModal').style.display = 'block';
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressText').textContent = '0%';
}

function hideProgressModal() {
  document.getElementById('progressModal').style.display = 'none';
}

window.importExcel = importExcel;
window.generatePDF = generatePDF;
window.previewPDF = previewPDF;
window.showBannerModal = showBannerModal;
window.hideBannerModal = hideBannerModal;
window.showEditModal = showEditModal;
window.hideEditModal = hideEditModal;
window.saveEdit = saveEdit;

loadProducts();