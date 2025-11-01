import axios from 'axios';
import { Request, Response } from 'express';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import fs from 'node:fs';
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

    if (!ffmpegPath) {
        res.status(500).json({ error: 'ffmpeg não disponível no servidor' });
        return;
    }

    const executable = ffmpegPath;

    try {
        const upstream = await fetchVideoStream(targetUrl, fallbackUrl);

        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'svdown-'));
        const outputPath = path.join(tmpDir, `${Date.now()}-clean.mp4`);
        const fileName = buildFileName(upstream.finalUrl);

        let cleaned = false;
        const ffmpeg = spawn(executable, [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', 'pipe:0',
            '-map_metadata', '-1',
            '-c', 'copy',
            '-movflags', '+faststart',
            outputPath,
        ]);

        const cleanup = async () => {
            if (cleaned) return;
            cleaned = true;
            try {
                await fsp.unlink(outputPath);
            } catch {}
            try {
                await fsp.rmdir(tmpDir);
            } catch {}
        };

        ffmpeg.stderr.on('data', chunk => {
            log.debug?.(chunk.toString());
        });

        ffmpeg.on('error', error => {
            log.error(error);
            upstream.stream.destroy();
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({ error: 'Falha na conversão do vídeo' });
            } else {
                res.end();
            }
        });

        upstream.stream.on('error', error => {
            log.error(error);
            ffmpeg.kill('SIGTERM');
            cleanup();
            if (!res.headersSent) {
                res.status(502).json({ error: 'Falha ao baixar o vídeo da Shopee' });
            } else {
                res.end();
            }
        });

        req.on('close', () => {
            ffmpeg.kill('SIGINT');
            upstream.stream.destroy();
            cleanup();
        });

        res.on('close', () => {
            cleanup();
        });

        ffmpeg.on('close', async code => {
            if (code !== 0) {
                log.error(`ffmpeg finalizou com código ${code}`);
                await cleanup();
                if (!res.headersSent) {
                    res.status(502).json({ error: 'Não foi possível limpar metadados do vídeo' });
                } else {
                    res.end();
                }
                return;
            }

            try {
                res.setHeader('Content-Type', 'video/mp4');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('X-Content-Type-Options', 'nosniff');

                const readStream = fs.createReadStream(outputPath);
                readStream.on('close', async () => {
                    await cleanup();
                });
                readStream.on('error', async error => {
                    log.error(error);
                    await cleanup();
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Falha ao enviar vídeo processado' });
                    } else {
                        res.end();
                    }
                });
                readStream.pipe(res);
            } catch (error) {
                log.error(error);
                await cleanup();
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Falha ao preparar vídeo para download' });
                } else {
                    res.end();
                }
            }
        });

        upstream.stream.pipe(ffmpeg.stdin);
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
        return { stream: primaryResponse.data, finalUrl: primary };
    } catch (error) {
        if (fallback) {
            log.warn('Falha no download primário, tentando fallback...', error instanceof Error ? error.message : error);
            const fallbackResponse = await axios.get(fallback.toString(), {
                responseType: 'stream',
            });
            return { stream: fallbackResponse.data, finalUrl: fallback };
        }
        throw error;
    }
}

function buildFileName(url: URL) {
    const lastSegment = url.pathname.split('/').filter(Boolean).pop() || 'video';
    return lastSegment.endsWith('.mp4') ? lastSegment : `${lastSegment}.mp4`;
}
