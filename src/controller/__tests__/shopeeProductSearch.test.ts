import type { Request, Response } from 'express';
import { getShopeeProductSuggestions } from '../shopeeProductSearch';
import { getResolvedLink } from '../../services/resolvedLinkStore';
import { shopeeProductSearchService } from '../../services/shopeeProductSearchService';

jest.mock('../../services/resolvedLinkStore', () => ({
    getResolvedLink: jest.fn(),
}));

jest.mock('../../services/shopeeProductSearchService', () => ({
    shopeeProductSearchService: {
        searchByCaption: jest.fn(),
    },
}));

function createMockResponse() {
    const json = jest.fn();
    const status = jest.fn().mockImplementation(() => ({ json }));
    return {
        json,
        status,
    } as unknown as Response;
}

describe('getShopeeProductSuggestions', () => {
    const mockRequest = (linkHash?: string) => ({ query: { linkHash } } as unknown as Request);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects unsupported services', async () => {
        (getResolvedLink as jest.Mock).mockReturnValue({
            link: 'https://example.com',
            service: 'youtube',
        });
        const res = createMockResponse();

        await getShopeeProductSuggestions(mockRequest('hash'), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.status(400).json).toHaveBeenCalledWith({
            error: 'Sugestões disponíveis apenas para vídeos da Shopee, TikTok ou Pinterest.',
        });
        expect(shopeeProductSearchService.searchByCaption).not.toHaveBeenCalled();
    });

    it('accepts TikTok links and forwards caption to the search service', async () => {
        const mockCaption = 'Travesseiro ergonômico anti ronco';
        const mockResponse = {
            products: [],
            meta: {
                linkHash: 'hash',
                keywords: ['travesseiro'],
                captionSnippet: mockCaption,
                fetchedAt: new Date().toISOString(),
                source: 'live',
            },
        };
        (getResolvedLink as jest.Mock).mockReturnValue({
            link: 'https://www.tiktok.com/@foo',
            service: 'tiktok',
            caption: mockCaption,
        });
        (shopeeProductSearchService.searchByCaption as jest.Mock).mockResolvedValue(mockResponse);
        const res = createMockResponse();

        await getShopeeProductSuggestions(mockRequest('hash'), res);

        expect(shopeeProductSearchService.searchByCaption).toHaveBeenCalledWith('hash', mockCaption);
        expect(res.json).toHaveBeenCalledWith(mockResponse);
    });

    it('returns skipped meta when caption is missing', async () => {
        (getResolvedLink as jest.Mock).mockReturnValue({
            link: 'https://pin.it/abc',
            service: 'pinterest',
        });
        const res = createMockResponse();

        await getShopeeProductSuggestions(mockRequest('hash'), res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            products: [],
            meta: expect.objectContaining({
                reason: 'missing_caption',
                source: 'skipped',
            }),
        }));
        expect(shopeeProductSearchService.searchByCaption).not.toHaveBeenCalled();
    });
});
