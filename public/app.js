document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const priceSlider = document.getElementById('price-slider');
  const priceVal = document.getElementById('price-val');
  const productsGrid = document.getElementById('products-grid');
  
  const emptyState = document.getElementById('empty-state');
  const loadingState = document.getElementById('loading-state');
  const metaInfo = document.getElementById('meta-info');
  const btnSearch = document.querySelector('.btn-search');

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

  // Atualizar exibição do slider de preço
  priceSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    if (val == 1000) {
      priceVal.textContent = 'Sem Limite';
    } else {
      priceVal.textContent = `R$ ${val}`;
    }
  });

  // Fechar Modal
  modalClose.addEventListener('click', () => {
    productModal.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === productModal) {
      productModal.style.display = 'none';
    }
  });

  // Submissão de Busca
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const query = searchInput.value.trim();
    if (!query) return;

    // Obter filtros
    const genderEl = document.querySelector('input[name="gender"]:checked');
    const gender = genderEl ? genderEl.value : '';
    
    const maxPriceVal = priceSlider.value;
    const maxPrice = maxPriceVal == 1000 ? '' : maxPriceVal;

    // Obter lojas selecionadas
    const stores = [];
    if (document.getElementById('store-renner').checked) stores.push('renner');
    if (document.getElementById('store-cea').checked) stores.push('cea');
    if (document.getElementById('store-zara').checked) stores.push('zara');

    if (stores.length === 0) {
      alert('Selecione pelo menos uma loja para buscar!');
      return;
    }

    // Configurar estados de UI
    emptyState.style.display = 'none';
    productsGrid.style.display = 'none';
    loadingState.style.display = 'grid';
    btnSearch.classList.add('loading');
    metaInfo.innerHTML = '';

    try {
      // Construir URL de busca
      const params = new URLSearchParams({
        q: query,
        gender: gender,
        stores: stores.join(',')
      });
      if (maxPrice) params.append('maxPrice', maxPrice);

      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Falha ao obter resultados do servidor');
      }

      const data = await response.json();
      renderProducts(data.products, data.timestamp);

    } catch (err) {
      console.error(err);
      productsGrid.innerHTML = '';
      emptyState.style.display = 'flex';
      emptyState.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i>
        <h3>Erro ao buscar produtos</h3>
        <p>Não foi possível conectar com os servidores de busca no momento. Por favor, tente novamente.</p>
      `;
    } finally {
      loadingState.style.display = 'none';
      btnSearch.classList.remove('loading');
    }
  });

  // Renderizar produtos no Grid
  function renderProducts(products, timestamp) {
    productsGrid.innerHTML = '';
    
    if (!products || products.length === 0) {
      productsGrid.style.display = 'none';
      emptyState.style.display = 'flex';
      emptyState.innerHTML = `
        <i class="fa-solid fa-magnifying-glass-minus"></i>
        <h3>Nenhum produto encontrado</h3>
        <p>Tente mudar o termo de busca ou ajustar a faixa de preço e os filtros de gênero.</p>
      `;
      metaInfo.innerHTML = `Busca finalizada às <span>${timestamp}</span> • <span>0</span> produtos`;
      return;
    }

    emptyState.style.display = 'none';
    productsGrid.style.display = 'grid';

    // Escrever metadados
    metaInfo.innerHTML = `Busca finalizada às <span>${timestamp}</span> • Encontrados <span>${products.length}</span> produtos`;

    products.forEach(product => {
      const card = document.createElement('div');
      card.className = 'product-card';
      
      // Fallback de imagem caso dê erro ao carregar ou esteja vazia
      const displayImage = product.image || 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?q=80&w=400&auto=format&fit=crop';

      card.innerHTML = `
        <div class="product-image-container">
          <img src="${displayImage}" alt="${product.title}" onerror="this.src='https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?q=80&w=400&auto=format&fit=crop'">
          <span class="store-badge ${product.store.toLowerCase().replace('&', '')}">${product.store}</span>
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
  }

  // Abrir Modal com detalhes
  function openModal(product, image) {
    modalImage.src = image;
    modalStore.textContent = product.store;
    
    // Classes de cores para a badge da loja no modal
    modalStore.className = 'modal-store-badge';
    modalStore.classList.add(product.store.toLowerCase().replace('&', ''));
    
    modalTitle.textContent = product.title;
    modalPrice.textContent = product.price;
    modalDescription.textContent = product.description || 'Nenhuma descrição detalhada disponível para este produto.';
    modalCharacteristics.textContent = product.characteristics || 'Características gerais de moda.';
    modalLink.href = product.link || '#';

    productModal.style.display = 'block';
  }
});
