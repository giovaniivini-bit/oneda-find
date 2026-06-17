import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function run() {
  console.log("Iniciando Puppeteer para Zara...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    console.log("Navegando para Zara...");
    await page.goto('https://www.zara.com/br/pt/search?searchTerm=camisa+masculina', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log("Página da Zara carregada!");
    const title = await page.title();
    console.log("Título da página:", title);

    const bodyHTML = await page.content();
    console.log("Tamanho do HTML retornado:", bodyHTML.length, "bytes");

    if (bodyHTML.includes('Access Denied') || bodyHTML.includes('blocked') || title.includes('Denied')) {
      console.log("AVISO: Fomos bloqueados pela Zara (Akamai/Access Denied)!");
    } else {
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        return anchors
          .map(a => ({ href: a.href, text: a.innerText.trim() }))
          .filter(a => a.href.includes('/p/') && a.text.length > 5)
          .slice(0, 10);
      });
      console.log("Links encontrados na Zara:", JSON.stringify(links, null, 2));
    }

  } catch (error) {
    console.error("Erro durante o teste na Zara:", error);
  } finally {
    await browser.close();
    console.log("Navegador fechado.");
  }
}

run();
