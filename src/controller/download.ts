import axios from 'axios';
import { Request, Response } from 'express';
import log from '../log';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';

const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB
const DOWNLOAD_TIMEOUT_MS = 30_000;

// Helper function to download a file from a URL
async function downloadFile(url: string, filePath: string): Promise<void> {
    const writer = (await fs.open(filePath, 'w')).createWriteStream();
    const response = await axios.get(url, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 3,
        validateStatus: status => (status ?? 0) >= 200 && (status ?? 0) < 400,
    });

    return new Promise((resolve, reject) => {
        let downloaded = 0;
        const abortWith = (err: Error) => {
            response.data.destroy(err);
            writer.destroy(err);
            reject(err);
        };

        response.data.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            if (downloaded > MAX_FILE_SIZE_BYTES) {
                abortWith(new Error('Arquivo remoto excede o limite de 150 MB'));
            }
        });
        response.data.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', resolve);
        response.data.pipe(writer);
    });
}

async function downloadWithFallback(urls: string[], filePath: string): Promise<string> {
    let lastError: Error | undefined;
    for (const candidate of urls) {
        try {
            log.info(`Attempting download from ${candidate}`);
            await downloadFile(candidate, filePath);
            return candidate;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Falha desconhecida ao baixar arquivo');
            log.warn(`Download failed for ${candidate}: ${lastError.message}`);
        }
    }
    throw lastError ?? new Error('Falha ao baixar arquivo');
}

async function logOriginalMetadata(inputPath: string): Promise<void> {
    if (!ffmpegPath) {
        log.warn('ffmpeg binary not found; skipping metadata logging.');
        return;
    }

    const ffmpeg = spawn(ffmpegPath, [
        '-v', 'error',
        '-i', inputPath,
        '-f', 'ffmetadata',
        '-'
    ]);

    return new Promise<void>((resolve) => {
        let stdoutBuffer = '';
        let stderrBuffer = '';

        ffmpeg.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
        });

        ffmpeg.stderr.on('data', (data) => {
            stderrBuffer += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                const report = buildMetadataReport(stdoutBuffer);
                log.info(`\n\n=== Original Metadata (will be removed) ===\n${report}\n\n`);
            } else {
                const stderrText = stderrBuffer.trim();
                log.warn(`\n\n=== Original Metadata (read failure) ===\nNão foi possível ler os metadados (exit code ${code}).${stderrText ? `\nDetalhes: ${stderrText}` : ''}\n\n`);
            }
            resolve();
        });

        ffmpeg.on('error', (err) => {
            log.warn('\n\n=== Original Metadata (read failure) ===\nFalha ao iniciar o ffmpeg para inspecionar os metadados.\n\n', err);
            resolve();
        });
    });
}

// Helper function to run ffmpeg
async function cleanupMetadata(inputPath: string, outputPath: string): Promise<void> {
    if (!ffmpegPath) {
        throw new Error('ffmpeg binary not found');
    }
    const ffmpeg = spawn(ffmpegPath, [
        '-i', inputPath,
        '-map_metadata', '-1',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-map', '0',
        outputPath
    ]);

    return new Promise<void>((resolve, reject) => {
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                log.info('ffmpeg processed video successfully.');
                resolve();
            } else {
                log.error(`ffmpeg exited with code ${code}`);
                reject(new Error('Failed to process video with ffmpeg.'));
            }
        });
        ffmpeg.stderr.on('data', (data) => {
            log.info(`ffmpeg stderr: ${data}`);
        });
        ffmpeg.on('error', (err) => {
            log.error('Failed to start ffmpeg process.', err);
            reject(err);
        });
    });
}

async function convertToMp3(inputPath: string, outputPath: string): Promise<void> {
    if (!ffmpegPath) {
        throw new Error('ffmpeg binary not found');
    }
    const ffmpeg = spawn(ffmpegPath, [
        '-i', inputPath,
        '-map_metadata', '-1',
        '-vn',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        outputPath,
    ]);

    return new Promise<void>((resolve, reject) => {
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                log.info('ffmpeg converted audio to mp3 successfully.');
                resolve();
            } else {
                log.error(`ffmpeg audio conversion exited with code ${code}`);
                reject(new Error('Failed to convert audio para MP3 com ffmpeg.'));
            }
        });
        ffmpeg.stderr.on('data', (data) => {
            log.info(`ffmpeg stderr: ${data}`);
        });
        ffmpeg.on('error', (err) => {
            log.error('Failed to start ffmpeg process for audio.', err);
            reject(err);
        });
    });
}

