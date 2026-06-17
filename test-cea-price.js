import axios from 'axios';

async function run() {
  try {
    console.log("Buscando produto da C&A para analisar preços...");
    const url = 'https://www.cea.com.br/api/catalog_system/pub/products/search?ft=camiseta';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      }
    });

    const firstProduct = response.data[0];
    console.log("Título do produto:", firstProduct.productName);
    
    const firstSku = firstProduct.items?.[0];
    console.log("SKU ID:", firstSku?.itemId);
    
    const firstSeller = firstSku?.sellers?.[0];
    console.log("Vendedor:", firstSeller?.sellerName);
    console.log("Chaves do vendedor:", Object.keys(firstSeller || {}));
    
    const offer = firstSeller?.commertialOffer;
    console.log("commertialOffer:", offer ? "Existe" : "Não existe");
    if (offer) {
      console.log("Preço (Price):", offer.Price);
      console.log("Preço Regular (ListPrice):", offer.ListPrice);
    }

  } catch (error) {
    console.error("Erro no teste da C&A:", error.message);
  }
}

run();
