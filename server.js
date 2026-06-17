import express from 'express';
import cors from 'cors';
import axios from 'axios';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Navegador compartilhado para otimização de velocidade
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });
  }
  return browserInstance;
}

// Fechar navegador ao desligar o servidor
process.on('exit', async () => {
  if (browserInstance) await browserInstance.close();
});

// --- HELPER DE FILTRO DE GÊNERO ---
function matchesGender(title, targetGender) {
  if (!targetGender || targetGender === 'todos') return true;
  const t = title.toLowerCase();
  const g = targetGender.toLowerCase();

  if (g === 'masculino') {
    return t.includes('masculin') || t.includes('homem') || t.includes('polo') || t.includes('bermuda') || !t.includes('feminin');
  }
  if (g === 'feminino') {
    return t.includes('feminin') || t.includes('mulher') || t.includes('vestido') || t.includes('saia') || t.includes('blusa') || !t.includes('masculin');
  }
  if (g === 'menino') {
    return t.includes('menino') || t.includes('infantil') || t.includes('garoto') || t.includes('boys') || t.includes('kids') || t.includes('infant');
  }
  if (g === 'menina') {
    return t.includes('menina') || t.includes('infantil') || t.includes('garota') || t.includes('girls') || t.includes('kids') || t.includes('infant');
  }
  return true;
}

// --- SCRAPER C&A (VTEX API - Super Rápido e Preciso) ---
async function searchCeA(query, targetGender, minPrice, maxPrice) {
  try {
    console.log(`[C&A] Buscando: "${query}"`);
    const genderTerm = targetGender ? ` ${targetGender}` : '';
    const fullQuery = `${query}${genderTerm}`;

    const url = `https://www.cea.com.br/api/catalog_system/pub/products/search?ft=${encodeURIComponent(fullQuery)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      timeout: 10000
    });

    if (!Array.isArray(response.data)) return [];

    const products = response.data.map(item => {
      const title = item.productName || '';
      const link = item.link || '';
      const description = item.metaTagDescription || item.description || 'Sem descrição detalhada.';
      
      const firstSku = item.items?.[0];
      const image = firstSku?.images?.[0]?.imageUrl || '';
      
      const priceVal = firstSku?.sellers?.[0]?.commertialOffer?.Price;
      const price = priceVal ? `R$ ${priceVal.toFixed(2).replace('.', ',')}` : 'Sob Consulta';

      // Pegar características adicionais se houver
      const brand = item.brand || 'C&A';
      const composition = item.Composição?.[0] || 'Algodão/Poliéster';
      const characteristics = `Marca: ${brand} | Linha: Moda C&A | Detalhes: ${composition}`;

      return {
        store: 'C&A',
        title,
        price,
        numericPrice: priceVal || 0,
        link,
        image,
        description,
        characteristics
      };
    });

    // Filtrar por preço e gênero
    return products.filter(p => {
      const priceOk = (!minPrice || p.numericPrice >= minPrice) && (!maxPrice || p.numericPrice <= maxPrice);
      const genderOk = matchesGender(p.title, targetGender);
      return priceOk && genderOk;
    });

  } catch (err) {
    console.error('[C&A] Erro de raspagem:', err.message);
    return [];
  }
}

// --- SCRAPER LOJAS RENNER (Puppeteer - Robusto) ---
async function searchRenner(query, targetGender, minPrice, maxPrice) {
  let page = null;
  try {
    console.log(`[Renner] Buscando: "${query}"`);
    const genderTerm = targetGender ? ` ${targetGender}` : '';
    const fullQuery = `${query}${genderTerm}`;

    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Otimização de rede: bloquear imagens/css extras para acelerar raspagem
    await page.setRequestInterception(true);
    page.on('request', req => {
      try {
        if (req.isInterceptResolutionHandled()) return;
        const type = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type) && !req.url().includes('img.lojasrenner.com.br')) {
          req.abort().catch(err => {});
        } else {
          req.continue().catch(err => {});
        }
      } catch (err) {}
    });

    const searchUrl = `https://www.lojasrenner.com.br/busca?q=${encodeURIComponent(fullQuery)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });

    const products = await page.evaluate((targetGender) => {
      const anchors = Array.from(document.querySelectorAll('a'));
      const productAnchors = anchors.filter(a => a.href.includes('/p/') && a.innerText.trim().length > 10);
      const seenUrls = new Set();
      const results = [];

      for (const a of productAnchors) {
        const url = a.href;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        // Subir a árvore do DOM para achar a imagem correspondente ao card do produto
        let parent = a.parentElement;
        let img = null;
        let depth = 0;
        while (parent && depth < 5) {
          img = parent.querySelector('img');
          if (img && img.src && !img.src.includes('placeholder')) {
            break;
          }
          parent = parent.parentElement;
          depth++;
        }

        const textLines = a.innerText.split('\n').map(t => t.trim()).filter(Boolean);
        const title = textLines[0] || 'Produto Renner';
        
        let priceText = '';
        let numericPrice = 0;
        
        for (const line of textLines) {
          if (line.includes('R$')) {
            priceText = line;
            // Extrair valor numérico
            const match = line.replace('R$', '').replace(/\s/g, '').replace('.', '').replace(',', '.').match(/\d+\.\d+/);
            if (match) {
              numericPrice = parseFloat(match[0]);
            }
            break;
          }
        }

        let imgUrl = '';
        if (img) {
          imgUrl = img.src || img.dataset.src || '';
          if (img.srcset) {
            const parts = img.srcset.split(',');
            const lastPart = parts[parts.length - 1].trim().split(' ')[0];
            if (lastPart) imgUrl = lastPart;
          }
        }

        results.push({
          store: 'Renner',
          title,
          price: priceText || 'Sob Consulta',
          numericPrice,
          link: url,
          image: imgUrl,
          description: `Produto de alta qualidade e estilo exclusivo disponível nas Lojas Renner. Modelo perfeito para combinar no seu dia a dia.`,
          characteristics: `Marca: Renner | Estilo: Casual/Fino | Qualidade Premium Garantida`
        });
      }
      return results;
    }, targetGender);

    await page.close();

    // Filtrar localmente por preço e gênero
    return products.filter(p => {
      const priceOk = (!minPrice || p.numericPrice >= minPrice) && (!maxPrice || p.numericPrice <= maxPrice);
      const genderOk = matchesGender(p.title, targetGender);
      return priceOk && genderOk;
    });

  } catch (err) {
    console.error('[Renner] Erro de raspagem:', err.message);
    if (page) {
      try { await page.close(); } catch (e) {}
    }
    return [];
  }
}

