import axios from 'axios';
import { Request, Response } from 'express';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import log from '../log';

export const downloadVideoHandler = async (req: Request, res: Response) => {
    const { url } = req.query as { url?: string };

    if (!url) {
        res.status(400).json({ error: 'Parâmetro url é obrigatório' });
        return;
    }

    let targetUrl: URL;
    try {
        targetUrl = new URL(url);
    } catch {
        res.status(400).json({ error: 'URL inválida' });
        return;
    }

    if (!ffmpegPath) {
        res.status(500).json({ error: 'ffmpeg não disponível no servidor' });
        return;
    }

    try {
        const videoResponse = await axios.get(targetUrl.toString(), {
            responseType: 'stream',
        });

        const fileName = buildFileName(targetUrl);
        const ffmpeg = spawn(ffmpegPath, [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', 'pipe:0',
            '-map_metadata', '-1',
            '-c', 'copy',
            '-movflags', '+faststart',
            '-f', 'mp4',
            'pipe:1',
        ]);

        let headersSent = false;

        const sendHeadersOnce = () => {
            if (headersSent) return;
            headersSent = true;
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        };

        ffmpeg.stdout.on('data', sendHeadersOnce);

        ffmpeg.stderr.on('data', chunk => {
            log.debug?.(chunk.toString());
        });

        ffmpeg.on('error', error => {
            log.error(error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Falha na conversão do vídeo' });
            } else {
                res.end();
            }
        });

        ffmpeg.on('close', code => {
            if (code !== 0) {
                log.error(`ffmpeg finalizou com código ${code}`);
                if (!res.headersSent) {
                    res.status(502).json({ error: 'Não foi possível limpar metadados do vídeo' });
                } else {
                    res.end();
                }
            } else {
                res.end();
            }
        });

        req.on('close', () => {
            ffmpeg.kill('SIGINT');
            videoResponse.data.destroy();
        });

        videoResponse.data.on('error', error => {
            log.error(error);
            ffmpeg.kill('SIGTERM');
            if (!res.headersSent) {
                res.status(502).json({ error: 'Falha ao baixar o vídeo da Shopee' });
            } else {
                res.end();
            }
        });

        videoResponse.data.pipe(ffmpeg.stdin);
        ffmpeg.stdout.pipe(res, { end: false });
    } catch (error) {
        log.error(error);
        res.status(502).json({ error: 'Falha ao baixar o vídeo da Shopee' });
    }
};

function buildFileName(url: URL) {
    const lastSegment = url.pathname.split('/').filter(Boolean).pop() || 'video';
    return lastSegment.endsWith('.mp4') ? lastSegment : `${lastSegment}.mp4`;
}
