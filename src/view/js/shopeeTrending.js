// src/view/js/shopeeTrending.js

const shopeeTrendingProductsGrid = document.getElementById('shopee-trending-products-grid');

async function fetchTrendingShopeeProducts() {
    if (!shopeeTrendingProductsGrid) return;

    try {
        const response = await fetch('/api/shopee-affiliate/trending-products');
        if (!response.ok) {
            throw new Error('Failed to fetch trending Shopee products');
        }
        const products = await response.json();
        renderShopeeProducts(products);
    } catch (error) {
        console.error('Error fetching trending Shopee products:', error);
        shopeeTrendingProductsGrid.innerHTML = '<p>Não foi possível carregar os produtos em alta da Shopee no momento.</p>';
    }
}

function renderShopeeProducts(products) {
    if (!shopeeTrendingProductsGrid) return;

    shopeeTrendingProductsGrid.innerHTML = ''; // Clear previous content

    if (products.length === 0) {
        shopeeTrendingProductsGrid.innerHTML = '<p>Nenhum produto em alta da Shopee encontrado.</p>';
        return;
    }

    products.forEach(product => {
        const productCard = document.createElement('a');
        productCard.href = product.product_url;
        productCard.target = '_blank';
        productCard.rel = 'noopener noreferrer';
        productCard.classList.add('shopee-product-card');

        productCard.innerHTML = `
            <img src="${product.image_url}" alt="${product.name}" class="shopee-product-card__image">
            <h3 class="shopee-product-card__name">${product.name}</h3>
            <p class="shopee-product-card__price">${product.price}</p>
        `;
        shopeeTrendingProductsGrid.appendChild(productCard);
    });
}

// Call the function to fetch products when the page loads
fetchTrendingShopeeProducts();
