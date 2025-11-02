import { Request, Response } from 'express';
import log from '../log';
import { resolveShopeeLink } from './resolvers/shopee/shopeeResolver';

export const resolveLinkResponse = async (req: Request, res: Response) => {
    const link = req.body.link as string;
    log.info(`Received link to resolve: ${link}`);

    try {
        let result;
        const parsedUrl = new URL(link);
        const hostname = parsedUrl.hostname;

        if (hostname.endsWith('shp.ee') || hostname.endsWith('shopee.com.br')) {
            result = await resolveShopeeLink(link);
        } else {
            throw new Error('Unsupported link type');
        }

        res.json(result);
    } catch (error) {
        log.error(error);
        const message = error instanceof Error ? error.message : 'Falha ao resolver link';
        const isClientError = message.startsWith('Link') || message.startsWith('Parâmetro') || message.startsWith('Tipo');
        res.status(isClientError ? 400 : 500).json({ error: message });
    }
};