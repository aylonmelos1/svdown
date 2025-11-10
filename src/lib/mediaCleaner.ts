import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { exiftoolPath as resolveExiftoolPath } from 'exiftool-vendored/dist/ExiftoolPath';
import log from '../log';

const OPTIONAL_TOOL_TIMEOUT_MS = 30_000;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_ATOMIC_PARSLEY_PATH = path.join(PROJECT_ROOT, 'bin', 'AtomicParsley');
const DEFAULT_EXIFTOOL_PATH = path.join(
    PROJECT_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'exiftool.exe' : 'exiftool'
);

export const metadataFeatures = {
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

async function getVideoInfo(filePath: string): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn(ffprobePath, [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-print_format', 'json',
            filePath
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
                    log.warn('[media] ffprobe not available; cannot determine video dimensions.');
                }
                resolve(null);
            } else {
                // Reject on other errors
                reject(err);
            }
        });

        ffprobe.on('close', (code) => {
            if (code !== 0) {
                log.warn(`ffprobe (video dimensions) exited with code ${code}${stderrBuffer ? `: ${stderrBuffer.trim()}` : ''}`);
                resolve(null); // It's a non-critical failure, resolve with null
                return;
            }
            try {
                const parsed = JSON.parse(stdoutBuffer || '{}');
                const stream = parsed.streams?.[0];
                if (stream && typeof stream.width === 'number' && typeof stream.height === 'number') {
                    resolve({ width: stream.width, height: stream.height });
                } else {
                    log.warn('Could not parse video dimensions from ffprobe output.');
                    resolve(null);
                }
            } catch (error) {
                // It's a non-critical failure, resolve with null
                log.error(`Failed to parse ffprobe output for dimensions: ${(error as Error).message}`);
                resolve(null);
            }
        });
    });
}


export async function cleanupMetadata(inputPath: string, outputPath: string): Promise<void> {
    if (!ffmpegPath) {
        throw new Error('ffmpeg binary not found');
    }

    const videoInfo = await getVideoInfo(inputPath);
    const needsResizing = videoInfo && videoInfo.width < 580;

    const baseArgs = [
        '-i',
        inputPath,
        '-map',
        '0',
        '-map',
        '-0:v:m:attached_pic=1',
        '-map_chapters',
        '-1',
        '-map_metadata',
        '-1',
        '-map_metadata:s:v',
        '-1',
        '-map_metadata:s:a',
        '-1',
        '-map_metadata:s:s',
        '-1',
        '-metadata',
        'creation_time=',
        '-metadata',
        'date=',
        '-metadata',
        'encoder=',
        '-metadata',
        'comment=',
        '-metadata',
        'description=',
        '-metadata',
        'location=',
        '-movflags',
        'use_metadata_tags',
    ];

    const videoArgs = needsResizing
        ? ['-vf', 'scale=720:-2'] // Re-encode with scaling
        : ['-c:v', 'copy'];      // Just copy the video stream

    const finalArgs = [
        ...baseArgs,
        ...videoArgs,
        '-c:a',
        'copy',
        outputPath,
    ];

    if (needsResizing) {
        log.info(`Video width is ${videoInfo.width}px. Resizing to 720px width.`);
    }

    const ffmpeg = spawn(ffmpegPath, finalArgs);

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

export async function convertToMp3(inputPath: string, outputPath: string): Promise<void> {
    if (!ffmpegPath) {
        throw new Error('ffmpeg binary not found');
    }
    const ffmpeg = spawn(ffmpegPath, [
        '-i',
        inputPath,
        '-map_metadata',
        '-1',
        '-map_metadata:s:a',
        '-1',
        '-map_chapters',
        '-1',
        '-metadata',
        'creation_time=',
        '-metadata',
        'date=',
        '-metadata',
        'encoder=',
        '-metadata',
        'title=',
        '-metadata',
        'artist=',
        '-metadata',
        'album=',
        '-metadata',
        'comment=',
        '-metadata',
        'genre=',
        '-metadata',
        'track=',
        '-metadata',
        'album_artist=',
        '-map',
        '0:a',
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        '-write_id3v1',
        '0',
        '-id3v2_version',
        '0',
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

export async function finalizeCleanMedia(mediaType: 'video' | 'audio', filePath: string): Promise<void> {
    if (mediaType === 'video') {
        await maybeScrubWithAtomicParsley(filePath);
    }
    await maybeStripWithExiftool(filePath, mediaType);
    const verified = await verifyMetadataCleanliness(filePath, mediaType);
    if (!verified) {
        throw new Error('Metadata verification detected residual tags.');
    }
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
        return true;
    }
    if (!result.clean) {
        log.warn(`[metadata] Residual tags found for ${mediaType}: ${result.offending.join(', ')}`);
    }
    return result.clean;
}

async function runFfprobeVerification(
    filePath: string
): Promise<{ clean: boolean; offending: string[] } | null> {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn(ffprobePath, ['-v', 'error', '-show_entries', 'format_tags:stream_tags', '-print_format', 'json', filePath]);

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
    const processTags = (tags: Record<string, string>, prefix: string) => {
        for (const [key, value] of Object.entries(tags)) {
            if (!value) continue;

            const lowerKey = key.toLowerCase();

            if (PROHIBITED_TAGS.has(lowerKey)) {
                // Special handling for the 'encoder' tag
                if (lowerKey === 'encoder') {
                    // If the encoder tag is from our own ffmpeg process, ignore it.
                    if (value.includes('Lavc')) {
                        continue;
                    }
                }
                offending.push(`${prefix}.${key}`);
            }
        }
    };

    if (data.format?.tags) {
        processTags(data.format.tags, 'format');
    }
    if (Array.isArray(data.streams)) {
        data.streams.forEach((stream, index) => {
            if (stream.tags) {
                processTags(stream.tags, `stream[${index}]`);
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

export function redactForLogs(value?: string): string {
    if (!value) {
        return '';
    }
    if (metadataFeatures.sensitiveLogs) {
        return value;
    }
    const hash = crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
    return `[redacted:${hash}]`;
}
