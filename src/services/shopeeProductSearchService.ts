import axios from 'axios';
import crypto from 'crypto';
import log from '../log';
import { suggestProductHeadlineFromCaption } from './aiLabelService';

const SHOPEE_AFFILIATE_API_BASE_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PRODUCTS = 4;
const STOP_WORDS = new Set([
    'de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'sem', 'um', 'uma', 'uns', 'umas',
    'no', 'na', 'nos', 'nas', 'que', 'por', 'em', 'a', 'o', 'e', 'ou', 'se', 'the', 'and',
    'for', 'with', 'this', 'that', 'from', 'your', 'you', 'are', 'our', 'sobre', 'mais',
    'tem', 'como', 'ser', 'vai', 'das', 'nosso', 'sua', 'seu', 'são'
]);

export interface ShopeeProductSuggestion {
    id: string;
    name: string;
    price: string | null;
    imageUrl: string | null;
    offerLink: string;
}

export interface ShopeeProductSearchMeta {
    linkHash: string;
    keywords: string[];
    captionSnippet: string;
    fetchedAt: string;
    source: 'live' | 'cache' | 'skipped';
    reason?: string;
    aiSuggestion?: string | null;
}

export interface ShopeeProductSearchResponse {
    products: ShopeeProductSuggestion[];
    meta: ShopeeProductSearchMeta;
}

interface CacheEntry {
    expiresAt: number;
    response: ShopeeProductSearchResponse;
}

export class ShopeeProductSearchService {
    private cache = new Map<string, CacheEntry>();

    async searchByCaption(linkHash: string, caption: string, limit: number = MAX_PRODUCTS): Promise<ShopeeProductSearchResponse> {
        const snippet = (caption || '').trim().slice(0, 320);
        const keywords = buildKeywords(caption);
        const cacheKey = this.buildCacheKey(linkHash, keywords, limit);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }

        const creds = getCredentials();
        if (!creds.appId || !creds.appSecret) {
            log.warn('[Shopee Product Search] Missing SHOPEE_APP_ID/SHOPEE_APP_SECRET environment variables.');
            const response = this.buildResponse([], linkHash, keywords, snippet, 'skipped', 'missing_credentials');
            this.saveToCache(cacheKey, response);
            return response;
        }

        if (!keywords.length) {
            const response = this.buildResponse([], linkHash, keywords, snippet, 'skipped', 'no_keywords');
            this.saveToCache(cacheKey, response);
            return response;
        }

        const aiSuggestion = await suggestProductHeadlineFromCaption(caption, 'pt');

        try {
            const queryPayload = this.buildQueryPayload(keywords.slice(0, 6).join(' '), limit);
            const timestamp = Math.floor(Date.now() / 1000);
            const payload = JSON.stringify(queryPayload);
            const signature = this.generateSignature(timestamp, payload, creds);

            const response = await axios.post(SHOPEE_AFFILIATE_API_BASE_URL, queryPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `SHA256 Credential=${creds.appId}, Timestamp=${timestamp}, Signature=${signature}`,
                },
            });

            const offers = response.data?.data?.productOfferV2?.nodes;
            if (!Array.isArray(offers) || !offers.length) {
                log.warn('[Shopee Product Search] Empty response from productOfferV2.');
                const emptyResponse = this.buildResponse([], linkHash, keywords, snippet, 'live', 'no_results', aiSuggestion);
                this.saveToCache(cacheKey, emptyResponse);
                return emptyResponse;
            }

            const suggestions: ShopeeProductSuggestion[] = offers.slice(0, limit).map((item: any, index: number) => ({
                id: formatId(item.itemId, index),
                name: typeof item.productName === 'string' ? item.productName : `Oferta ${index + 1}`,
                price: typeof item.price === 'string' ? item.price : null,
                imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
                offerLink: typeof item.offerLink === 'string' ? item.offerLink : typeof item.productLink === 'string' ? item.productLink : '',
            })).filter(suggestion => suggestion.offerLink);

            const successResponse = this.buildResponse(suggestions, linkHash, keywords, snippet, 'live', undefined, aiSuggestion);
            this.saveToCache(cacheKey, successResponse);
            return successResponse;
        } catch (error) {
            log.error('[Shopee Product Search] Failed to fetch suggestions', error);
            if (axios.isAxiosError(error) && error.response) {
                log.error('[Shopee Product Search] API response:', error.response.data);
            }
            const response = this.buildResponse([], linkHash, keywords, snippet, 'live', 'api_error', aiSuggestion);
            this.saveToCache(cacheKey, response);
            return response;
        }
    }

    private buildCacheKey(linkHash: string, keywords: string[], limit: number): string {
        return `${linkHash}:${keywords.join('-')}:${limit}`;
    }

    private getFromCache(key: string): ShopeeProductSearchResponse | null {
        if (!key) return null;
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return {
            ...entry.response,
            meta: {
                ...entry.response.meta,
                source: 'cache',
            },
        };
    }

    private saveToCache(key: string, response: ShopeeProductSearchResponse) {
        if (!key) return;
        this.cache.set(key, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            response,
        });
    }

    private buildResponse(
        products: ShopeeProductSuggestion[],
        linkHash: string,
        keywords: string[],
        snippet: string,
        source: ShopeeProductSearchMeta['source'],
        reason?: string,
        aiSuggestion?: string | null
    ): ShopeeProductSearchResponse {
        return {
            products,
            meta: {
                linkHash,
                keywords,
                captionSnippet: snippet,
                fetchedAt: new Date().toISOString(),
                source,
                reason,
                aiSuggestion: aiSuggestion || undefined,
            },
        };
    }

    private buildQueryPayload(keyword: string, limit: number) {
        return {
            query: `
                query SearchProductOffers($keyword: String!, $limit: Int!, $page: Int!) {
                    productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: 5) {
                        nodes {
                            itemId
                            productName
                            price
                            imageUrl
                            offerLink
                            productLink
                        }
                    }
                }
            `,
            variables: {
                keyword,
                limit,
                page: 1,
            },
            operationName: 'SearchProductOffers',
        };
    }

    private generateSignature(timestamp: number, payload: string, creds = getCredentials()) {
        if (!creds.appId || !creds.appSecret) {
            throw new Error('Shopee API credentials are not configured.');
        }
        const baseString = creds.appId + timestamp + payload + creds.appSecret;
        return crypto.createHash('sha256').update(baseString).digest('hex');
    }
}

function buildKeywords(text: string, maxKeywords = 8): string[] {
    if (!text) {
        return [];
    }
    const normalized = text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/#[\w-]+/g, ' ')
        .replace(/[^a-z0-9áéíóúâêôãõç\s]/gi, ' ');
    const tokens = normalized
        .split(/\s+/)
        .filter(token => token.length > 2 && !STOP_WORDS.has(token));
    const uniqueTokens: string[] = [];
    for (const token of tokens) {
        if (!uniqueTokens.includes(token)) {
            uniqueTokens.push(token);
        }
        if (uniqueTokens.length >= maxKeywords) {
            break;
        }
    }
    return uniqueTokens;
}

function formatId(itemId: unknown, fallbackIndex: number): string {
    if (typeof itemId === 'string' && itemId.trim()) {
        return itemId;
    }
    if (typeof itemId === 'number') {
        return itemId.toString();
    }
    return `product-${fallbackIndex}`;
}

export const shopeeProductSearchService = new ShopeeProductSearchService();

function getCredentials() {
    return {
        appId: process.env.SHOPEE_APP_ID,
        appSecret: process.env.SHOPEE_APP_SECRET,
    };
}
