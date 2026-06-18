document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const priceMinInput = document.getElementById('price-min');
  const priceMaxInput = document.getElementById('price-max');
  const categorySelect = document.getElementById('category-select');
  const btnPrint = document.getElementById('btn-print');
  const productsGrid = document.getElementById('products-grid');
  
  const emptyState = document.getElementById('empty-state');
  const loadingState = document.getElementById('loading-state');
  const metaInfo = document.getElementById('meta-info');
  const btnSearch = document.querySelector('.btn-search');

  // Novos elementos de paginação e filtros
  const paginationContainer = document.getElementById('pagination-container');
  const btnLoadMore = document.getElementById('btn-load-more');
  const loadMoreLoader = document.querySelector('.load-more-loader');
  const loadMoreText = document.querySelector('.load-more-text');

  // Modal
  const productModal = document.getElementById('product-modal');
  const modalClose = document.getElementById('modal-close');
  const modalImage = document.getElementById('modal-image');
  const modalStore = document.getElementById('modal-store');
  const modalTitle = document.getElementById('modal-title');
  const modalPrice = document.getElementById('modal-price');
  const modalDescription = document.getElementById('modal-description');
  const modalCharacteristics = document.getElementById('modal-characteristics');
  const modalLink = document.getElementById('modal-link');

  // Estado local do filtro e paginação
  let selectedSize = '';
  let currentPage = 1;
  let accumulatedProductsCount = 0;

  // Tratar cliques nos badges rápidos de preço
  const priceBadges = document.querySelectorAll('.price-badge');
  priceBadges.forEach(badge => {
    badge.addEventListener('click', () => {
      if (badge.classList.contains('active')) {
        badge.classList.remove('active');
        priceMinInput.value = '';
        priceMaxInput.value = '';
      } else {
        priceBadges.forEach(b => b.classList.remove('active'));
        badge.classList.add('active');
        priceMinInput.value = badge.dataset.min || '';
        priceMaxInput.value = badge.dataset.max || '';
        // Disparar a submissão de busca automática
        searchForm.dispatchEvent(new Event('submit'));
      }
    });
  });

  // Evento do Botão Imprimir (PDF)
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // Fechar Modal
  modalClose.addEventListener('click', () => {
    productModal.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === productModal) {
      productModal.style.display = 'none';
    }
  });

  // --- CONTROLES DE TAMANHO (Grade de Botões) ---
  const sizeBtns = document.querySelectorAll('.size-btn');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        selectedSize = '';
      } else {
        sizeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSize = btn.dataset.value;
      }
    });
  });

  // --- CONTROLES DE BADGES RÁPIDAS (Tags) ---
  const badgeTags = document.querySelectorAll('.badge-tag');
  badgeTags.forEach(tag => {
    tag.addEventListener('click', () => {
      searchInput.value = tag.dataset.value;
      // Disparar a submissão de busca
      searchForm.dispatchEvent(new Event('submit'));
    });
  });

  // --- SUBMISSÃO DO FORMULÁRIO DE BUSCA ---
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    currentPage = 1;
    accumulatedProductsCount = 0;
    await fetchProducts(false); // false = não anexa, substitui
  });

  // --- BOTÃO DE PAGINAÇÃO (CARREGAR MAIS) ---
  btnLoadMore.addEventListener('click', async () => {
    currentPage++;
    await fetchProducts(true); // true = anexa resultados
  });

  // --- BUSCAR PRODUTOS ---
  async function fetchProducts(append = false) {
    const query = searchInput.value.trim();
    
    // Obter filtros
    const genderEl = document.querySelector('input[name="gender"]:checked');
    const gender = genderEl ? genderEl.value : '';
    
    const minPrice = priceMinInput.value.trim();
    const maxPrice = priceMaxInput.value.trim();
    const category = categorySelect ? categorySelect.value : '';
    const sort = '';

    if (!append) {
      emptyState.style.display = 'none';
      productsGrid.style.display = 'none';
      loadingState.style.display = 'grid';
      btnSearch.classList.add('loading');
      metaInfo.innerHTML = '';
      paginationContainer.style.display = 'none';
      productsGrid.innerHTML = '';
    } else {
      btnLoadMore.disabled = true;
      loadMoreLoader.style.display = 'inline-block';
      loadMoreText.textContent = 'Carregando mais...';
    }

    try {
      const params = new URLSearchParams({
        q: query,
        gender: gender,
        page: currentPage
      });

      if (minPrice) params.append('minPrice', minPrice);
      if (maxPrice) params.append('maxPrice', maxPrice);
      if (selectedSize) params.append('size', selectedSize);
      if (category) params.append('category', category);

      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Falha ao obter resultados do servidor');
      }

      const data = await response.json();
      renderProducts(data.products, data.timestamp, append);

    } catch (err) {
      console.error(err);
      if (!append) {
        productsGrid.innerHTML = '';
        emptyState.style.display = 'flex';
        emptyState.innerHTML = `
          <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i>
          <h3>Erro ao buscar produtos</h3>
          <p>Não foi possível conectar com os servidores de busca da C&A no momento. Por favor, tente novamente.</p>
        `;
      } else {
        alert('Erro ao carregar mais produtos. Por favor, tente novamente.');
      }
    } finally {
      if (!append) {
        loadingState.style.display = 'none';
        btnSearch.classList.remove('loading');
      } else {
        btnLoadMore.disabled = false;
        loadMoreLoader.style.display = 'none';
        loadMoreText.textContent = 'Carregando Mais Produtos';
      }
    }
  }

  // --- RENDERIZAR PRODUTOS ---
  function renderProducts(products, timestamp, append = false) {
    if (!append) {
      productsGrid.innerHTML = '';
    }

    if (!products || products.length === 0) {
      if (!append) {
        productsGrid.style.display = 'none';
        emptyState.style.display = 'flex';
        emptyState.innerHTML = `
          <i class="fa-solid fa-magnifying-glass-minus"></i>
          <h3>Nenhum produto encontrado</h3>
          <p>Tente mudar o termo de busca ou ajustar a faixa de preço e os filtros de tamanho e cor.</p>
        `;
        metaInfo.innerHTML = `Busca finalizada às <span>${timestamp}</span> • <span>0</span> produtos`;
        paginationContainer.style.display = 'none';
      } else {
        // Se já tinha produtos e o "carregar mais" veio vazio
        paginationContainer.style.display = 'none';
        const endMessage = document.createElement('div');
        endMessage.className = 'end-of-catalog-message';
        endMessage.style.cssText = 'grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 1rem;';
        endMessage.textContent = 'Fim dos resultados para esta busca.';
        productsGrid.appendChild(endMessage);
      }
      return;
    }

    emptyState.style.display = 'none';
    productsGrid.style.display = 'grid';

    accumulatedProductsCount += products.length;
    metaInfo.innerHTML = `Busca finalizada às <span>${timestamp}</span> • Exibindo <span>${accumulatedProductsCount}</span> produtos`;

    products.forEach(product => {
      const card = document.createElement('div');
      card.className = 'product-card';
      
      const displayImage = product.image || 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?q=80&w=400&auto=format&fit=crop';

      card.innerHTML = `
        <div class="product-image-container">
          <img src="${displayImage}" alt="${product.title}" onerror="this.src='https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?q=80&w=400&auto=format&fit=crop'">
          <span class="store-badge cea">${product.store}</span>
        </div>
        <div class="product-info">
          <h3 class="product-title">${product.title}</h3>
          <div class="product-price">${product.price}</div>
        </div>
      `;

      // Evento de clique para abrir o Modal
      card.addEventListener('click', () => {
        openModal(product, displayImage);
      });

      productsGrid.appendChild(card);
    });

    // Se vieram exatamente 24 produtos (tamanho da página no backend),
    // indica que pode haver mais registros no catálogo da C&A. Exibe a paginação.
    if (products.length === 24) {
      paginationContainer.style.display = 'flex';
    } else {
      paginationContainer.style.display = 'none';
    }
  }

  // --- ABRIR MODAL DE DETALHES ---
  function openModal(product, image) {
    modalImage.src = image;
    modalStore.textContent = product.store;
    
    modalStore.className = 'modal-store-badge cea';
    
    modalTitle.textContent = product.title;
    modalPrice.textContent = product.price;
    modalDescription.textContent = product.description || 'Nenhuma descrição detalhada disponível.';
    modalCharacteristics.textContent = product.characteristics || 'Características gerais de moda C&A.';
    modalLink.href = product.link || '#';

    productModal.style.display = 'block';
  }
});