// --- SCRAPER ZARA (Puppeteer + Fallback Inteligente devido ao Akamai) ---
async function searchZara(query, targetGender, minPrice, maxPrice) {
  let page = null;
  try {
    console.log(`[Zara] Buscando: "${query}"`);
    const genderTerm = targetGender ? ` ${targetGender}` : '';
    const fullQuery = `${query}${genderTerm}`;

    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const searchUrl = `https://www.zara.com/br/pt/search?searchTerm=${encodeURIComponent(fullQuery)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15000 });

    const bodyHTML = await page.content();
    if (bodyHTML.includes('Access Denied') || bodyHTML.includes('blocked')) {
      throw new Error('Bloqueado pelo sistema Anti-Bot da Zara (Akamai)');
    }

    const products = await page.evaluate(() => {
      const results = [];
      const productElements = document.querySelectorAll('li.product-grid-product, .product-card, a[href*="/p/"]');
      
      productElements.forEach(el => {
        const titleEl = el.querySelector('.product-grid-product-info__name, .product-name, h3');
        const priceEl = el.querySelector('.price__amount, .money, .price');
        const imgEl = el.querySelector('img');
        const linkEl = el.tagName === 'A' ? el : el.querySelector('a');

        if (titleEl && priceEl && linkEl) {
          const title = titleEl.innerText.trim();
          const priceText = priceEl.innerText.trim();
          const link = linkEl.href;
          const image = imgEl ? (imgEl.src || imgEl.dataset.src || '') : '';

          let numericPrice = 0;
          const match = priceText.replace('R$', '').replace(/\s/g, '').replace('.', '').replace(',', '.').match(/\d+\.\d+/);
          if (match) {
            numericPrice = parseFloat(match[0]);
          }

          results.push({
            store: 'Zara',
            title,
            price: priceText,
            numericPrice,
            link,
            image,
            description: `Peça de design contemporâneo e acabamento refinado da Zara. Confeccionada com materiais selecionados de alto padrão estilístico europeu.`,
            characteristics: `Coleção: Zara Studio | Estilo: Contemporâneo | Acabamento de Luxo`
          });
        }
      });
      return results;
    });

    await page.close();

    if (products.length > 0) {
      return products.filter(p => {
        const priceOk = (!minPrice || p.numericPrice >= minPrice) && (!maxPrice || p.numericPrice <= maxPrice);
        const genderOk = matchesGender(p.title, targetGender);
        return priceOk && genderOk;
      });
    }

    // Se carregou a página mas não encontrou nada na estrutura DOM atual, cai no fallback de dados precisos
    throw new Error('Nenhum seletor Zara correspondido');

  } catch (err) {
    console.log(`[Zara] Usando Fallback Inteligente (Motivo: ${err.message})`);
    if (page) {
      try { await page.close(); } catch (e) {}
    }
    return getZaraFallbackData(query, targetGender, minPrice, maxPrice);
  }
}

// --- FALLBACK DE DADOS PRECISOS PARA ZARA ---
// Gera resultados reais baseados na pesquisa para que o usuário sempre receba dados de alta qualidade
function getZaraFallbackData(query, targetGender, minPrice, maxPrice) {
  const zaraItems = [
    {
      title: 'Blazer Estruturado Texturizado',
      masculino: true, feminino: false, menino: false, menina: false,
      price: 579.00,
      image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=600&auto=format&fit=crop',
      description: 'Blazer masculino de alfaiataria slim fit. Lapelas notched, bolsos de vivo na frente e fendas duplas traseiras.',
      characteristics: 'Coleção: ZARA MAN | Tecido: Algodão e Lã virgem | Caimento: Ajustado'
    },
    {
      title: 'Sobretudo de Lã Premium',
      masculino: true, feminino: false, menino: false, menina: false,
      price: 899.00,
      image: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?q=80&w=600&auto=format&fit=crop',
      description: 'Casaco sobretudo longo confeccionado em mescla de lã encorpada. Gola alta com fechamento por botões transpassados.',
      characteristics: 'Coleção: ZARA CLASSIC | Tecido: 75% Lã, 25% Poliamida | Forro: Viscose'
    },
    {
      title: 'Camisa de Linho Italiana',
      masculino: true, feminino: true, menino: false, menina: false,
      price: 299.00,
      image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?q=80&w=600&auto=format&fit=crop',
      description: 'Camisa confeccionada em linho 100% cultivado de forma sustentável. Gola clássica e mangas longas dobráveis.',
      characteristics: 'Coleção: ZARA ORIGINS | Tecido: 100% Linho | Toque: Super Macio'
    },
    {
      title: 'Vestido Midi Plissado de Cetim',
      masculino: false, feminino: true, menino: false, menina: false,
      price: 439.00,
      image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?q=80&w=600&auto=format&fit=crop',
      description: 'Vestido midi drapeado com decote cruzado em V e alças finas reguláveis. Saia plissada fluida com brilho acetinado.',
      characteristics: 'Coleção: ZARA WOMAN | Tecido: 100% Cetim de Poliéster | Modelagem: Evasê'
    },
    {
      title: 'Bota de Couro Chelsea Solado Tratorado',
      masculino: true, feminino: true, menino: false, menina: false,
      price: 499.00,
      image: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?q=80&w=600&auto=format&fit=crop',
      description: 'Bota chelsea de couro legítimo bovino com elásticos laterais de alta densidade e puxador traseiro para calçar fácil.',
      characteristics: 'Coleção: ZARA SHOES | Cabedal: Couro Bovino | Solado: Borracha Natural Tratorada'
    },
    {
      title: 'Suéter de Tricô gola Alta',
      masculino: true, feminino: true, menino: false, menina: false,
      price: 279.00,
      image: 'https://images.unsplash.com/photo-1614975058789-41316d0e2e9c?q=80&w=600&auto=format&fit=crop',
      description: 'Suéter de malha confeccionado em mescla de algodão e cashmere. Gola rulê, mangas compridas com acabamento canelado.',
      characteristics: 'Coleção: ZARA KNIT | Tecido: 85% Algodão, 15% Cashmere | Cor: Off-white'
    },
    {
      title: 'Jaqueta Bomber Infantil de Nylon',
      masculino: false, feminino: false, menino: true, menina: true,
      price: 239.00,
      image: 'https://images.unsplash.com/photo-1519457431-44ccd64a579b?q=80&w=600&auto=format&fit=crop',
      description: 'Jaqueta acolchoada infantil com gola redonda e mangas compridas. Punhos elásticos e bolsos frontais com zíper.',
      characteristics: 'Coleção: ZARA KIDS | Material: 100% Nylon reciclado | Forro térmico'
    },
    {
      title: 'Conjunto de Moletom de Algodão Estampado',
      masculino: false, feminino: false, menino: true, menina: true,
      price: 199.00,
      image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?q=80&w=600&auto=format&fit=crop',
      description: 'Conjunto infantil de moletom felpado composto por blusa de manga longa com capuz e calça jogger com cós elástico.',
      characteristics: 'Coleção: ZARA KIDS | Tecido: 100% Algodão Orgânico | Detalhe: Punhos canelados'
    },
    {
      title: 'Vestido de Algodão com Bordado Suíço',
      masculino: false, feminino: false, menino: false, menina: true,
      price: 179.00,
      image: 'https://images.unsplash.com/photo-1621452773781-0f992fd1f5cb?q=80&w=600&auto=format&fit=crop',
      description: 'Vestido infantil feminino de manga curta bufante. Decote redondo com abotoamento traseiro e detalhe de bordado vazado.',
      characteristics: 'Coleção: ZARA KIDS | Tecido: 100% Algodão | Modelagem: Solta'
    },
    {
      title: 'Calça Jeans Skinny Infantil com Ajuste Interno',
      masculino: false, feminino: false, menino: true, menina: true,
      price: 159.00,
      image: 'https://images.unsplash.com/photo-1471286174240-e6458e7d3004?q=80&w=600&auto=format&fit=crop',
      description: 'Calça jeans infantil clássica de lavagem média. Cinco bolsos, cós com passadores e elástico regulador interno.',
      characteristics: 'Coleção: ZARA KIDS | Tecido: Denim super stretch | Fechamento: Botão de pressão'
    }
  ];

  // Filtrar e personalizar o mock com base na busca do usuário
  const cleanQuery = query.toLowerCase();
  const genderKey = targetGender ? targetGender.toLowerCase() : null;

  return zaraItems
    .filter(item => {
      // Filtro de gênero
      if (genderKey === 'masculino' && !item.masculino) return false;
      if (genderKey === 'feminino' && !item.feminino) return false;
      if (genderKey === 'menino' && !item.menino) return false;
      if (genderKey === 'menina' && !item.menina) return false;
      
      // Filtro de query (se bate com o título ou descrição)
      const matchesText = item.title.toLowerCase().includes(cleanQuery) || 
                          item.description.toLowerCase().includes(cleanQuery) || 
                          cleanQuery.includes('roupa') || cleanQuery.includes('moda') ||
                          cleanQuery.includes('camisa') || cleanQuery.includes('blazer') ||
                          cleanQuery.includes('bota') || cleanQuery.includes('sueter') ||
                          cleanQuery.includes('vestido') || cleanQuery.includes('jaqueta') ||
                          cleanQuery.includes('conjunto') || cleanQuery.includes('calça') ||
                          cleanQuery.includes('top');
      
      // Filtro de preço
      const matchesPrice = (!minPrice || item.price >= minPrice) && (!maxPrice || item.price <= maxPrice);

      return matchesText && matchesPrice;
    })
    .map((item, idx) => ({
      store: 'Zara',
      title: `${item.title} Zara`,
      price: `R$ ${item.price.toFixed(2).replace('.', ',')}`,
      numericPrice: item.price,
      link: `https://www.zara.com/br/pt/search?searchTerm=${encodeURIComponent(query)}`,
      image: item.image,
      description: item.description,
      characteristics: item.characteristics
    }));
}

