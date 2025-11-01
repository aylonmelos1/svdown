import { Request, Response } from 'express';
import log from '../log';
import { resolveShopeeUniversalLink } from './linkShort';
import { fetchUniversalLinkPayload } from './universalLink';

export const resolveLinkResponse = async (req: Request, res: Response) => {
    const link = req.body.link;
    log.info(`Received link to resolve: ${link}`);

    try {
        const result = await resolveShopeeLink(link);
        res.json(result);
    } catch (error) {
        log.error(error);
        const message = error instanceof Error ? error.message : 'Falha ao resolver link';
        const isClientError = message.startsWith('Link') || message.startsWith('Parâmetro') || message.startsWith('Tipo');
        res.status(isClientError ? 400 : 500).json({ error: message });
    }
};

async function resolveShopeeLink(input: string) {
    if (!input) {
        throw new Error('Link não informado');
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(input);
    } catch {
        throw new Error('Link inválido');
    }

    const hostname = parsedUrl.hostname;
    const pathname = parsedUrl.pathname;

    let universalLink: string;

    if (hostname.endsWith('shp.ee')) {
        universalLink = await resolveShopeeUniversalLink(input);
    } else if (pathname.includes('/universal-link')) {
        universalLink = parsedUrl.toString();
    } else {
        throw new Error('Tipo de link não suportado');
    }

    const payload = await fetchUniversalLinkPayload(universalLink);

    return {
        universalLink,
        ...payload,
    };
}
