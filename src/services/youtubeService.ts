import { spawn } from 'child_process';
import type { ResolveResult } from './types';
import { fileNameFromUrl, sanitizeBaseName } from './utils';
import { findYtDlpBinary } from '../lib/ytDlp';

type YtDlpFormat = {
    format_id?: string;
    format_note?: string;
    ext?: string;
    url?: string;
    vcodec?: string;
    acodec?: string;
    height?: number;
    width?: number;
    vbr?: number;
    abr?: number;
    tbr?: number;
    fps?: number;
    filesize?: number;
    filesize_approx?: number;
    quality?: number;
    codec?: string;
    format?: string;
    audio_ext?: string;
    video_ext?: string;
    mime_type?: string;
};

type YtDlpThumbnail = {
    url?: string;
    width?: number;
    height?: number;
};

type YtDlpInfo = {
    title?: string;
    description?: string;
    duration?: number;
    webpage_url?: string;
    display_id?: string;
    id?: string;
    channel?: string;
    channel_id?: string;
    uploader?: string;
    uploader_id?: string;
    uploader_url?: string;
    thumbnails?: YtDlpThumbnail[];
    thumbnail?: string;
    formats?: YtDlpFormat[];
};

class YoutubeService {
    public isApplicable(url: string): boolean {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be');
        } catch {
            return false;
        }
    }

    public async resolve(url: string): Promise<ResolveResult> {
        if (!this.isApplicable(url)) {
            throw new Error('Link do YouTube inválido ou não suportado');
        }

        try {
            const info = await this.fetchVideoInfo(url);
            const formats = Array.isArray(info.formats) ? info.formats : [];
            const videoCandidate = this.pickBestVideo(formats);
            const audioCandidate = this.pickBestAudio(formats, videoCandidate?.url ?? null);
            const durationSeconds = this.extractDurationSeconds(info);

            return {
                service: 'youtube',
                title: info.title ?? 'YouTube video',
                description: undefined,
                thumbnail: this.pickBestThumbnail(info),
                shareUrl: info.webpage_url ?? url,
                video: videoCandidate
                    ? {
                        url: videoCandidate.url,
                        fallbackUrls: videoCandidate.fallbacks,
                        fileName: this.buildFileName(videoCandidate.url, info.title ?? 'video', 'mp4'),
                        qualityLabel: videoCandidate.qualityLabel,
                        contentType: videoCandidate.contentType,
                    }
                    : undefined,
                audio: audioCandidate
                    ? {
                        url: audioCandidate.url,
                        fallbackUrls: audioCandidate.fallbacks,
                        fileName: this.buildFileName(audioCandidate.url, info.title ?? 'audio', 'mp3'),
                        qualityLabel: audioCandidate.qualityLabel,
                        contentType: audioCandidate.contentType,
                    }
                    : undefined,
                extras: {
                    duration: durationSeconds,
                    videoId: info.id ?? info.display_id ?? null,
                    channelId: info.channel_id ?? null,
                    author: info.uploader ?? info.channel ?? null,
                    availableFormats: this.summarizeFormats(formats),
                },
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            throw new Error(`YouTube downloader request failed: ${message}`);
        }
    }

    private async fetchVideoInfo(url: string): Promise<YtDlpInfo> {
        const binary = await findYtDlpBinary();
        const args = [
            '--no-playlist',
            '--skip-download',
            '--dump-single-json',
            '--no-warnings',
            '--no-call-home',
            url,
        ];

        const ytProcess = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdoutBuffer = '';
        let stderrBuffer = '';

        ytProcess.stdout.on('data', chunk => {
            stdoutBuffer += chunk.toString();
        });

        ytProcess.stderr.on('data', chunk => {
            stderrBuffer += chunk.toString();
        });

        const exitCode: number = await new Promise((resolve, reject) => {
            ytProcess.on('error', reject);
            ytProcess.on('close', resolve);
        });

        if (exitCode !== 0) {
            const reason = stderrBuffer.trim() || stdoutBuffer.trim();
            throw new Error(`yt-dlp info fetch falhou (code ${exitCode})${reason ? `: ${reason}` : ''}`);
        }

        if (!stdoutBuffer.trim()) {
            throw new Error('yt-dlp não retornou informações do vídeo.');
        }

        try {
            return JSON.parse(stdoutBuffer) as YtDlpInfo;
        } catch (error) {
            throw new Error(`Falha ao interpretar a resposta do yt-dlp: ${(error as Error).message}`);
        }
    }

    private pickBestVideo(formats: YtDlpFormat[]) {
        const videoFormats = formats
            .filter((format) => {
                const urlAvailable = Boolean(format.url);
                const hasVideo = format.vcodec && format.vcodec !== 'none';
                const hasAudio = format.acodec && format.acodec !== 'none';
                const ext = (format.ext ?? '').toLowerCase();
                const mime = (format.mime_type ?? '').toLowerCase();
                const progressive = hasVideo && hasAudio;
                const isPreferredContainer = mime.includes('mp4') || ext === 'mp4' || ext === 'm4v';
                return urlAvailable && progressive && isPreferredContainer;
            })
            .map(format => ({
                url: format.url,
                qualityLabel: this.buildQualityLabel(format),
                score: this.extractQualityScore(format),
                contentType: this.resolveContentType(format, 'video/mp4'),
            }))
            .filter(item => Boolean(item.url));

        if (videoFormats.length === 0) return undefined;
        videoFormats.sort((a, b) => (b.score - a.score));
        const [best, ...rest] = videoFormats;
        return {
            url: best.url,
            qualityLabel: best.qualityLabel,
            contentType: best.contentType,
            fallbacks: rest.map(item => item.url).filter(Boolean),
        };
    }

    private pickBestAudio(formats: YtDlpFormat[], ignoreUrl?: string | null) {
        const audioFormats = formats
            .filter((format) => {
                const urlAvailable = Boolean(format.url);
                const isAudioOnly = (!format.vcodec || format.vcodec === 'none') && format.acodec && format.acodec !== 'none';
                const ext = (format.ext ?? '').toLowerCase();
                const mime = (format.mime_type ?? '').toLowerCase();
                const preferredContainer = ext === 'm4a' || mime.includes('audio/mp4');
                return urlAvailable && isAudioOnly && (preferredContainer || ext === 'mp4' || ext === 'webm' || mime.includes('audio/'));
            })
            .map(format => ({
                url: format.url,
                qualityLabel: this.buildQualityLabel(format, true),
                score: this.extractAudioScore(format),
                contentType: this.resolveContentType(format, 'audio/mp4'),
            }))
            .filter(item => Boolean(item.url) && item.url !== ignoreUrl);

        if (audioFormats.length === 0) return undefined;
        audioFormats.sort((a, b) => b.score - a.score);
        const [best, ...rest] = audioFormats;
        return {
            url: best.url,
            qualityLabel: best.qualityLabel,
            contentType: best.contentType,
            fallbacks: rest.map(item => item.url).filter(Boolean),
        };
    }

    private extractQualityScore(format: YtDlpFormat): number {
        const height = format?.height;
        if (typeof height === 'number' && height > 0) {
            return height;
        }
        const vbr = format?.vbr ?? format?.tbr;
        if (typeof vbr === 'number' && vbr > 0) {
            return vbr;
        }
        const fps = format?.fps;
        if (typeof fps === 'number' && fps > 0) {
            return fps * 10;
        }
        return 0;
    }

    private extractAudioScore(format: YtDlpFormat): number {
        const bitrate = format?.abr ?? format?.tbr;
        if (typeof bitrate === 'number') return bitrate * 1000;
        return 0;
    }

    private buildFileName(url: string, title: string, extension: string) {
        const fallback = `${sanitizeBaseName(title)}.${extension}`;
        return fileNameFromUrl(url, fallback);
    }

    private pickBestThumbnail(info: YtDlpInfo): string | undefined {
        const fromArray = Array.isArray(info?.thumbnails) ? info.thumbnails : [];
        const cleanedArray = fromArray.filter(item => typeof item?.url === 'string');
        if (cleanedArray.length > 0) {
            const sorted = [...cleanedArray].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
            return sorted[0]?.url || sorted[sorted.length - 1]?.url;
        }
        return info.thumbnail;
    }

    private extractDurationSeconds(info: YtDlpInfo): number | null {
        const raw = info.duration;
        if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
            return Math.round(raw);
        }
        return null;
    }

    private resolveContentType(format: YtDlpFormat, fallback: string): string {
        if (format.mime_type) {
            const [type] = format.mime_type.split(';');
            if (type) {
                return type.trim();
            }
        }
        return fallback;
    }

    private summarizeFormats(formats: YtDlpFormat[]) {
        return formats
            .filter(format => Boolean(format.url))
            .map(format => ({
                formatId: format.format_id ?? null,
                ext: format.ext ?? null,
                height: format.height ?? null,
                fps: format.fps ?? null,
                mimeType: format.mime_type ?? null,
                hasAudio: format.acodec ? format.acodec !== 'none' : null,
                hasVideo: format.vcodec ? format.vcodec !== 'none' : null,
                audioCodec: format.acodec ?? null,
                videoCodec: format.vcodec ?? null,
                bitrate: format.tbr ?? null,
            }));
    }

    private buildQualityLabel(format: YtDlpFormat, isAudio = false): string {
        if (isAudio) {
            const abr = format.abr ?? format.tbr;
            if (typeof abr === 'number' && abr > 0) {
                return `${Math.round(abr)}kbps`;
            }
            const ext = format.ext ? format.ext.toUpperCase() : '';
            return ext || 'audio';
        }

        const height = format.height;
        const fps = format.fps;
        if (typeof height === 'number' && height > 0) {
            const base = `${height}p`;
            if (typeof fps === 'number' && fps > 0 && fps !== 30) {
                return `${base}${fps}`;
            }
            return base;
        }
        if (format.format_note) {
            return format.format_note;
        }
        return format.ext ? format.ext.toUpperCase() : 'video';
    }
}

export default YoutubeService;
