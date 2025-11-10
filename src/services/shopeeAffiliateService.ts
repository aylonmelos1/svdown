import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto'; // Import crypto for signature generation
import log from '../log'; // Adicionar esta linha

dotenv.config();

interface ShopeeProduct {
  id: string;
  name: string;
  image_url: string;
  price: string;
  product_url: string;
}

const SHOPEE_AFFILIATE_API_BASE_URL = 'https://open-api.affiliate.shopee.com.br/graphql';
const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID;
const SHOPEE_APP_SECRET = process.env.SHOPEE_APP_SECRET;

function generateSignature(appId: string, timestamp: number, payload: string, secret: string): string {
  const baseString = appId + timestamp + payload + secret;
  return crypto.createHash('sha256').update(baseString).digest('hex');
}

export async function getTrendingProducts(pageSize: number = 6, keyword: string = ''): Promise<ShopeeProduct[]> {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) {
    console.error('Shopee Affiliate API credentials (SHOPEE_APP_ID or SHOPEE_APP_SECRET) are not set in environment variables.');
    return [];
  }

  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp

  const query = `
    query ShopeeOfferList($keyword: String, $sortType: Int, $page: Int, $limit: Int) {
      shopeeOfferV2(keyword: $keyword, sortType: $sortType, page: $page, limit: $limit) {
        edges {
          node {
            productId
            productName
            imageUrl
            price
            productUrl
          }
        }
      }
    }
  `;

  const variables = {
    keyword: keyword,
    sortType: 1, // 1: Mais recentes, 2: Maior comissão
    page: 1,
    limit: pageSize,
  };

  const requestBody = {
    query,
    variables,
  };

  const payload = JSON.stringify(requestBody);
  const signature = generateSignature(SHOPEE_APP_ID, timestamp, payload, SHOPEE_APP_SECRET);

  try {
    const response = await axios.post(SHOPEE_AFFILIATE_API_BASE_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
      },
    });
    log.debug(`[Shopee Affiliate API] Raw response: ${JSON.stringify(response.data)}`); // Adicionar esta linha

    const offers = response.data.data.shopeeOfferV2.edges.map((edge: any) => edge.node);

    const products: ShopeeProduct[] = offers.map((item: any) => ({
      id: item.productId,
      name: item.productName,
      image_url: item.imageUrl,
      price: item.price,
      product_url: item.productUrl,
    }));

    return products;
  } catch (error) {
    console.error('Error fetching trending Shopee products:', error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('Shopee API Error Response:', error.response.data);
      // Propagar o erro da API da Shopee para o cliente
      throw new Error(`Shopee API Error: ${JSON.stringify(error.response.data)}`);
    }
    throw error; // Relançar outros erros
  }
}

