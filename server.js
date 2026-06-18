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

// --- FUNÇÃO DE COMBINAÇÃO DE COR (Post-Filtering) ---
function matchColor(product, selectedColor) {
  if (!selectedColor) return true;
  
  const sel = selectedColor.toLowerCase();
  const title = (product.title || '').toLowerCase();
  
  // 1. Tentar correspondência direta na especificação "Cor" do produto
  const productColors = product.Cor || [];
  if (Array.isArray(productColors) && productColors.length > 0) {
    const matched = productColors.some(color => {
      const col = color.toLowerCase();
      if (sel === 'preto') {
        return col.includes('preto') || col.includes('chumbo') || col.includes('cinza escuro') || col.includes('grafite');
      }
      if (sel === 'branco') {
        return col.includes('branco') || col.includes('white') || col.includes('off') || col.includes('natural');
      }
      if (sel === 'azul') {
        return col.includes('azul') || col.includes('jeans') || col.includes('marinho') || col.includes('celeste');
      }
      if (sel === 'vermelho') {
        return col.includes('vermelho') || col.includes('vinho') || col.includes('bordô') || col.includes('cereja') || col.includes('carmim');
      }
      if (sel === 'verde') {
        return col.includes('verde') || col.includes('militar') || col.includes('oliva') || col.includes('musgo');
      }
      if (sel === 'amarelo') {
        return col.includes('amarelo') || col.includes('mostarda') || col.includes('ouro');
      }
      if (sel === 'rosa') {
        return col.includes('rosa') || col.includes('pink') || col.includes('rose') || col.includes('chiclete');
      }
      if (sel === 'bege') {
        return col.includes('bege') || col.includes('creme') || col.includes('areia') || col.includes('caqui') || col.includes('nude') || col.includes('marfim');
      }
      if (sel === 'cinza') {
        return col.includes('cinza') || col.includes('chumbo') || col.includes('silver') || col.includes('mescla') || col.includes('grafite');
      }
      if (sel === 'marrom') {
        return col.includes('marrom') || col.includes('cafe') || col.includes('café') || col.includes('caramelo') || col.includes('terracota') || col.includes('bronze');
      }
      return col.includes(sel);
    });
    if (matched) return true;
  }
  
  // 2. Fallback para correspondência no título do produto
  if (sel === 'preto') {
    return title.includes('preto') || title.includes('preta') || title.includes('chumbo') || title.includes('cinza escuro') || title.includes('grafite');
  }
  if (sel === 'branco') {
    return title.includes('branco') || title.includes('branca') || title.includes('white') || title.includes('off') || title.includes('natural');
  }
  if (sel === 'azul') {
    return title.includes('azul') || title.includes('jeans') || title.includes('marinho');
  }
  if (sel === 'vermelho') {
    return title.includes('vermelho') || title.includes('vermelha') || title.includes('vinho') || title.includes('bordô') || title.includes('cereja');
  }
  if (sel === 'verde') {
    return title.includes('verde') || title.includes('militar') || title.includes('oliva');
  }
  if (sel === 'amarelo') {
    return title.includes('amarelo') || title.includes('amarela') || title.includes('mostarda');
  }
  if (sel === 'rosa') {
    return title.includes('rosa') || title.includes('pink') || title.includes('rose');
  }
  if (sel === 'bege') {
    return title.includes('bege') || title.includes('creme') || title.includes('areia') || title.includes('caqui') || title.includes('nude');
  }
  if (sel === 'cinza') {
    return title.includes('cinza') || title.includes('chumbo') || title.includes('silver') || title.includes('mescla');
  }
  if (sel === 'marrom') {
    return title.includes('marrom') || title.includes('cafe') || title.includes('café') || title.includes('caramelo') || title.includes('terracota');
  }
  
  return title.includes(sel);
}

// --- PESQUISA C&A ---
async function searchCeA(query, targetGender, minPrice, maxPrice, size, color, sort, from, to) {
  try {
    console.log(`[C&A API Call] Buscando query: "${query}", Gênero: "${targetGender}", Tamanho: "${size}", Preço: ${minPrice}-${maxPrice}, Ordenação: "${sort}", Itens: ${from}-${to}`);

    const ft = query ? query : 'moda';

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
    let url = `https://www.cea.com.br/api/catalog_system/pub/products/search?ft=${encodeURIComponent(ft)}`;
    
    if (fqParts.length > 0) {
      url += `&fq=${fqParts.join(',')}`;
    }

    // Ordenação (O)
    if (sort) {
      url += `&O=${sort}`;
    } else {
      url += `&O=OrderByTopSaleDESC`; // Padrão: mais vendidos
    }

    // Paginação (_from e _to)
    url += `&_from=${from}&_to=${to}`;

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
        
        // Obter disponibilidade do SKU padrão
        const firstSku = item.items[0];
        const offer = firstSku?.sellers?.[0]?.commertialOffer;
        
        if (!offer) return false;
        
        // Ignorar produtos fora de estoque / indisponíveis (evita lixo em cache)
        if (offer.IsAvailable === false) return false;
        if (offer.AvailableQuantity <= 0) return false;
        if (offer.Price === null || offer.Price === undefined) return false;
        
        return true;
      })
      .map(item => {
        const title = item.productName || '';
        const link = item.link || '';
        const description = item.metaTagDescription || item.description || 'Sem descrição detalhada.';

        // Pegar SKU padrão (primeiro disponível)
        const firstSku = item.items[0];
        const image = firstSku?.images?.[0]?.imageUrl || '';
        
        // Preço Comercial
        const priceVal = firstSku?.sellers?.[0]?.commertialOffer?.Price;
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
    const color = req.query.color || '';
    const sort = req.query.sort || '';
    const page = req.query.page ? parseInt(req.query.page) : 1;

    const pageSize = 24;
    const apiPageSize = 48; // Solicitamos um lote maior para compensar a filtragem dupla em memória (Cor + Gênero)
    const from = (page - 1) * pageSize;
    const to = from + apiPageSize - 1;

    // Se o termo estiver vazio, usamos "moda" como termo padrão para listar produtos
    const searchTerm = query.trim() || 'moda';

    // Mapear o gênero para enriquecer a query de busca textual
    let genderTerm = '';
    if (gender === 'masculino') genderTerm = ' masculino';
    else if (gender === 'feminino') genderTerm = ' feminino';
    else if (gender === 'menino') genderTerm = ' infantil menino';
    else if (gender === 'menina') genderTerm = ' infantil menina';
    else if (gender === 'bebe') genderTerm = ' bebe';

    // Mapear a cor para enriquecer a busca textual (já que o specificationFilter_47 está desativado)
    let colorTerm = '';
    if (color) {
      colorTerm = ` ${color.toLowerCase()}`;
    }

    const fullQuery = `${searchTerm}${genderTerm}${colorTerm}`;

    const rawProducts = await searchCeA(fullQuery, gender, minPrice, maxPrice, size, color, sort, from, to);

    // 1. Filtragem pós-busca em memória para garantir precisão máxima de cor
    let filteredProducts = rawProducts;
    if (color) {
      filteredProducts = rawProducts.filter(product => matchColor(product, color));
    }

    // 2. Filtragem pós-busca em memória para garantir precisão estrita de gênero (Evita menino retornar menina)
    if (gender) {
      filteredProducts = filteredProducts.filter(product => {
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
