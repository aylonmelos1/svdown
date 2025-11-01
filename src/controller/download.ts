import axios from 'axios';
import { Request, Response } from 'express';
import log from '../log';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';

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

    let tempDir: string | undefined;
    try {
        log.info(`Iniciando download bruto: ${targetUrl.toString()}`);
        const response = await fetchWithFallback(targetUrl, fallbackUrl);
        const fileName = buildFileName(response.sourceUrl);

        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svdown-'));
        const tempInputPath = path.join(tempDir, 'input.mp4');
        const tempOutputPath = path.join(tempDir, 'output.mp4');

        const writer = (await fs.open(tempInputPath, 'w')).createWriteStream();
        response.stream.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        log.info('Download para arquivo temporário concluído. Iniciando ffmpeg.');

        const ffmpeg = spawn(ffmpegPath!, [
            '-i', tempInputPath,
            '-map_metadata', '-1',
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-map', '0',
            tempOutputPath
        ]);

        await new Promise<void>((resolve, reject) => {
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    log.info('ffmpeg processou o vídeo com sucesso.');
                    resolve();
                } else {
                    log.error(`ffmpeg encerrou com o código ${code}`);
                    reject(new Error('Falha ao processar o vídeo com ffmpeg.'));
                }
            });
            ffmpeg.stderr.on('data', (data) => {
                log.info(`ffmpeg stderr: ${data}`);
            });
            ffmpeg.on('error', (err) => {
                log.error('Falha ao iniciar o processo ffmpeg.', err);
                reject(err);
            });
        });

        const stat = await fs.stat(tempOutputPath);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        const readStream = (await fs.open(tempOutputPath, 'r')).createReadStream();
        readStream.pipe(res);

        req.on('close', () => {
            readStream.destroy();
        });

    } catch (error) {
        log.error(error);
        if (!res.headersSent) {
            res.status(502).json({ error: 'Falha ao baixar ou processar o vídeo.' });
        }
    } finally {
        if (tempDir) {
            fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
                log.error(`Falha ao limpar diretório temporário: ${tempDir}`, err);
            });
        }
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
