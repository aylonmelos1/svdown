import { Request, Response } from 'express';
import log from '../log';
import { services } from '../services';
import { ServiceAvailabilityError } from '../services/errors';

export const resolveLinkResponse = async (req: Request, res: Response) => {
    const link = req.body.link as string;
    log.info(`Received link to resolve: ${link}`);

    try {
        const service = services.find(s => s.isApplicable(link));

        if (service) {
            log.info(`Service found for link: ${link}. Service: ${service.constructor.name}`);
            const result = await service.resolve(link);
            log.info(`Service ${service.constructor.name} resolved link ${link}`);
            res.json(result);
        } else {
            log.warn(`No service found for link: ${link}`);
            throw new Error('Tipo de link não suportado');
        }
    } catch (error) {
        log.error(error);
        let message = error instanceof Error ? error.message : 'Falha ao resolver link';
        let statusCode = 500;

        if (error instanceof ServiceAvailabilityError) {
            statusCode = error.statusCode;
            if (error.detail) {
                log.warn(`Detalhes do erro de disponibilidade (${error.service}): ${error.detail}`);
            }
        } else {
            const isClientError =
                message.startsWith('Link') ||
                message.startsWith('Parâmetro') ||
                message.startsWith('Tipo') ||
                message.includes('não suportado');
            statusCode = isClientError ? 400 : 500;
        }

        res.status(statusCode).json({ error: message });
    }
};
