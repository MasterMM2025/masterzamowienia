function createSearchBar() {
    const searchBarContainer = document.createElement('div');
    searchBarContainer.id = 'search-bar';
    searchBarContainer.style.cssText = `
        width: 100%;
        max-width: 900px;
        margin: 10px auto 0;
        padding: 10px;
        background-color: #f1f1f1;
        border-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        z-index: 900;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
    `;
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search products...';
    searchInput.style.cssText = `
        flex: 1;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
        min-width: 150px;
    `;
    const categoryFilter = document.createElement('select');
    categoryFilter.style.cssText = `
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
        min-width: 120px;
    `;
    const filterOptions = [
        { value: '', text: 'All Categories' },
        { value: 'Słodycze', text: 'Słodycze' },
        { value: 'Kuchnia dania gotowe', text: 'Kuchnia dania gotowe' },
        { value: 'Dodatki do potraw', text: 'Dodatki do potraw' },
        { value: 'Przetwory owocowo-warzywne', text: 'Przetwory owocowo-warzywne' }
    ];
    filterOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.text = option.text;
        categoryFilter.appendChild(optionElement);
    });
    const rankingFilter = document.createElement('select');
    rankingFilter.id = 'ranking-filter';
    rankingFilter.style.cssText = `
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
        min-width: 150px;
    `;
    const rankingOptions = [
        { value: '', text: 'Sort by Ranking' },
        { value: 'desc', text: 'Highest to Lowest' },
        { value: 'asc', text: 'Lowest to Highest' }
    ];
    rankingOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.text = option.text;
        rankingFilter.appendChild(optionElement);
    });
    const clearFiltersButton = document.createElement('button');
    clearFiltersButton.innerText = 'Wyczyść filtry';
    clearFiltersButton.style.cssText = `
        padding: 8px 15px;
        background-color: #6c757d;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.3s;
        min-width: 100px;
    `;
    clearFiltersButton.onmouseover = () => clearFiltersButton.style.backgroundColor = '#5a6268';
    clearFiltersButton.onmouseout = () => clearFiltersButton.style.backgroundColor = '#6c757d';
    clearFiltersButton.onclick = () => {
        searchInput.value = '';
        categoryFilter.value = '';
        rankingFilter.value = '';
        applyFilters();
    };
    searchBarContainer.appendChild(searchInput);
    searchBarContainer.appendChild(categoryFilter);
    searchBarContainer.appendChild(rankingFilter);
    searchBarContainer.appendChild(clearFiltersButton);
    const bannerContainer = document.querySelector('.banner-container');
    if (bannerContainer) {
        bannerContainer.parentNode.insertBefore(searchBarContainer, bannerContainer.nextSibling);
    } else {
        console.error("Banner container element not found for search bar placement!");
    }

    // Definicja applyFilters w kontekście createSearchBar
    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const selectedCategory = categoryFilter.value;
        const sortOrder = rankingFilter.value;
        const productList = document.getElementById(`product-list-${activeTab}`);
        if (!productList) {
            console.error("Active product list not found!");
            return;
        }
        let products = Array.from(productList.querySelectorAll('.product'));

        console.log("Applying filters for", activeTab, "Products:", products.length, "Data:", productsData[activeTab] ? productsData[activeTab].length : 'undefined'); // Debug

        // Sortowanie według rankingu, jeśli wybrano i dane są dostępne
        if (sortOrder && productsData[activeTab] && productsData[activeTab].length > 0) {
            products.sort((a, b) => {
                const rankA = parseInt(productsData[activeTab][a.dataset.index]?.Ranking) || 0;
                const rankB = parseInt(productsData[activeTab][b.dataset.index]?.Ranking) || 0;
                console.log("Sorting:", a.dataset.index, rankA, b.dataset.index, rankB); // Debug
                return sortOrder === 'desc' ? rankB - rankA : rankA - rankB;
            });
            products.forEach(product => productList.appendChild(product));
        }

        products.forEach(product => {
            const productName = product.querySelector('.product-name')?.textContent.toLowerCase() || '';
            const productCode = product.querySelector('.product-code')?.textContent.toLowerCase() || '';
            const productIndex = product.dataset.index;
            const productCategory = productsData[activeTab] && productsData[activeTab][productIndex]?.Kategoria?.toLowerCase() || '';
            const nameWords = productName.split(/\s+/);
            const normalizedSelectedCategory = selectedCategory.toLowerCase().replace(/-/g, ' ');
            const normalizedProductCategory = productCategory.replace(/-/g, ' ');

            console.log("Filter Debug - Index:", productIndex, "Category:", productCategory, "Selected:", selectedCategory); // Debug

            const searchMatch = searchTerm === '' || searchTerm.split(/\s+/).every(term =>
                nameWords.some(word => word.startsWith(term)) || productCode.includes(term)
            );
            const categoryMatch = selectedCategory === '' || normalizedProductCategory === normalizedSelectedCategory;

            if (searchMatch && categoryMatch) {
                product.style.visibility = 'visible';
                product.style.position = 'relative';
            } else {
                product.style.visibility = 'hidden';
                product.style.position = 'absolute';
            }
        });
    }

    // Rejestracja zdarzeń
    searchInput.oninput = applyFilters;
    categoryFilter.onchange = applyFilters;
    rankingFilter.onchange = applyFilters;

    // Przechowanie funkcji applyFilters w searchBar dla dostępu z switchTab
    searchBarContainer.applyFilters = applyFilters;
}

