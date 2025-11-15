import { Request, Response } from 'express';
import log from '../log';
import { services } from '../services';
import { ServiceAvailabilityError } from '../services/errors';
import { extractUrl } from '../services/utils';
import { hashLink, rememberResolvedLink } from '../services/resolvedLinkStore';
import type { ResolveResult } from '../services/types';

export const resolveLinkResponse = async (req: Request, res: Response) => {
    const linkInput = req.body.link as string;
    const link = extractUrl(linkInput) || linkInput;
    log.info(`Received link to resolve: ${link}`);

    try {
        const service = services.find(s => s.isApplicable(link));

        if (service) {
            log.info(`Service found for link: ${link}. Service: ${service.constructor.name}`);
            const result = await service.resolve(link);
            const linkHash = safeHashLink(link);
            const caption = extractCaption(result);
            rememberResolvedLink(linkHash, link, {
                service: result.service,
                caption,
                description: result.description,
                title: result.title,
            });
            log.info(`Service ${service.constructor.name} resolved link ${link}`);
            res.json({ ...result, linkHash });
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

function safeHashLink(link: string): string {
    try {
        return hashLink(link);
    } catch {
        return '';
    }
}

function extractCaption(result: ResolveResult): string | null {
    const candidates: Array<unknown> = [
        result.description,
        result.pageProps?.mediaInfo?.video?.caption,
        result.pageProps?.videoInfo?.caption,
        result.title,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }
    return null;
}
