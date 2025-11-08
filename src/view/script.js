// Function to extract Mercado Livre clip links or short_ids from text
function extractMercadoLivreClipLink(text) {
  // Regex for full URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const foundUrls = text.match(urlRegex);

  if (foundUrls) {
    for (const url of foundUrls) {
      if (url.includes("mercadolivre.com.br/clips/")) {
        return url; // Return the first full URL found
      }
    }
  }

  // If no full URL found, try to extract a short_id from a URL-like string
  const shortIdRegex = /mercadolivre\.com\.br\/clips\/\?.*short_id=([a-zA-Z0-9]+)/;
  const shortIdMatch = text.match(shortIdRegex);

  if (shortIdMatch && shortIdMatch[1]) {
    // If a short_id is found within a text, construct the full URL
    return buildMercadoLivreClipUrl(shortIdMatch[1]);
  }

  // If no full URL or short_id pattern found, check if the text itself is a short_id
  const directShortIdRegex = /^[a-zA-Z0-9]+$/; // Basic check for alphanumeric short_id
  if (text.match(directShortIdRegex)) {
      // If the text is just a short_id, construct the full URL
      return buildMercadoLivreClipUrl(text);
  }

  return null; // No Mercado Livre clip link or short_id found
}

// Helper function to construct a full Mercado Livre clip URL from a short_id
function buildMercadoLivreClipUrl(shortId) {
    // This is a base URL. Parameters might need to be adjusted based on actual ML behavior.
    // The important part is the short_id.
    return `https://www.mercadolivre.com.br/clips/?short_id=${shortId}`;
}

/*
// Example usage (uncomment to test):
const text1 = "Confira este clipe: https://www.mercadolivre.com.br/clips/?shortsparams=true&type=short&short_id=vJ2OIh&origin=share&st=340002220&matt_tool=73180307#origin=share e veja mais.";
const text2 = "Este é um texto sem link do Mercado Livre.";
const text3 = "Outro link aqui: https://www.youtube.com/watch?v=dQw4w9WgXcQ mas o do ML é https://www.mercadolivre.com.br/clips/?short_id=abc";
const text4 = "Apenas um texto com https://www.mercadolivre.com.br/clips/qualquercoisa";
const text5 = "Aqui está o ID do clipe: vJ2OIh";
const text6 = "Um texto com o link incompleto: mercadolivre.com.br/clips/?short_id=xyz";


console.log('Exemplo 1:', extractMercadoLivreClipLink(text1));
console.log('Exemplo 2:', extractMercadoLivreClipLink(text2));
console.log('Exemplo 3:', extractMercadoLivreClipLink(text3));
console.log('Exemplo 4:', extractMercadoLivreClipLink(text4));
console.log('Exemplo 5:', extractMercadoLivreClipLink(text5));
console.log('Exemplo 6:', extractMercadoLivreClipLink(text6));
*/