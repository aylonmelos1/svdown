import axios from 'axios';
import { Request, Response } from 'express';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
        const response = await axios.get(targetUrl.toString(), {
            responseType: 'stream',
        });
        const fileName = buildFileName(targetUrl);

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        response.data.on('error', error => {
            log.error(error);
            if (!res.headersSent) {
                res.status(502).json({ error: 'Falha ao baixar o vídeo da Shopee' });
            } else {
                res.end();
            }
        });

        req.on('close', () => {
            response.data.destroy();
        });

        response.data.pipe(res);
    } catch (error) {
        log.error(error);
        res.status(502).json({ error: 'Falha ao baixar o vídeo da Shopee' });
    }
};

async function fetchVideoStream(primary: URL, fallback?: URL) {
    try {
        const primaryResponse = await axios.get(primary.toString(), {
            responseType: 'stream',
        });
        log.info('Download primário bem-sucedido');
        return { stream: primaryResponse.data, finalUrl: primary };
    } catch (error) {
        log.warn(`Falha no download primário: ${error instanceof Error ? error.message : error}`);
        if (fallback) {
            const fallbackResponse = await axios.get(fallback.toString(), {
                responseType: 'stream',
            });
            log.info('Fallback utilizado com sucesso');
            return { stream: fallbackResponse.data, finalUrl: fallback };
        }
        throw error;
    }
}

function buildFileName(url: URL) {
    const lastSegment = url.pathname.split('/').filter(Boolean).pop() || 'video';
    return lastSegment.endsWith('.mp4') ? lastSegment : `${lastSegment}.mp4`;
}