function loadProducts(country) {
    console.log("Loading data for:", country);
    let url = 'https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/produktyjson.json';
    if (country === 'lithuania') {
        url = 'https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/LITWA.json';
    } else if (country === 'bulgaria' || country === 'romania') {
        url = 'https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/BLUGARIA.json';
    } else if (country === 'ukraine') {
        url = 'https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/UKRAINA.json';
    }
    return fetch(url)
        .then(response => {
            console.log("Fetch response for", country, ":", response.status, "URL:", url);
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status} - ${url}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Data loaded for", country, ":", data);
            if (productsData[country].length > 0) {
                data = data.map((product, index) => {
                    if (productsData[country][index] && productsData[country][index].quantity) {
                        return { ...product, quantity: productsData[country][index].quantity, dataset: { index } };
                    }
                    return { ...product, quantity: 0, dataset: { index } };
                });
            } else {
                productsData[country] = data.map((product, index) => ({ ...product, quantity: 0, dataset: { index } }));
            }
            const productList = document.getElementById(`product-list-${country}`);
            if (!productList) {
                console.error(`Product list not found for ${country}`);
                return;
            }
            productList.innerHTML = '';
            data.forEach((product, index) => {
                const productElement = document.createElement("div");
                productElement.classList.add("product");
                productElement.dataset.index = index;
                const originalPrice = parseFloat(product['CENA']) || 0;
                const discountedPrice = applyDiscount(originalPrice, index, country);
                let imageUrl = '';
                if (country === 'lithuania') {
                    imageUrl = `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-litwa/${product['INDEKS']}.jpg`;
                } else if (country === 'bulgaria' || country === 'romania') {
                    imageUrl = `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-bulgaria/${product['INDEKS']}.jpg`;
                } else if (country === 'ukraine') {
                    imageUrl = `https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-ukraina/${product['INDEKS']}.jpg`;
                }
                const imgTest = new Image();
                imgTest.src = imageUrl;
                imgTest.onload = () => {
                    let competitorPriceColor = '';
                    if (product['Cena konkurencji'] && originalPrice) {
                        if (parseFloat(product['Cena konkurencji']) < originalPrice) {
                            competitorPriceColor = 'color: red;';
                        } else if (parseFloat(product['Cena konkurencji']) > originalPrice) {
                            competitorPriceColor = 'color: green;';
                        }
                    }
                    const img = document.createElement('img');
                    img.src = imageUrl;
                    img.alt = "Photo";
                    img.style.cssText = 'max-width: 100px; width: 100%; height: auto; position: relative; z-index: 0;';
                    if (window.innerWidth <= 600) {
                        img.onclick = function() {
                            this.classList.toggle('enlarged');
                        };
                    } else {
                        productElement.style.minWidth = '350px';
                        productElement.style.padding = '10px';
                        const details = productElement.querySelector('.product-details');
                        if (details) {
                            details.style.fontSize = '14px';
                        }
                    }
                    productElement.appendChild(img);
                    const details = document.createElement('div');
                    details.classList.add('product-details');
                    const customPrice = customPrices[`${country}-${index}`];
                    const priceDisplay = customPrice !== undefined && customPrice !== null && !isNaN(customPrice)
                        ? `${discountedPrice.toFixed(2)} GBP (Custom)`
                        : `${discountedPrice.toFixed(2)} GBP (Original: ${originalPrice.toFixed(2)} GBP)`;
                    let detailsHTML = `
                        <div class="product-code">Index: ${product['INDEKS']}</div>
                        <div class="product-name">${product['NAZWA']}</div>
                        <div class="pack-info">Pack: ${product['OPAKOWANIE']}</div>
                        <div class="price">${priceDisplay}</div>
                        <button onclick="showPriceDialog('${country}', ${index}, ${originalPrice})" style="margin-top: 5px; margin-right: 5px; padding: 5px 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Set Custom Price</button>
                        <button onclick="resetCustomPrice('${country}', ${index})" style="margin-top: 5px; padding: 5px 10px; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Reset Custom Price</button>
                    `;
                    // Wyświetlanie ceny konkurencji i stanów magazynowych w jednym miejscu pod nazwą
                    let additionalInfo = '';
                    if (showCompetitorPrice && product['Cena konkurencji']) {
                        let competitorPriceColor = '';
                        if (parseFloat(product['Cena konkurencji']) < originalPrice) {
                            competitorPriceColor = 'color: red;';
                        } else if (parseFloat(product['Cena konkurencji']) > originalPrice) {
                            competitorPriceColor = 'color: green;';
                        }
                        additionalInfo += `<div class="competitor-price" style="margin-top: 5px; font-size: 16px; ${competitorPriceColor}">Competitor Price: ${product['Cena konkurencji']} GBP</div>`;
                    }
                    if (showStockInfo && product['Stany magazynowe']) {
                        additionalInfo += `<div class="stock-info" style="margin-top: 5px; font-size: 16px; color: #666;">Stany magazynowe: ${product['Stany magazynowe']}</div>`;
                    }
                    if (additionalInfo) {
                        detailsHTML += `<div class="additional-info" style="margin-top: 5px;">${additionalInfo}</div>`;
                    }
                    details.innerHTML = detailsHTML;
                    productElement.appendChild(details);
                    const controls = document.createElement('div');
                    controls.classList.add('quantity-controls');
                    controls.innerHTML = `
                        <button onclick="changeQuantity('${country}', ${index}, -1)">-</button>
                        <input type="number" id="quantity-${country}-${index}" value="${product.quantity || 0}" readonly>
                        <button onclick="changeQuantity('${country}', ${index}, 1)">+</button>
                    `;
                    productElement.appendChild(controls);
                    productList.appendChild(productElement);
                };
                imgTest.onerror = () => {
                    console.warn(`Skipped index ${product['INDEKS']} due to missing photo: ${imageUrl}`);
                };
            });
            calculateTotal();
            updateCartInfo();
            if (country === activeTab) {
                if (typeof applyFilters === 'function') {
                    setTimeout(() => applyFilters(), 100);
                }
            }
        })
        .catch(error => console.error(`Error loading data for ${country}:`, error));
}

