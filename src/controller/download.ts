import axios from 'axios';
import { Request, Response } from 'express';
import log from '../log';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';
import { recordDownloadEvent } from '../services/sessionStore';
import type { SupportedService } from '../services/types';
import { findYtDlpBinary } from '../lib/ytDlp';

const USER_ID_COOKIE = 'svdown_uid';

const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB
const DOWNLOAD_TIMEOUT_MS = 30_000;

// Helper function to download a file from a URL
const DOWNLOAD_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive',
};

async function downloadFile(url: string, filePath: string): Promise<void> {
    const writer = (await fs.open(filePath, 'w')).createWriteStream();
    const response = await axios.get(url, {
        responseType: 'stream',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 3,
        headers: DOWNLOAD_HEADERS,
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

type YtDlpDownloadOptions = {
    sourceUrl: string;
    tempDir: string;
    mediaType: 'video' | 'audio';
};

async function downloadViaYtDlp(options: YtDlpDownloadOptions): Promise<string> {
    const binaryPath = await findYtDlpBinary();

    const outputPrefix = path.join(options.tempDir, options.mediaType === 'audio' ? 'yt-audio' : 'yt-video');
    const baseArgs = [
        '--no-progress',
        '--no-playlist',
        '--force-overwrites',
        '--ignore-errors',
        '--restrict-filenames',
        '--concurrent-fragments', '1',
        '-o', `${outputPrefix}.%(ext)s`,
    ];
    const formatArgs = options.mediaType === 'audio'
        ? ['-f', 'bestaudio[ext=m4a]/bestaudio/best']
        : ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '--merge-output-format', 'mp4'];
    const ffmpegLocationArgs =
        typeof ffmpegPath === 'string' && ffmpegPath.length > 0
            ? ['--ffmpeg-location', ffmpegPath]
            : [];

    const ytArgs = [...formatArgs, ...ffmpegLocationArgs, ...baseArgs, options.sourceUrl];
    const ytProcess = spawn(binaryPath, ytArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrBuffer = '';
    let stdoutBuffer = '';
    ytProcess.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderrBuffer += text;
    });
    ytProcess.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
    });

    const exitCode: number = await new Promise((resolve, reject) => {
        ytProcess.on('error', reject);
        ytProcess.on('close', resolve);
    });

    if (exitCode !== 0) {
        const stderrText = stderrBuffer.trim();
        const stdoutText = stdoutBuffer.trim();
        const reason = stderrText || stdoutText;
        throw new Error(`yt-dlp exited with code ${exitCode}${reason ? `: ${reason}` : ''}`);
    }

    if (stderrBuffer.trim()) {
        log.info(`yt-dlp stderr: ${stderrBuffer.trim()}`);
    }

    const files = await fs.readdir(options.tempDir);
    const prefix = path.basename(outputPrefix);
    const match = files.find(name => name.startsWith(`${prefix}.`));
    if (!match) {
        throw new Error('yt-dlp não gerou um arquivo de saída.');
    }

    return path.join(options.tempDir, match);
}

