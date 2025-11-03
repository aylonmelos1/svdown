import { Request, Response } from 'express';
import log from '../log';
import { services } from '../services';

export const resolveLinkResponse = async (req: Request, res: Response) => {
    const link = req.body.link as string;
    log.info(`Received link to resolve: ${link}`);

    try {
        const service = services.find(s => s.isApplicable(link));

        if (service) {
            log.info(`Service found for link: ${link}. Service: ${service.constructor.name}`);
            const result = await service.resolve(link);
            log.info(`Service ${service.constructor.name} resolved link ${link} with result: ${JSON.stringify(result)}`);
            res.json(result);
        } else {
            log.warn(`No service found for link: ${link}`);
            throw new Error('Unsupported link type');
        }
    } catch (error) {
        log.error(error);
        const message = error instanceof Error ? error.message : 'Falha ao resolver link';
        const isClientError = message.startsWith('Link') || message.startsWith('Parâmetro') || message.startsWith('Tipo');
        res.status(isClientError ? 400 : 500).json({ error: message });
    }
};