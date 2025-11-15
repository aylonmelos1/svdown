import { Request, Response } from 'express';
import log from '../log';
import { getResolvedLink } from '../services/resolvedLinkStore';
import { shopeeProductSearchService } from '../services/shopeeProductSearchService';

const SUPPORTED_SERVICES = new Set(['shopee', 'tiktok', 'pinterest']);

export async function getShopeeProductSuggestions(req: Request, res: Response) {
    const linkHash = (req.query.linkHash as string)?.trim();

    if (!linkHash) {
        return res.status(400).json({ error: 'linkHash é obrigatório' });
    }

    const resolvedLink = getResolvedLink(linkHash);
    if (!resolvedLink) {
        return res.status(404).json({ error: 'Link não encontrado ou expirado' });
    }

    const service = (resolvedLink.service || '').toLowerCase();
    if (!SUPPORTED_SERVICES.has(service)) {
        return res.status(400).json({ error: 'Sugestões disponíveis apenas para vídeos da Shopee, TikTok ou Pinterest.' });
    }

    const captionSource = resolvedLink.caption || resolvedLink.description || resolvedLink.title;
    const caption = captionSource?.trim();
    if (!caption) {
        return res.status(200).json({
            products: [],
            meta: {
                linkHash,
                keywords: [],
                captionSnippet: '',
                fetchedAt: new Date().toISOString(),
                source: 'skipped',
                reason: 'missing_caption',
            },
        });
    }

    try {
        const response = await shopeeProductSearchService.searchByCaption(linkHash, caption);
        res.json(response);
    } catch (error) {
        log.error('[Shopee Product Suggestions] Failed to generate suggestions', error);
        res.status(500).json({ error: 'Falha ao buscar produtos relacionados.' });
    }
}
