import axios from 'axios';
import { Request, Response } from 'express';
import log from '../log';

export const downloadVideoHandler = async (req: Request, res: Response) => {
    const { url, fallback } = req.query as { url?: string; fallback?: string };

    if (!url) {
        res.status(400).json({ error: 'Parâmetro url é obrigatório' });
        return;
    }

    let targetUrl: URL;
    let fallbackUrl: URL | undefined;
    try {
        targetUrl = new URL(url);
    } catch {
        res.status(400).json({ error: 'URL inválida' });
        return;
    }

    if (fallback) {
        try {
            fallbackUrl = new URL(fallback);
        } catch {
            log.warn('Fallback URL inválida recebida, ignorando.');
        }
    }

    try {
        log.info(`Iniciando download bruto: ${targetUrl.toString()}`);
        const response = await fetchWithFallback(targetUrl, fallbackUrl);
        const fileName = buildFileName(response.sourceUrl);

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        response.stream.on('error', error => {
            log.error(error);
            if (!res.headersSent) {
                res.status(502).json({ error: 'Falha ao baixar o vídeo da Shopee' });
            } else {
                res.end();
            }
        });

        req.on('close', () => {
            response.stream.destroy();
        });

        response.stream.pipe(res);
    } catch (error) {
        log.error(error);
        res.status(502).json({ error: 'Falha ao baixar o vídeo da Shopee' });
    }
};

async function fetchWithFallback(primary: URL, fallback?: URL) {
    try {
        const primaryResponse = await axios.get(primary.toString(), {
            responseType: 'stream',
        });
        log.info('Download primário bem-sucedido');
        return { stream: primaryResponse.data, sourceUrl: primary };
    } catch (error) {
        log.warn(`Falha no download primário: ${error instanceof Error ? error.message : error}`);
        if (!fallback) throw error;
        const fallbackResponse = await axios.get(fallback.toString(), {
            responseType: 'stream',
        });
        log.info('Fallback utilizado com sucesso');
        return { stream: fallbackResponse.data, sourceUrl: fallback };
    }
}

function buildFileName(url: URL) {
    const lastSegment = url.pathname.split('/').filter(Boolean).pop() || 'video';
    return lastSegment.endsWith('.mp4') ? lastSegment : `${lastSegment}.mp4`;
}
