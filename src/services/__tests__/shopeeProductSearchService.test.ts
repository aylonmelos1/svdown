import axios from 'axios';
import { ShopeeProductSearchService } from '../shopeeProductSearchService';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ShopeeProductSearchService', () => {
    let service: ShopeeProductSearchService;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.SHOPEE_APP_ID = 'app';
        process.env.SHOPEE_APP_SECRET = 'secret';
        service = new ShopeeProductSearchService();
    });

    it('returns cached result on subsequent calls', async () => {
        mockedAxios.post.mockResolvedValue({
            data: {
                data: {
                    productOfferV2: {
                        nodes: [
                            { itemId: '1', productName: 'Produto 1', price: '10.00', imageUrl: 'http://img', offerLink: 'http://offer' }
                        ]
                    }
                }
            }
        });

        const resultA = await service.searchByCaption('hash', 'Compre sapatos novos com desconto imperdível', 2);
        const resultB = await service.searchByCaption('hash', 'Compre sapatos novos com desconto imperdível', 2);

        expect(resultA.products).toHaveLength(1);
        expect(resultB.meta.source).toBe('cache');
        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when API credentials missing', async () => {
        delete process.env.SHOPEE_APP_ID;
        delete process.env.SHOPEE_APP_SECRET;
        const result = await service.searchByCaption('hash', 'produto maquiagem profissional');
        expect(result.products).toHaveLength(0);
        expect(result.meta.reason).toBe('missing_credentials');
    });

    it('handles API errors gracefully', async () => {
        mockedAxios.post.mockRejectedValue(new Error('network'));
        const result = await service.searchByCaption('hash', 'coleção exclusiva esportiva');
        expect(result.products).toHaveLength(0);
        expect(result.meta.reason).toBe('api_error');
    });
});
