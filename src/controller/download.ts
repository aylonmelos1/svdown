import axios from 'axios';
import { Request, Response } from 'express';
import log from '../log';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { exiftoolPath as resolveExiftoolPath } from 'exiftool-vendored/dist/ExiftoolPath';
import { recordDownloadEvent } from '../services/sessionStore';
import type { SupportedService } from '../services/types';

const USER_ID_COOKIE = 'svdown_uid';

const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB
const DOWNLOAD_TIMEOUT_MS = 30_000;
const OPTIONAL_TOOL_TIMEOUT_MS = 30_000;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_ATOMIC_PARSLEY_PATH = path.join(PROJECT_ROOT, 'bin', 'AtomicParsley');
const DEFAULT_EXIFTOOL_PATH = path.join(PROJECT_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'exiftool.exe' : 'exiftool');

const metadataFeatures = {
    atomicParsley: process.env.SVDOWN_METADATA_ATOMIC_PARSLEY !== '0',
    exiftool: process.env.SVDOWN_METADATA_EXIFTOOL !== '0',
    verify: process.env.SVDOWN_METADATA_VERIFY !== '0',
    sensitiveLogs: process.env.SVDOWN_LOG_SENSITIVE === '1' || process.env.NODE_ENV !== 'production',
};

const PROHIBITED_TAGS = new Set([
    'album',
    'album_artist',
    'artist',
    'author',
    'camera_model_name',
    'comment',
    'composer',
    'creation_time',
    'date',
    'description',
    'encoded_by',
    'encoder',
    'encoder-settings',
    'genre',
    'location',
    'producer',
    'publisher',
    'software',
    'synopsis',
    'title',
    'track',
    'year',
]);

const ffprobePath = ffprobeStatic?.path ?? 'ffprobe';
const missingOptionalTools = new Set<string>();
type OptionalToolName = 'AtomicParsley' | 'exiftool';
const optionalToolCache = new Map<OptionalToolName, string | null>();

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

