// src/view/js/shopeeTrending.js

const shopeeGrid = document.getElementById('shopee-trending-products-grid');
const shopeeFilters = document.getElementById('shopee-filters');
let allProducts = [];

if (!shopeeGrid) {
    console.error('Error: Element with id "shopee-trending-products-grid" not found.');
}

async function fetchAndRenderTrendingProducts() {
    if (!shopeeGrid) return;
    showLoading();
    try {
        const response = await fetch('/api/products/trending');
        if (!response.ok) {
            throw new Error('Failed to fetch trending Shopee products');
        }
        allProducts = await response.json();
        renderShopeeProducts(allProducts);
    } catch (error) {
        console.error('Error fetching trending Shopee products:', error);
        shopeeGrid.innerHTML = '<p>Não foi possível carregar os produtos em alta da Shopee no momento.</p>';
    }
}

function renderShopeeProducts(products) {
    if (!shopeeGrid || !shopeeFilters) return;
    hideLoading();
    shopeeGrid.innerHTML = ''; // Clear previous content
    shopeeFilters.style.display = 'none'; // Keep filters hidden for now

    if (products.length === 0) {
        shopeeGrid.innerHTML = '<p>Nenhum produto em alta da Shopee encontrado.</p>';
        return;
    }

    products.forEach(product => {
        const productCard = document.createElement('a');
        productCard.href = product.offer_link;
        productCard.target = '_blank';
        productCard.rel = 'noopener noreferrer';
        productCard.classList.add('shopee-product-card');

            const realPrice = parseFloat(product.price);

            // Generate a random discount between 51% and 75%
            const discountValue = Math.random() * (0.75 - 0.51) + 0.51;
            const discountPercentage = Math.floor(discountValue * 100);

            // Calculate the "original" price based on the random discount
            const originalPrice = realPrice / (1 - discountValue);

            productCard.innerHTML = `
                <div class="shopee-product-card__discount-badge">-${discountPercentage}%</div>
                <img data-src="${product.image_url}" alt="${product.name}" class="shopee-product-card__image lazy-load">
                <h3 class="shopee-product-card__name">${product.name}</h3>
                <div class="shopee-product-card__pricing">
                    <p class="shopee-product-card__price">R$ ${realPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p class="shopee-product-card__price--original">R$ ${originalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
            `;
        productCard.addEventListener('click', () => {
            if (window.dataLayer) {
                window.dataLayer.push({
                    event: 'shopee_product_click',
                    product_name: product.name,
                    product_id: product.name, // Using name as ID if no specific ID is available
                    offer_link: product.offer_link
                });
            }
        });
        shopeeGrid.appendChild(productCard);
    });
    lazyLoadImages();
}

function showLoading() {
    if (!shopeeGrid) return;
    shopeeGrid.innerHTML = '<div class="shopee-loader"></div>';
}

function hideLoading() {
    // Content will be replaced, so no need to hide loader explicitly
}

function lazyLoadImages() {
    const lazyImages = document.querySelectorAll('.lazy-load');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const image = entry.target;
                image.src = image.dataset.src;
                image.classList.remove('lazy-load');
                imageObserver.unobserve(image);
            }
        });
    });

    lazyImages.forEach(image => {
        imageObserver.observe(image);
    });
}

// Call the function to fetch trending products when the page loads
if (shopeeGrid) {
    fetchAndRenderTrendingProducts();
}