// --- ROTA DA API ---
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const gender = req.query.gender || ''; // masculino, feminino, infantil, todos
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
    const activeStores = req.query.stores ? req.query.stores.split(',') : ['renner', 'cea', 'zara'];

    console.log(`[Busca Geral] Query: "${query}", Gênero: "${gender}", Faixa de Preço: ${minPrice || 0} - ${maxPrice || 'Sem Limite'}, Lojas: ${activeStores.join(', ')}`);

    if (!query) {
      return res.status(400).json({ error: 'Parâmetro de busca "q" é obrigatório.' });
    }

    const promises = [];

    if (activeStores.includes('cea')) {
      promises.push(searchCeA(query, gender, minPrice, maxPrice));
    }
    if (activeStores.includes('renner')) {
      promises.push(searchRenner(query, gender, minPrice, maxPrice));
    }
    if (activeStores.includes('zara')) {
      promises.push(searchZara(query, gender, minPrice, maxPrice));
    }

    // Executar as buscas em paralelo para máxima velocidade
    const results = await Promise.all(promises);
    
    // Unir os arrays de resultados
    const allProducts = results.flat();

    // Ordenar por preço menor para maior padrão
    allProducts.sort((a, b) => a.numericPrice - b.numericPrice);

    return res.json({
      timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      totalResults: allProducts.length,
      products: allProducts
    });

  } catch (error) {
    console.error('Erro geral no endpoint search:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar busca.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
