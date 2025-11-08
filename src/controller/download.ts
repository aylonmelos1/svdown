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
import { cleanupMetadata, convertToMp3, finalizeCleanMedia, metadataFeatures, redactForLogs } from '../lib/mediaCleaner';

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
            log.info(`Attempting download from ${redactForLogs(candidate)}`);
            await downloadFile(candidate, filePath);
            return candidate;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Falha desconhecida ao baixar arquivo');
            log.warn(`Download failed for ${redactForLogs(candidate)}: ${lastError.message}`);
        }
    }
    throw lastError ?? new Error('Falha ao baixar arquivo');
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
                if (metadataFeatures.sensitiveLogs) {
                    log.info(`\n\n=== Original Metadata (will be removed) ===\n${report}\n\n`);
                } else {
                    log.info('Original metadata captured (redacted; sensitive logging disabled).');
                }
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
    const { url, fallback, type, service, duration, durationSeconds, durationMs } = req.query as {
        url?: string;
        fallback?: string | string[];
        type?: string;
        service?: string;
        duration?: string;
        durationSeconds?: string;
        durationMs?: string;
    };
    const serviceParam = parseServiceParam(service);
    const durationParam = parseDurationParam(duration ?? durationSeconds ?? durationMs);

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

        if (serviceParam === 'mercadolivre') {
            tempInputPath = await downloadHlsStream(url, tempDir, 'input.mp4');
            usedUrl = url;
        } else {
            tempInputPath = path.join(tempDir, mediaType === 'audio' ? 'input.bin' : 'input.mp4');
            log.info(`Starting raw download from: ${redactForLogs(url)}`);
            usedUrl = await downloadWithFallback(candidates, tempInputPath);
        }

        const effectiveInputPath = tempInputPath;
        const effectiveSource = usedUrl ?? url;
        const safeRequestedUrl = redactForLogs(url);
        const safeResolvedUrl = redactForLogs(effectiveSource);

        log.info(`Download complete from ${safeResolvedUrl}. Starting ffmpeg processing.`);
        const probedDurationSeconds = await logOriginalMetadata(effectiveInputPath);

        try {
            if (mediaType === 'audio') {
                await convertToMp3(effectiveInputPath, tempOutputPath);
                await finalizeCleanMedia('audio', tempOutputPath);
                res.setHeader('X-Audio-Transcoded', 'true');
                trackDownload({ durationSeconds: probedDurationSeconds });
                await sendFile(res, tempOutputPath, downloadFileName, 'audio/mpeg');
                log.info(`\n\n=== Download Summary ===\nArquivo: ${downloadFileName}\nEntrega: audio/mp3\nURL solicitada: ${safeRequestedUrl}\nURL resolvida: ${safeResolvedUrl}\nMetadados: removidos\n\n`);
            } else {
                await cleanupMetadata(effectiveInputPath, tempOutputPath);
                await finalizeCleanMedia('video', tempOutputPath);
                res.setHeader('X-Metadata-Cleaned', 'true');
                trackDownload({ durationSeconds: probedDurationSeconds });
                await sendFile(res, tempOutputPath, downloadFileName, 'video/mp4');
                log.info(`\n\n=== Download Summary ===\nArquivo: ${downloadFileName}\nEntrega: video/mp4\nURL solicitada: ${safeRequestedUrl}\nURL resolvida: ${safeResolvedUrl}\nMetadados: removidos\n\n`);
            }
        } catch (error) {
            log.error('Failed to process media, sending original file.', error);
            res.setHeader(mediaType === 'video' ? 'X-Metadata-Cleaned' : 'X-Audio-Transcoded', 'false');

            const contentType = mediaType === 'audio' ? 'application/octet-stream' : 'video/mp4';
            trackDownload({ durationSeconds: probedDurationSeconds });
            await sendFile(res, effectiveInputPath, downloadFileName, contentType);
            log.warn(`\n\n=== Download Summary ===\nArquivo: ${downloadFileName}\nEntrega: ${mediaType === 'audio' ? 'audio original' : 'video original'}\nURL solicitada: ${safeRequestedUrl}\nURL resolvida: ${safeResolvedUrl}\nMetadados: preservados (falha no processamento)\n\n`);
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

async function downloadHlsStream(masterPlaylistUrl: string, outputDir: string, outputFileName: string): Promise<string> {
    // 1. Download master playlist
    const masterPlaylistResponse = await axios.get(masterPlaylistUrl);
    const masterPlaylist = masterPlaylistResponse.data;

    // 2. Parse master playlist to find best quality stream
    const streams = masterPlaylist.split('\n').filter((line: string) => line.startsWith('#EXT-X-STREAM-INF'));
    let bestStreamUrl: string | null = null;

    if (streams.length === 0) {
        // Not a master playlist, but a media playlist
        bestStreamUrl = masterPlaylistUrl;
    } else {
        let maxResolution = 0;
        for (let i = 0; i < streams.length; i++) {
            const streamInfo = streams[i];
            const resolutionMatch = streamInfo.match(/RESOLUTION=(\d+)x(\d+)/);
            if (resolutionMatch) {
                const width = parseInt(resolutionMatch[1], 10);
                const height = parseInt(resolutionMatch[2], 10);
                const resolution = width * height;
                if (resolution > maxResolution) {
                    maxResolution = resolution;
                    const nextLine = masterPlaylist.split('\n')[masterPlaylist.split('\n').indexOf(streamInfo) + 1];
                    bestStreamUrl = new URL(nextLine, masterPlaylistUrl).href;
                }
            }
        }
    }


    if (!bestStreamUrl) {
        throw new Error('Could not find a suitable stream in the playlist.');
    }

    // 3. Download media playlist
    const mediaPlaylistResponse = await axios.get(bestStreamUrl);
    const mediaPlaylist = mediaPlaylistResponse.data;

    // 4. Parse media playlist to get segment URLs
    const segmentUrls = mediaPlaylist.split('\n').filter((line: string) => line.length > 0 && !line.startsWith('#')).map((line: string) => new URL(line, bestStreamUrl as string).href);

    // 5. Download all segments in parallel
    const segmentDir = path.join(outputDir, 'segments');
    await fs.mkdir(segmentDir);
    const segmentPaths: string[] = [];

    await Promise.all(segmentUrls.map(async (segmentUrl: string, index: number) => {
        const segmentPath = path.join(segmentDir, `segment${index}.ts`);
        await downloadFile(segmentUrl, segmentPath);
        segmentPaths.push(segmentPath);
    }));

    // 6. Create a text file listing all the segment files in order
    const concatFilePath = path.join(segmentDir, 'concat.txt');
    const concatContent = segmentPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    await fs.writeFile(concatFilePath, concatContent);

    // 7. Use ffmpeg to concatenate the segments
    const outputPath = path.join(outputDir, outputFileName);
    if (!ffmpegPath) {
        throw new Error('ffmpeg binary not found');
    }
    const ffmpeg = spawn(ffmpegPath, [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c', 'copy',
        outputPath
    ]);

    return new Promise<string>((resolve, reject) => {
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath);
            } else {
                reject(new Error(`ffmpeg exited with code ${code}`));
            }
        });
        ffmpeg.on('error', reject);
    });
}


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
    const allowed: SupportedService[] = ['shopee', 'pinterest', 'tiktok', 'youtube', 'meta', 'mercadolivre'];
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