async function logOriginalMetadata(inputPath: string): Promise<number | null> {
    if (!ffmpegPath) {
        log.warn('ffmpeg binary not found; skipping metadata logging.');
        return null;
    }

    const ffmpeg = spawn(ffmpegPath, [
        '-v', 'error',
        '-i', inputPath,
        '-f', 'ffmetadata',
        '-'
    ]);

    return new Promise<number | null>((resolve) => {
        let stdoutBuffer = '';
        let stderrBuffer = '';

        ffmpeg.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
        });

        ffmpeg.stderr.on('data', (data) => {
            stderrBuffer += data.toString();
        });

        ffmpeg.on('close', (code) => {
            let parsedDuration: number | null = null;
            if (code === 0) {
                const report = buildMetadataReport(stdoutBuffer);
                parsedDuration = extractDurationFromMetadataDump(stdoutBuffer);
                log.info(`\n\n=== Original Metadata (will be removed) ===\n${report}\n\n`);
            } else {
                const stderrText = stderrBuffer.trim();
                log.warn(`\n\n=== Original Metadata (read failure) ===\nNão foi possível ler os metadados (exit code ${code}).${stderrText ? `\nDetalhes: ${stderrText}` : ''}\n\n`);
            }
            resolve(parsedDuration);
        });

        ffmpeg.on('error', (err) => {
            log.warn('\n\n=== Original Metadata (read failure) ===\nFalha ao iniciar o ffmpeg para inspecionar os metadados.\n\n', err);
            resolve(null);
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
    const { url, fallback, type, service, duration, durationSeconds, durationMs, sourceUrl } = req.query as {
        url?: string;
        fallback?: string | string[];
        type?: string;
        service?: string;
        duration?: string;
        durationSeconds?: string;
        durationMs?: string;
        sourceUrl?: string;
    };
    const serviceParam = parseServiceParam(service);
    const durationParam = parseDurationParam(duration ?? durationSeconds ?? durationMs);

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    if (!isValidHttpUrl(url)) {
        return res.status(400).json({ error: 'URL inválida' });
    }

    const sourceUrlParam = parseOptionalUrl(sourceUrl);
    const fallbackList = Array.isArray(fallback) ? fallback : fallback ? [fallback] : [];
    const candidates = [url, ...fallbackList].filter(Boolean);
    const mediaType: 'video' | 'audio' = type === 'audio' ? 'audio' : 'video';
    const extension = mediaType === 'audio' ? '.mp3' : '.mp4';
    const downloadFileName = buildTimestampedFileName(extension);
    const userId = getUserIdFromRequest(req);
    const trackDownload = createDownloadTracker(res, {
        userId,
        service: serviceParam,
        mediaType,
        durationSeconds: durationParam,
    });

    let tempDir: string | undefined;
    try {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svdown-'));
        const tempOutputPath = path.join(tempDir, mediaType === 'audio' ? 'output.mp3' : 'output.mp4');

        let tempInputPath: string | null = null;
        let usedUrl: string | undefined;

        if (serviceParam === 'youtube') {
            const youtubeSource = sourceUrlParam ?? (isValidHttpUrl(url) ? url : null);
            if (youtubeSource) {
                try {
                    log.info(`Starting yt-dlp download for ${youtubeSource}`);
                    tempInputPath = await downloadViaYtDlp({
                        sourceUrl: youtubeSource,
                        tempDir,
                        mediaType,
                    });
                    usedUrl = youtubeSource;
                    log.info(`yt-dlp download finished for ${youtubeSource}`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    log.warn(`yt-dlp download failed for ${youtubeSource}: ${message}`);
                }
            } else {
                log.warn('Nenhuma fonte válida do YouTube recebida; tentando download direto.');
            }
        }

        if (!tempInputPath) {
            tempInputPath = path.join(tempDir, mediaType === 'audio' ? 'input.bin' : 'input.mp4');
            log.info(`Starting raw download from: ${url}`);
            usedUrl = await downloadWithFallback(candidates, tempInputPath);
        }

        const effectiveInputPath = tempInputPath;
        const effectiveSource = usedUrl ?? url;

        log.info(`Download complete from ${effectiveSource}. Starting ffmpeg processing.`);
        const probedDurationSeconds = await logOriginalMetadata(effectiveInputPath);

        try {
            if (mediaType === 'audio') {
                await convertToMp3(effectiveInputPath, tempOutputPath);
                trackDownload({ durationSeconds: probedDurationSeconds });
                await sendFile(res, tempOutputPath, downloadFileName, 'audio/mpeg');
                log.info(`\n\n=== Download Summary ===\nArquivo: ${downloadFileName}\nEntrega: audio/mp3\nURL solicitada: ${url}\nURL resolvida: ${effectiveSource}\nMetadados: removidos\n\n`);
            } else {
                await cleanupMetadata(effectiveInputPath, tempOutputPath);
                trackDownload({ durationSeconds: probedDurationSeconds });
                await sendFile(res, tempOutputPath, downloadFileName, 'video/mp4');
                log.info(`\n\n=== Download Summary ===\nArquivo: ${downloadFileName}\nEntrega: video/mp4\nURL solicitada: ${url}\nURL resolvida: ${effectiveSource}\nMetadados: removidos\n\n`);
            }
        } catch (error) {
            log.error('Failed to process media, sending original file.', error);
            res.setHeader(mediaType === 'video' ? 'X-Metadata-Cleaned' : 'X-Audio-Transcoded', 'false');

            const contentType = mediaType === 'audio' ? 'application/octet-stream' : 'video/mp4';
            trackDownload({ durationSeconds: probedDurationSeconds });
            await sendFile(res, effectiveInputPath, downloadFileName, contentType);
            log.warn(`\n\n=== Download Summary ===\nArquivo: ${downloadFileName}\nEntrega: ${mediaType === 'audio' ? 'audio original' : 'video original'}\nURL solicitada: ${url}\nURL resolvida: ${effectiveSource}\nMetadados: preservados (falha no processamento)\n\n`);
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

function parseOptionalUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    return isValidHttpUrl(value) ? value : null;
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

function getUserIdFromRequest(req: Request): string | null {
    const candidate = req.cookies?.[USER_ID_COOKIE];
    if (typeof candidate !== 'string') {
        return null;
    }
    return isValidUserId(candidate) ? candidate : null;
}

function isValidUserId(value: string): boolean {
    return /^[a-zA-Z0-9_-]{16,}$/.test(value);
}

type TrackerOptions = {
    userId: string | null;
    service: SupportedService | null;
    mediaType: 'video' | 'audio';
    durationSeconds: number | null;
};

function createDownloadTracker(res: Response, options: TrackerOptions) {
    let recorded = false;
    return (override?: Partial<Pick<TrackerOptions, 'durationSeconds'>>) => {
        if (recorded || !options.userId || res.headersSent) {
            return;
        }
        recorded = true;
        try {
            const totalDownloads = recordDownloadEvent({
                userId: options.userId,
                service: options.service,
                mediaType: options.mediaType,
                durationSeconds: selectDuration(options.durationSeconds, override?.durationSeconds),
            });
            res.setHeader('X-Download-Count', String(totalDownloads));
        } catch (error) {
            log.error(`Failed to update download count for ${options.userId}`, error);
        }
    };
}

function selectDuration(base: number | null, override?: number | null) {
    if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
        return override;
    }
    return base ?? null;
}

function parseServiceParam(value: unknown): SupportedService | null {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.toLowerCase() as SupportedService;
    const allowed: SupportedService[] = ['shopee', 'pinterest', 'tiktok', 'youtube', 'meta'];
    return allowed.includes(normalized) ? normalized : null;
}

function parseDurationParam(value: unknown): number | null {
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
    }
    return null;
}

function extractDurationFromMetadataDump(dump: string): number | null {
    if (!dump) {
        return null;
    }
    const match = dump.match(/duration\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (!match) {
        return null;
    }
    const parsed = Number.parseFloat(match[1]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}
