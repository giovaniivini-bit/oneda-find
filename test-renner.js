import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function run() {
  console.log("Iniciando Puppeteer...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36');
    console.log("Navegando para Lojas Renner...");
    await page.goto('https://www.lojasrenner.com.br/busca?q=camiseta+masculina', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log("Página carregada! Extraindo produtos...");

    const products = await page.evaluate(() => {
      // Procurar todos os links de produtos
      const anchors = Array.from(document.querySelectorAll('a'));
      const productAnchors = anchors.filter(a => a.href.includes('/p/') && a.innerText.trim().length > 10);
      
      const seenUrls = new Set();
      const results = [];

      for (const a of productAnchors) {
        const url = a.href;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        // Subir até encontrar um contêiner comum que englobe o link e a imagem
        let parent = a.parentElement;
        let img = null;
        let depth = 0;
        
        // Procurar por imagem subindo até 5 níveis
        while (parent && depth < 5) {
          img = parent.querySelector('img');
          if (img && img.src && !img.src.includes('placeholder')) {
            break;
          }
          parent = parent.parentElement;
          depth++;
        }

        // Extrair texto do link (que geralmente contém título e preço juntos ou separados)
        const textLines = a.innerText.split('\n').map(t => t.trim()).filter(Boolean);
        const title = textLines[0] || 'Produto Renner';
        
        // Tentar achar o preço na lista de linhas de texto
        let price = 'Sob Consulta';
        for (const line of textLines) {
          if (line.includes('R$')) {
            price = line;
            break;
          }
        }

        // Pegar a imagem
        let imgUrl = '';
        if (img) {
          imgUrl = img.src || img.dataset.src || '';
          // Se tiver srcset, pegar o primeiro ou maior
          if (img.srcset) {
            const parts = img.srcset.split(',');
            const lastPart = parts[parts.length - 1].trim().split(' ')[0];
            if (lastPart) imgUrl = lastPart;
          }
        }

        results.push({
          store: 'Renner',
          title,
          price,
          link: url,
          image: imgUrl,
          characteristics: 'Marca: Lojas Renner | Alta qualidade e conforto'
        });
      }

      return results.slice(0, 10);
    });

    console.log("Produtos extraídos do Renner (total " + products.length + "):");
    console.log(JSON.stringify(products, null, 2));

  } catch (error) {
    console.error("Erro durante o teste:", error);
  } finally {
    await browser.close();
    console.log("Navegador fechado.");
  }
}

run();
