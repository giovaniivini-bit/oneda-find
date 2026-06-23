import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));



// --- PESQUISA C&A ---
async function searchCeA(query, targetGender, minPrice, maxPrice, size, color, sort, from, to) {
  try {
    console.log(`[C&A API Call] Buscando query: "${query}", Gênero: "${targetGender}", Tamanho: "${size}", Preço: ${minPrice}-${maxPrice}, Ordenação: "${sort}", Itens: ${from}-${to}`);

    const ft = query ? query.trim() : '';

    // Montar os filtros (fq - Filter Query)
    const fqParts = [];

    // Filtro de Tamanho (Especificação ID 46)
    if (size) {
      fqParts.push(`specificationFilter_46:${encodeURIComponent(size)}`);
    }

    // Filtro de Preço (Formato P:[min TO max])
    if (minPrice !== null || maxPrice !== null) {
      const min = minPrice !== null ? minPrice : 0;
      const max = maxPrice !== null ? maxPrice : 99999;
      fqParts.push(`P:[${min} TO ${max}]`);
    }

    // Construir a URL da API da C&A baseada em VTEX
    let url = `https://www.cea.com.br/api/catalog_system/pub/products/search`;
    const urlParams = [];

    if (ft) {
      urlParams.push(`ft=${encodeURIComponent(ft)}`);
    }
    if (fqParts.length > 0) {
      urlParams.push(`fq=${fqParts.join(',')}`);
    }
    if (sort) {
      urlParams.push(`O=${sort}`);
    } else {
      urlParams.push(`O=OrderByTopSaleDESC`); // Padrão: mais vendidos
    }
    urlParams.push(`_from=${from}`);
    urlParams.push(`_to=${to}`);

    url += `?${urlParams.join('&')}`;

    console.log(`[C&A URL] ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        // Evitar cache intermediário para sempre obter dados atualizados em tempo real
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      timeout: 10000
    });

    if (!Array.isArray(response.data)) return [];

    return response.data
      .filter(item => {
        // Garantir que o produto tem SKUs
        if (!item.items || item.items.length === 0) return false;
        
        // Pelo menos um SKU deve estar em estoque e ter preço válido
        const hasAvailableSku = item.items.some(sku => {
          const offer = sku?.sellers?.[0]?.commertialOffer;
          return offer && 
                 offer.IsAvailable === true && 
                 offer.AvailableQuantity > 0 && 
                 offer.Price !== null && 
                 offer.Price !== undefined;
        });
        
        return hasAvailableSku;
      })
      .map(item => {
        const title = item.productName || '';
        const link = item.link || '';
        const description = item.metaTagDescription || item.description || 'Sem descrição detalhada.';

        // Obter o primeiro SKU disponível para exibir os dados e preço corretos
        const availableSku = item.items.find(sku => {
          const offer = sku?.sellers?.[0]?.commertialOffer;
          return offer && 
                 offer.IsAvailable === true && 
                 offer.AvailableQuantity > 0 && 
                 offer.Price !== null && 
                 offer.Price !== undefined;
        }) || item.items[0];

        const image = availableSku?.images?.[0]?.imageUrl || '';
        
        // Preço Comercial
        const priceVal = availableSku?.sellers?.[0]?.commertialOffer?.Price || 0;
        const price = `R$ ${priceVal.toFixed(2).replace('.', ',')}`;

        // Detalhes extras
        const brand = item.brand || 'C&A';
        const composition = item.Composição?.[0] || 'Algodão/Poliéster';
        const characteristics = `Marca: ${brand} | Tecido: ${composition}`;
        const Cor = item.Cor || [];
        const Genero = item.Gênero || [];
        const categories = item.categories || [];

        return {
          store: 'C&A',
          title,
          price,
          numericPrice: priceVal,
          link,
          image,
          description,
          characteristics,
          Cor,
          Genero,
          categories
        };
      });

  } catch (err) {
    console.error('[C&A] Erro ao buscar na API:', err.message);
    return [];
  }
}

// --- ROTA DA API ---
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const gender = req.query.gender || ''; // masculino, feminino, menino, menina, bebe
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
    const size = req.query.size || '';
    const category = req.query.category || '';
    const sort = req.query.sort || '';
    const page = req.query.page ? parseInt(req.query.page) : 1;

    const pageSize = 24;
    const apiPageSize = 36; // Solicitamos um lote ligeiramente maior caso haja filtragem por gênero
    const from = (page - 1) * pageSize;
    const to = from + apiPageSize - 1;

    // Obter arrays de categorias e tamanhos
    const categories = category.split(',').map(c => c.trim()).filter(Boolean);
    const sizes = size.split(',').map(s => s.trim()).filter(Boolean);

    // Mapear o gênero para enriquecer a query de busca
    let genderTerm = '';
    if (gender === 'masculino') genderTerm = ' masculino';
    else if (gender === 'feminino') genderTerm = ' feminino';
    else if (gender === 'menino') genderTerm = ' infantil menino';
    else if (gender === 'menina') genderTerm = ' infantil menina';
    else if (gender === 'bebe') genderTerm = ' bebe';

    const activeCategories = categories.length > 0 ? categories : [''];
    const activeSizes = sizes.length > 0 ? sizes : [''];

    // Fazer buscas em paralelo para todas as combinações de categorias e tamanhos
    const fetchPromises = [];
    for (const cat of activeCategories) {
      for (const sz of activeSizes) {
        let searchTerm = query.trim();
        if (cat) {
          if (!searchTerm) {
            searchTerm = cat;
          } else {
            searchTerm = `${searchTerm} ${cat}`;
          }
        }
        const fullQuery = searchTerm ? `${searchTerm}${genderTerm}` : '';
        fetchPromises.push(searchCeA(fullQuery, gender, minPrice, maxPrice, sz, '', sort, from, to));
      }
    }

    const results = await Promise.all(fetchPromises);

    // Mesclar os resultados e remover duplicados
    const rawProducts = [];
    const seenLinks = new Set();
    for (const prodList of results) {
      for (const prod of prodList) {
        if (!seenLinks.has(prod.link)) {
          seenLinks.add(prod.link);
          rawProducts.push(prod);
        }
      }
    }

    let filteredProducts = rawProducts;

    // Filtragem pós-busca em memória para garantir precisão estrita de gênero (Evita menino retornar menina)
    if (gender) {
      filteredProducts = rawProducts.filter(product => {
        const productGenders = (product.Genero || []).map(g => g.toLowerCase());
        const target = gender.toLowerCase();
        
        if (productGenders.length === 0) {
          // Fallback: verificar se o título contém palavras restritivas do gênero oposto
          const title = (product.title || '').toLowerCase();
          if (target === 'menino' && (title.includes('menina') || title.includes('feminina') || title.includes('mulher'))) return false;
          if (target === 'menina' && (title.includes('menino') || title.includes('masculina') || title.includes('homem'))) return false;
          if (target === 'masculino' && (title.includes('feminina') || title.includes('feminino') || title.includes('mulher') || title.includes('infantil') || title.includes('menino') || title.includes('menina'))) return false;
          if (target === 'feminino' && (title.includes('masculina') || title.includes('masculino') || title.includes('homem') || title.includes('infantil') || title.includes('menino') || title.includes('menina'))) return false;
          return true;
        }
        
        if (target === 'masculino') {
          return productGenders.includes('masculino') || productGenders.includes('unissex') || productGenders.includes('homem');
        }
        if (target === 'feminino') {
          return productGenders.includes('feminino') || productGenders.includes('unissex') || productGenders.includes('mulher');
        }
        if (target === 'menino') {
          return productGenders.includes('menino') || productGenders.includes('unissex');
        }
        if (target === 'menina') {
          return productGenders.includes('menina') || productGenders.includes('unissex');
        }
        if (target === 'bebe') {
          const hasBabySpec = productGenders.includes('bebê') || productGenders.includes('bebe');
          const hasBabyCategory = (product.categories || []).some(c => c.toLowerCase().includes('bebe') || c.toLowerCase().includes('bebê'));
          return hasBabySpec || hasBabyCategory;
        }
        return true;
      });
    }

    // Fatiar de acordo com o tamanho de página desejado
    const products = filteredProducts.slice(0, pageSize);

    return res.json({
      timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      totalResults: products.length,
      products: products
    });

  } catch (error) {
    console.error('Erro no endpoint search:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar busca no catálogo da C&A.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
