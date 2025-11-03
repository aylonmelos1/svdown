import axios from 'axios';
import { Request, Response } from 'express';
import log from '../log';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';
import { sanitizeBaseName } from '../services/utils';

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
    const { url, fallback, type, filename } = req.query as {
        url?: string;
        fallback?: string | string[];
        type?: string;
        filename?: string;
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

    let tempDir: string | undefined;
    try {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svdown-'));
        const tempInputPath = path.join(tempDir, `input.${mediaType === 'audio' ? 'bin' : 'mp4'}`);
        const tempOutputPath = path.join(tempDir, mediaType === 'audio' ? 'output.mp3' : 'output.mp4');

        log.info(`Starting raw download from: ${url}`);
        const usedUrl = await downloadWithFallback(candidates, tempInputPath);
        log.info(`Download complete from ${usedUrl}. Starting ffmpeg processing.`);

        const targetFileName = resolveFileName(usedUrl, filename, mediaType);

        try {
            if (mediaType === 'audio') {
                await convertToMp3(tempInputPath, tempOutputPath);
                await sendFile(res, tempOutputPath, ensureExtension(targetFileName, '.mp3'), 'audio/mpeg');
            } else {
                await cleanupMetadata(tempInputPath, tempOutputPath);
                await sendFile(res, tempOutputPath, ensureExtension(targetFileName, '.mp4'), 'video/mp4');
            }
        } catch (error) {
            log.error('Failed to process media, sending original file.', error);
            res.setHeader(mediaType === 'video' ? 'X-Metadata-Cleaned' : 'X-Audio-Transcoded', 'false');

            const contentType = mediaType === 'audio' ? 'application/octet-stream' : 'video/mp4';
            const fallbackName = resolveOriginalFileName(usedUrl, targetFileName);
            await sendFile(res, tempInputPath, fallbackName, contentType);
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

function ensureExtension(fileName: string, extension: string) {
    if (fileName.toLowerCase().endsWith(extension.toLowerCase())) {
        return fileName;
    }
    return `${fileName}${extension}`;
}

function resolveFileName(url: string, provided: string | undefined, mediaType: 'video' | 'audio') {
    const defaultBase = mediaType === 'audio' ? 'audio' : 'video';
    const extension = mediaType === 'audio' ? '.mp3' : '.mp4';
    if (provided) {
        const base = sanitizeBaseName(provided.replace(/\.[^.]+$/, '')) || defaultBase;
        return ensureExtension(base, extension);
    }

    const parsedBase = sanitizeBaseName(extractFileName(url)) || defaultBase;
    return ensureExtension(parsedBase, extension);
}

function resolveOriginalFileName(url: string, fallback: string) {
    const original = extractFileName(url);
    if (!original) return fallback;
    const base = sanitizeBaseName(original.replace(/\.[^.]+$/, '')) || fallback.replace(/\.[^.]+$/, '');
    const ext = path.extname(original) || path.extname(fallback) || '.bin';
    return `${base}${ext}`;
}

function extractFileName(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
        return lastSegment || undefined;
    } catch {
        return undefined;
    }
}

function isValidHttpUrl(value: string) {
    try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}