function switchTab(country) {
    activeTab = country;
    console.log("Switching to tab:", country);
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.product-list').forEach(list => list.classList.remove('active'));
    const selectedTab = document.querySelector(`[onclick="switchTab('${country}')"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    } else {
        console.error("Tab not found:", country);
    }
    const selectedList = document.getElementById(`product-list-${country}`);
    if (selectedList) {
        selectedList.classList.add('active');
    } else {
        console.error("Product list not found for:", country);
    }
    window.scrollTo(0, 0);
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
        const searchInput = searchBar.querySelector('input');
        const categoryFilter = searchBar.querySelector('select');
        const rankingFilter = searchBar.querySelector('#ranking-filter');
        if (searchInput) searchInput.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (rankingFilter) rankingFilter.value = '';
        const productLists = document.querySelectorAll('.product-list.active .product');
        productLists.forEach(product => {
            product.style.visibility = 'visible';
            product.style.position = 'relative';
        });
        // Wywołanie applyFilters z createSearchBar
        const applyFiltersFunc = searchBar.applyFilters;
        if (typeof applyFiltersFunc === 'function') {
            applyFiltersFunc();
        }
    }
    const saveButtons = document.getElementById('save-buttons');
    if (saveButtons) {
        saveButtons.style.display = country === 'cart' ? 'block' : 'none';
        if (country === 'cart' && saveButtons.innerHTML === '') {
            saveButtons.innerHTML = `
                <button onclick="saveCartToCSV()" style="padding: 8px 15px; background-color: #28a745; color: white; border: none; border-radius: 4px; margin-right: 10px; cursor: pointer;">Zapisz do CSV</button>
                <button onclick="saveCartToXLS()" style="padding: 8px 15px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Zapisz do XLS</button>
            `;
        }
    }
    updateBanner();
    if (country === 'cart') {
        updateCart();
    } else if (productsData[country] && productsData[country].length === 0) {
        loadProducts(country);
    } else {
        calculateTotal();
        updateCartInfo();
    }
    // Upewnienie się, że koszyk jest aktualizowany po przełączeniu
    if (document.getElementById('product-list-cart')) {
        updateCart();
    }
    updateCartInfo();
}

function changeQuantity(country, index, change) {
    const input = document.getElementById(`quantity-${country}-${index}`);
    let currentQuantity = parseInt(input.value) || 0;
    if (currentQuantity + change >= 0) {
        currentQuantity += change;
        input.value = currentQuantity;
        productsData[country][index].quantity = currentQuantity;
        // Aktualizacja koszyka za każdym razem, gdy zmienia się ilość
        updateCart();
        calculateTotal();
        updateCartInfo();
        saveCartState();
    }
}

function updateCart() {
    const cartList = document.getElementById('product-list-cart');
    if (!cartList) {
        console.error("Cart list element not found!");
        return;
    }
    cartList.innerHTML = '';
    let totalCartValue = 0;
    for (let country in productsData) {
        productsData[country].forEach((product, index) => {
            if (product.quantity > 0) {
                const imageUrl = `${country === 'lithuania' ? 'https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-litwa/' :
                    country === 'bulgaria' || country === 'romania' ? 'https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-bulgaria/' :
                    'https://raw.githubusercontent.com/Marcin870119/masterzamowienia/main/zdjecia-ukraina/'}${product['INDEKS']}.jpg`;
                const productElement = document.createElement("div");
                productElement.classList.add("product");
                const originalPrice = parseFloat(product['CENA']) || 0;
                const discountedPrice = applyDiscount(originalPrice, index, country);
                const itemValue = discountedPrice * parseFloat(product['OPAKOWANIE'] || 1) * product.quantity;
                const customPrice = customPrices[`${country}-${index}`];
                const priceDisplay = customPrice !== undefined && customPrice !== null && !isNaN(customPrice)
                    ? `${discountedPrice.toFixed(2)} GBP (Custom)`
                    : `${discountedPrice.toFixed(2)} GBP (Original: ${originalPrice.toFixed(2)} GBP)`;
                productElement.innerHTML = `
                    <img src="${imageUrl}" alt="Photo" style="position: relative; z-index: 0;">
                    <div class="product-details">
                        <div class="product-code">Index: ${product['INDEKS']}</div>
                        <div class="product-name">${product['NAZWA']} (${country.charAt(0).toUpperCase() + country.slice(1)})</div>
                        <div class="pack-info">Pack: ${product['OPAKOWANIE']}</div>
                        <div class="price">${itemValue.toFixed(2)} GBP (Unit: ${priceDisplay})</div>
                    </div>
                    <div class="quantity-controls cart">
                        <button onclick="changeQuantity('${country}', ${index}, -1)">-</button>
                        <input type="number" id="quantity-${country}-${index}" value="${product.quantity || 0}" readonly>
                        <button onclick="changeQuantity('${country}', ${index}, 1)">+</button>
                    </div>
                `;
                // Wyświetlanie ceny konkurencji i stanów magazynowych w jednym miejscu pod nazwą
                const details = productElement.querySelector('.product-details');
                let additionalInfo = '';
                if (showCompetitorPrice && product['Cena konkurencji']) {
                    let competitorPriceColor = '';
                    if (parseFloat(product['Cena konkurencji']) < originalPrice) {
                        competitorPriceColor = 'color: red;';
                    } else if (parseFloat(product['Cena konkurencji']) > originalPrice) {
                        competitorPriceColor = 'color: green;';
                    }
                    additionalInfo += `<div class="competitor-price" style="margin-top: 5px; font-size: 16px; ${competitorPriceColor}">Competitor Price: ${product['Cena konkurencji']} GBP</div>`;
                }
                if (showStockInfo && product['Stany magazynowe']) {
                    additionalInfo += `<div class="stock-info" style="margin-top: 5px; font-size: 16px; color: #666;">Stany magazynowe: ${product['Stany magazynowe']}</div>`;
                }
                if (additionalInfo) {
                    details.innerHTML += `<div class="additional-info" style="margin-top: 5px;">${additionalInfo}</div>`;
                }
                cartList.appendChild(productElement);
                totalCartValue += itemValue;
            }
        });
    }
    document.getElementById("cart-total").innerText = `Cart value: ${totalCartValue.toFixed(2)} GBP`;
    updateCartInfo();
}

function removeItem(country, index) {
    productsData[country][index].quantity = 0;
    if (activeTab === 'cart') {
        updateCart();
    } else {
        calculateTotal();
        updateCartInfo();
    }
    saveCartState();
    if (document.getElementById(`quantity-${country}-${index}`)) {
        document.getElementById(`quantity-${country}-${index}`).value = '0';
    }
}

function calculateTotal() {
    let totalValue = 0;
    let categoryTotalsText = '';
    for (let country in productsData) {
        let countryTotal = 0;
        productsData[country].forEach((product, index) => {
            if (product.quantity > 0) {
                countryTotal += applyDiscount(parseFloat(product['CENA']) || 0, index, country) * parseFloat(product['OPAKOWANIE'] || 1) * product.quantity;
            }
        });
        categoryTotals[country] = Number(countryTotal.toFixed(2));
        if (countryTotal > 0) {
            categoryTotalsText += `${country.charAt(0).toUpperCase() + country.slice(1)}: ${countryTotal.toFixed(2)} GBP\n`;
        }
    }
    totalValue = categoryTotals.lithuania + categoryTotals.bulgaria + categoryTotals.ukraine + categoryTotals.romania;
    document.getElementById("category-totals").innerText = categoryTotalsText.trim();
    document.getElementById("total-value").innerText = `Total order value: ${totalValue.toFixed(2)} GBP`;
}

function submitOrder() {
    const storeName = document.getElementById('store-name').value;
    const email = document.getElementById('email').value;
    if (!email || !storeName) {
        alert("Please fill in all fields.");
        return;
    }
    let orderMessage = `Order for store: ${storeName}\n\n`;
    for (let country in productsData) {
        let countryTotal = 0;
        let hasItems = false;
        orderMessage += `${country.charAt(0).toUpperCase() + country.slice(1)}:\n`;
        orderMessage += "Index\tName\tQuantity\tPrice\n";
        productsData[country].forEach((product, index) => {
            if (product.quantity > 0) {
                hasItems = true;
                const price = applyDiscount(parseFloat(product['CENA']) || 0, index, country);
                orderMessage += `${product.INDEKS}\t${product['NAZWA']}\t${product.quantity}\t${price.toFixed(2)} GBP\n`;
                countryTotal += price * parseFloat(product['OPAKOWANIE'] || 1) * product.quantity;
            }
        });
        if (!hasItems) {
            orderMessage += "No items in cart for this category.\n\n";
        } else {
            orderMessage += `Total for ${country.charAt(0).toUpperCase() + country.slice(1)}: ${countryTotal.toFixed(2)} GBP\n\n`;
        }
    }
    orderMessage += `Total order value: ${(categoryTotals.lithuania + categoryTotals.bulgaria + categoryTotals.ukraine + categoryTotals.romania).toFixed(2)} GBP\n`;
    orderMessage += `Discount: ${discountPercentage}%\n`;
    orderMessage += `Cash Back: ${customCashBackPercentage}%`;
    const formData = new FormData();
    formData.append("email", email);
    formData.append("store-name", storeName);
    formData.append("message", orderMessage);
    console.log("Sending order:", { email, storeName, orderMessage });
    fetch("https://formspree.io/f/xanwzpgj", {
        method: "POST",
        body: formData,
        headers: {
            'Accept': 'application/json'
        }
    }).then(response => {
        console.log("Server response:", response.status, response.statusText);
        if (response.ok) {
            alert("Order sent!");
            clearCartState();
        } else {
            throw new Error("Server response error");
        }
    }).catch(error => {
        console.error("Error sending order:", error);
        alert("Error sending order.");
    });
}

// Funkcja ładowania strony
window.onload = async function() {
    showInitialDialog();
    createSidebar();
    createSearchBar();
    await loadProducts('lithuania');
    await Promise.all(['bulgaria', 'ukraine', 'romania'].map(country => loadProducts(country)));
    switchTab('lithuania');
    loadCartState();
    updateBanner();
    updateCartInfo();
    if (typeof applyFilters === 'function') {
        applyFilters(); // Początkowe zastosowanie filtrów
    }
};
