import axios from 'axios';
import { getTrendingProducts } from '../shopeeAffiliateService';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ShopeeAffiliateService - getTrendingProducts', () => {
    const originalAppId = process.env.SHOPEE_APP_ID;
    const originalSecret = process.env.SHOPEE_APP_SECRET;

    beforeAll(() => {
        process.env.SHOPEE_APP_ID = 'test-id';
        process.env.SHOPEE_APP_SECRET = 'test-secret';
    });

    afterAll(() => {
        process.env.SHOPEE_APP_ID = originalAppId;
        process.env.SHOPEE_APP_SECRET = originalSecret;
    });

    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('requests page 1 and maps offers when API responds with nodes', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({
                data: {
                    data: {
                        productOfferV2: {
                            nodes: [
                                {
                                    itemId: 123,
                                    productName: 'Produto A',
                                    price: '10.00',
                                    imageUrl: 'https://img/123',
                                    offerLink: 'https://shopee.com/product/123',
                                },
                            ],
                        },
                    },
                },
            } as any)
            .mockResolvedValueOnce({
                data: {
                    data: {
                        generateShortLink: {
                            shortLink: 'https://short.link/abc',
                        },
                    },
                },
            } as any);

        const products = await getTrendingProducts(1);

        expect(mockedAxios.post).toHaveBeenCalledTimes(2);

        const firstCallBody = mockedAxios.post.mock.calls[0][1] as any;
        expect(firstCallBody.variables).toEqual({ limit: 1, page: 1 });
        expect(products).toEqual([
            {
                id: '123',
                name: 'Produto A',
                price: '10.00',
                original_price: undefined,
                discount_percent: undefined,
                image_url: 'https://img/123',
                offer_link: 'https://short.link/abc',
            },
        ]);
    });

    it('returns empty list when response lacks productOfferV2 nodes', async () => {
        mockedAxios.post.mockResolvedValueOnce({
            data: {
                data: { productOfferV2: null },
                errors: [{ message: 'listType invalid' }],
            },
        } as any);

        const products = await getTrendingProducts(2);

        expect(products).toEqual([]);
        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
});
