import { Request, Response } from 'express';
import log from '../log';
import { getResolvedLink } from '../services/resolvedLinkStore';
import { shopeeProductSearchService } from '../services/shopeeProductSearchService';

export async function getShopeeProductSuggestions(req: Request, res: Response) {
    const linkHash = (req.query.linkHash as string)?.trim();

    if (!linkHash) {
        return res.status(400).json({ error: 'linkHash é obrigatório' });
    }

    const resolvedLink = getResolvedLink(linkHash);
    if (!resolvedLink) {
        return res.status(404).json({ error: 'Link não encontrado ou expirado' });
    }

    if ((resolvedLink.service || '').toLowerCase() !== 'shopee') {
        return res.status(400).json({ error: 'Sugestões disponíveis apenas para vídeos da Shopee Video.' });
    }

    const caption = resolvedLink.caption || resolvedLink.description || resolvedLink.title;
    if (!caption || caption.trim().length < 8) {
        return res.status(200).json({
            products: [],
            meta: {
                linkHash,
                keywords: [],
                captionSnippet: caption?.trim() || '',
                fetchedAt: new Date().toISOString(),
                source: 'skipped',
                reason: 'caption_too_short',
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