// Helper function to send the file to the user
async function sendFile(res: Response, filePath: string, fileName: string, contentType: string) {
    const stat = await fs.stat(filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const readStream = (await fs.open(filePath, 'r')).createReadStream();
    readStream.pipe(res);
}

export const downloadVideoHandler = async (req: Request, res: Response) => {
    const { url, fallback, type } = req.query as {
        url?: string;
        fallback?: string | string[];
        type?: string;
    };

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    if (!isValidHttpUrl(url)) {
        return res.status(400).json({ error: 'URL inválida' });
    }

    const fallbackList = Array.isArray(fallback) ? fallback : fallback ? [fallback] : [];
    const candidates = [url, ...fallbackList].filter(Boolean);
    const mediaType: 'video' | 'audio' = type === 'audio' ? 'audio' : 'video';
    const extension = mediaType === 'audio' ? '.mp3' : '.mp4';
    const downloadFileName = buildTimestampedFileName(extension);

    let tempDir: string | undefined;
    try {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svdown-'));
        const tempInputPath = path.join(tempDir, `input.${mediaType === 'audio' ? 'bin' : 'mp4'}`);
        const tempOutputPath = path.join(tempDir, mediaType === 'audio' ? 'output.mp3' : 'output.mp4');

        log.info(`Starting raw download from: ${url}`);
        const usedUrl = await downloadWithFallback(candidates, tempInputPath);
        log.info(`Download complete from ${usedUrl}. Starting ffmpeg processing.`);
        await logOriginalMetadata(tempInputPath);

        try {
            if (mediaType === 'audio') {
                await convertToMp3(tempInputPath, tempOutputPath);
                await sendFile(res, tempOutputPath, downloadFileName, 'audio/mpeg');
                log.info(`\n\n=== Download Summary ===\nArquivo: ${downloadFileName}\nEntrega: audio/mp3\nURL solicitada: ${url}\nURL resolvida: ${usedUrl}\nMetadados: removidos\n\n`);
            } else {
                await cleanupMetadata(tempInputPath, tempOutputPath);
                await sendFile(res, tempOutputPath, downloadFileName, 'video/mp4');
                log.info(`\n\n=== Download Summary ===\nArquivo: ${downloadFileName}\nEntrega: video/mp4\nURL solicitada: ${url}\nURL resolvida: ${usedUrl}\nMetadados: removidos\n\n`);
            }
        } catch (error) {
            log.error('Failed to process media, sending original file.', error);
            res.setHeader(mediaType === 'video' ? 'X-Metadata-Cleaned' : 'X-Audio-Transcoded', 'false');

            const contentType = mediaType === 'audio' ? 'application/octet-stream' : 'video/mp4';
            await sendFile(res, tempInputPath, downloadFileName, contentType);
            log.warn(`\n\n=== Download Summary ===\nArquivo: ${downloadFileName}\nEntrega: ${mediaType === 'audio' ? 'audio original' : 'video original'}\nURL solicitada: ${url}\nURL resolvida: ${usedUrl}\nMetadados: preservados (falha no processamento)\n\n`);
        }

    } catch (error) {
        log.error(error);
        if (!res.headersSent) {
            res.status(502).json({ error: 'Failed to download or process the media.' });
        }
    } finally {
        if (tempDir) {
            fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
                log.error(`Failed to cleanup temporary directory: ${tempDir}`, err);
            });
        }
    }
};

function buildTimestampedFileName(extension: string) {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    const timestamp = [
        now.getUTCFullYear(),
        pad(now.getUTCMonth() + 1),
        pad(now.getUTCDate())
    ].join('');
    const timePart = [pad(now.getUTCHours()), pad(now.getUTCMinutes()), pad(now.getUTCSeconds())].join('');
    return `SVDown-${timestamp}-${timePart}${ext}`;
}

function isValidHttpUrl(value: string) {
    try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

function buildMetadataReport(rawMetadata: string): string {
    const lines = rawMetadata.split(/\r?\n/);
    const sections = new Map<string, Array<{ key: string; value: string }>>();
    let currentSection = 'Global';

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';')) {
            continue;
        }

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            currentSection = trimmed.slice(1, -1) || 'Section';
            continue;
        }

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();

        if (!key) {
            continue;
        }

        const entries = sections.get(currentSection) ?? [];
        entries.push({ key, value });
        sections.set(currentSection, entries);
    }

    if (sections.size === 0) {
        return 'Nenhum metadado encontrado.';
    }

    const parts: string[] = [];
    for (const [section, entries] of sections) {
        parts.push(`${section}:`);
        for (const { key, value } of entries) {
            parts.push(`- ${key}: ${value || '(vazio)'}`);
        }
        parts.push('');
    }

    return parts.join('\n').trim();
}