// Helper function to run ffmpeg
async function cleanupMetadata(inputPath: string, outputPath: string): Promise<void> {
    if (!ffmpegPath) {
        throw new Error('ffmpeg binary not found');
    }
    const ffmpeg = spawn(ffmpegPath, [
        '-i', inputPath,
        '-map', '0',
        '-map', '-0:v:m:attached_pic=1',
        '-map_chapters', '-1',
        '-map_metadata', '-1',
        '-map_metadata:s:v', '-1',
        '-map_metadata:s:a', '-1',
        '-map_metadata:s:s', '-1',
        '-metadata', 'creation_time=',
        '-metadata', 'date=',
        '-metadata', 'encoder=',
        '-metadata', 'comment=',
        '-metadata', 'description=',
        '-metadata', 'location=',
        '-movflags', 'use_metadata_tags',
        '-c:v', 'copy',
        '-c:a', 'copy',
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
        '-map_metadata:s:a', '-1',
        '-map_chapters', '-1',
        '-metadata', 'creation_time=',
        '-metadata', 'date=',
        '-metadata', 'encoder=',
        '-metadata', 'title=',
        '-metadata', 'artist=',
        '-metadata', 'album=',
        '-metadata', 'comment=',
        '-metadata', 'genre=',
        '-metadata', 'track=',
        '-metadata', 'album_artist=',
        '-map', '0:a',
        '-vn',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        '-write_id3v1', '0',
        '-id3v2_version', '0',
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

async function finalizeCleanMedia(mediaType: 'video' | 'audio', filePath: string): Promise<void> {
    if (mediaType === 'video') {
        await maybeScrubWithAtomicParsley(filePath);
    }
    await maybeStripWithExiftool(filePath, mediaType);
    const verified = await verifyMetadataCleanliness(filePath, mediaType);
    if (!verified) {
        throw new Error('Metadata verification detected residual tags.');
    }
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

        if (!tempInputPath) {
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

async function maybeScrubWithAtomicParsley(filePath: string): Promise<void> {
    if (!metadataFeatures.atomicParsley) {
        return;
    }
    const ran = await runOptionalTool('AtomicParsley', [filePath, '--metaEnema', '--overWrite'], 'AtomicParsley scrub');
    if (ran) {
        log.info('[metadata] AtomicParsley scrub applied.');
    }
}

async function maybeStripWithExiftool(filePath: string, mediaType: 'video' | 'audio'): Promise<void> {
    if (!metadataFeatures.exiftool) {
        return;
    }
    const ran = await runOptionalTool('exiftool', ['-overwrite_original', '-all=', filePath], `Exiftool strip (${mediaType})`);
    if (ran) {
        log.info('[metadata] Exiftool strip applied.');
    }
}

async function verifyMetadataCleanliness(filePath: string, mediaType: 'video' | 'audio'): Promise<boolean> {
    if (!metadataFeatures.verify) {
        return true;
    }
    const result = await runFfprobeVerification(filePath);
    if (result === null) {
        // ffprobe missing; nothing else we can do here.
        return true;
    }
    if (!result.clean) {
        log.warn(`[metadata] Residual tags found for ${mediaType}: ${result.offending.join(', ')}`);
    }
    return result.clean;
}

async function runFfprobeVerification(filePath: string): Promise<{ clean: boolean; offending: string[] } | null> {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format_tags:stream_tags',
            '-print_format', 'json',
            filePath,
        ]);

        let stdoutBuffer = '';
        let stderrBuffer = '';

        ffprobe.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
            stderrBuffer += data.toString();
        });

        ffprobe.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'ENOENT') {
                if (!missingOptionalTools.has(ffprobePath)) {
                    missingOptionalTools.add(ffprobePath);
                    log.warn('[metadata] ffprobe not available; skipping verification step.');
                }
                resolve(null);
            } else {
                reject(err);
            }
        });

        ffprobe.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ffprobe exited with code ${code}${stderrBuffer ? `: ${stderrBuffer.trim()}` : ''}`));
                return;
            }
            try {
                const parsed = JSON.parse(stdoutBuffer || '{}');
                const offending = collectOffendingTags(parsed);
                resolve({ clean: offending.length === 0, offending });
            } catch (error) {
                reject(new Error(`Failed to parse ffprobe output: ${(error as Error).message}`));
            }
        });
    });
}

function collectOffendingTags(data: { format?: { tags?: Record<string, string> }; streams?: Array<{ tags?: Record<string, string> }> }): string[] {
    const offending: string[] = [];
    if (data.format?.tags) {
        for (const [key, value] of Object.entries(data.format.tags)) {
            if (value && PROHIBITED_TAGS.has(key.toLowerCase())) {
                offending.push(`format.${key}`);
            }
        }
    }
    if (Array.isArray(data.streams)) {
        data.streams.forEach((stream, index) => {
            if (!stream.tags) {
                return;
            }
            for (const [key, value] of Object.entries(stream.tags)) {
                if (value && PROHIBITED_TAGS.has(key.toLowerCase())) {
                    offending.push(`stream[${index}].${key}`);
                }
            }
        });
    }
    return offending;
}

async function runOptionalTool(tool: OptionalToolName, args: string[], label: string): Promise<boolean> {
    const binary = await getOptionalToolPath(tool);
    if (!binary) {
        if (!missingOptionalTools.has(tool)) {
            missingOptionalTools.add(tool);
            log.warn(`[metadata] Optional tool "${tool}" not available; skipping ${label}.`);
        }
        return false;
    }

    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`${label} timed out after ${OPTIONAL_TOOL_TIMEOUT_MS}ms`));
        }, OPTIONAL_TOOL_TIMEOUT_MS);

        let stderrBuffer = '';
        child.stderr.on('data', (data) => {
            stderrBuffer += data.toString();
        });

        child.on('error', (err: NodeJS.ErrnoException) => {
            clearTimeout(timeout);
            if (err.code === 'ENOENT') {
                missingOptionalTools.add(tool);
                log.warn(`[metadata] Optional tool "${tool}" failed to start (${err.message}).`);
                resolve(false);
            } else {
                reject(err);
            }
        });

        child.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve(true);
            } else {
                reject(new Error(`${label} exited with code ${code}${stderrBuffer ? `: ${stderrBuffer.trim()}` : ''}`));
            }
        });
    });
}

async function getOptionalToolPath(tool: OptionalToolName): Promise<string | null> {
    if (optionalToolCache.has(tool)) {
        return optionalToolCache.get(tool) ?? null;
    }

    let resolved: string | null = null;

    if (tool === 'AtomicParsley') {
        const explicit = process.env.SVDOWN_ATOMIC_PARSLEY_PATH;
        if (await fileExists(explicit)) {
            resolved = explicit!;
        } else if (await fileExists(DEFAULT_ATOMIC_PARSLEY_PATH)) {
            resolved = DEFAULT_ATOMIC_PARSLEY_PATH;
        }
    } else if (tool === 'exiftool') {
        const explicit = process.env.SVDOWN_EXIFTOOL_PATH;
        if (await fileExists(explicit)) {
            resolved = explicit!;
        } else {
            try {
                resolved = await resolveExiftoolPath();
            } catch {
                if (await fileExists(DEFAULT_EXIFTOOL_PATH)) {
                    resolved = DEFAULT_EXIFTOOL_PATH;
                }
            }
        }
    }

    optionalToolCache.set(tool, resolved);
    return resolved;
}

async function fileExists(candidate?: string | null): Promise<boolean> {
    if (!candidate) {
        return false;
    }
    try {
        await fs.access(candidate);
        return true;
    } catch {
        return false;
    }
}

function redactForLogs(value?: string): string {
    if (!value) {
        return '';
    }
    if (metadataFeatures.sensitiveLogs) {
        return value;
    }
    const hash = crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
    return `[redacted:${hash}]`;
}
