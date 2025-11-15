import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto'; // Import crypto for signature generation
import log from '../log'; // Adicionar esta linha

dotenv.config();

interface ShopeeCategory {
  id: string;
  name: string;
  image_url: string;
}

const SHOPEE_AFFILIATE_API_BASE_URL = 'https://open-api.affiliate.shopee.com.br/graphql';
const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID;
const SHOPEE_APP_SECRET = process.env.SHOPEE_APP_SECRET;

function generateSignature(appId: string, timestamp: number, payload: string, secret: string): string {
  const baseString = appId + timestamp + payload + secret;
  return crypto.createHash('sha256').update(baseString).digest('hex');
}

export async function getTrendingCategories(pageSize: number = 6): Promise<ShopeeCategory[]> {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) {
    console.error('Shopee Affiliate API credentials (SHOPEE_APP_ID or SHOPEE_APP_SECRET) are not set in environment variables.');
    return [];
  }

  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp

  const query = `
    query ShopeeOfferV2($keyword: String, $sortType: Int, $page: Int, $limit: Int) {
      shopeeOfferV2(keyword: $keyword, sortType: $sortType, page: $page, limit: $limit) {
        nodes {
          collectionId
          offerName
          imageUrl
        }
      }
    }
  `;

  const variables = {
    keyword: "",
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

    const offers = response.data.data.shopeeOfferV2.nodes;

    const categories: ShopeeCategory[] = offers.map((item: any) => ({
      id: item.collectionId,
      name: item.offerName,
      image_url: item.imageUrl,
    }));

    return categories;
  } catch (error) {
    console.error('Error fetching trending Shopee categories:', error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('Shopee API Error Response:', error.response.data);
      // Propagar o erro da API da Shopee para o cliente
      throw new Error(`Shopee API Error: ${JSON.stringify(error.response.data)}`);
    }
    throw error; // Relançar outros erros
  }
}

export interface TrendingShopeeProduct {
  id?: string;
  name: string;
  price: string;
  original_price?: string;
  discount_percent?: string | number;
  image_url: string;
  offer_link: string;
}

async function generateShortLink(originUrl: string): Promise<string> {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) {
    throw new Error('Shopee Affiliate API credentials are not set.');
  }

  const query = `
    mutation($originUrl: String!) {
      generateShortLink(input: { originUrl: $originUrl }) {
        shortLink
      }
    }
  `;

  const variables = {
    originUrl,
  };

  const requestBody = {
    query,
    variables,
  };

  const payload = JSON.stringify(requestBody);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateSignature(SHOPEE_APP_ID, timestamp, payload, SHOPEE_APP_SECRET);

  try {
    const response = await axios.post(SHOPEE_AFFILIATE_API_BASE_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
      },
    });

    if (response.data.errors) {
      throw new Error(`Shopee API error on generateShortLink: ${JSON.stringify(response.data.errors)}`);
    }

    return response.data.data.generateShortLink.shortLink;
  } catch (error) {
    console.error(`Error generating short link for ${originUrl}:`, error);
    // Return original URL as a fallback
    return originUrl;
  }
}

export async function getTrendingProducts(pageSize: number = 6): Promise<TrendingShopeeProduct[]> {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) {
    console.error('Shopee Affiliate API credentials (SHOPEE_APP_ID or SHOPEE_APP_SECRET) are not set in environment variables.');
    return [];
  }

  const timestamp = Math.floor(Date.now() / 1000);

  const query = `
    query GetTrendingItems($limit: Int, $page: Int) {
      productOfferV2(
        listType: 0,
        sortType: 5,
        page: $page,
        limit: $limit
      ) {
        nodes {
          itemId
          productName
          price
          imageUrl
          offerLink
        }
      }
    }
  `;

  const variables = {
    limit: pageSize,
    page: 1,
  };

  const requestBody = {
    query,
    operationName: "GetTrendingItems",
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
    const payloadData = response.data;
    log.debug(`[Shopee Affiliate API] Raw response for trending products: ${JSON.stringify(payloadData)}`);
    if (payloadData?.errors?.length) {
      log.warn(`[Shopee Affiliate API] Errors for trending products: ${JSON.stringify(payloadData.errors)}`);
    }
    const offers = payloadData?.data?.productOfferV2?.nodes;
    if (!Array.isArray(offers) || offers.length === 0) {
      log.warn('[Shopee Affiliate API] Trending products response missing productOfferV2 nodes.');
      return [];
    }

    // Generate short links in parallel
    const shortLinkPromises = offers.map((item: any) => generateShortLink(item.offerLink));
    const shortLinks = await Promise.all(shortLinkPromises);

    const products: TrendingShopeeProduct[] = offers.map((item: any, index: number) => ({
      id: typeof item.itemId === 'string' || typeof item.itemId === 'number' ? String(item.itemId) : undefined,
      name: item.productName,
      price: item.price,
      original_price: item.priceBeforeDiscount,
      discount_percent: item.discount,
      image_url: item.imageUrl,
      offer_link: shortLinks[index], // Use the generated short link
    }));

    return products;
  } catch (error) {
    console.error('Error fetching trending Shopee products:', error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('Shopee API Error Response:', error.response.data);
      throw new Error(`Shopee API Error: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

export interface ShopeeProduct {
  id: string;
  name: string;
  image_url: string;
  price: string;
  product_url: string;
  brand: string;
}

export async function getProductsByCategory(categoryId: number, pageSize: number = 6): Promise<ShopeeProduct[]> {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) {
    console.error('Shopee Affiliate API credentials (SHOPEE_APP_ID or SHOPEE_APP_SECRET) are not set in environment variables.');
    return [];
  }

  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp

  const query = `
    query ProductOfferV2($productCatId: Int, $page: Int, $limit: Int) {
      productOfferV2(productCatId: $productCatId, page: $page, limit: $limit) {
        nodes {
          itemId
          productName
          price
          imageUrl
          productLink
          shopName
        }
      }
    }
  `;

  const variables = {
    productCatId: categoryId,
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
    log.debug(`[Shopee Affiliate API] Raw response: ${JSON.stringify(response.data)}`);

    const offers = response.data.data.productOfferV2.nodes;

    const products: ShopeeProduct[] = offers.map((item: any) => ({
      id: item.itemId,
      name: item.productName,
      image_url: item.imageUrl,
      price: item.price,
      product_url: item.productLink,
      brand: item.shopName,
    }));

    return products;
  } catch (error) {
    console.error('Error fetching Shopee products by category:', error);
    if (axios.isAxiosError(error) && error.response) {
      console.error('Shopee API Error Response:', error.response.data);
      throw new Error(`Shopee API Error: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}
