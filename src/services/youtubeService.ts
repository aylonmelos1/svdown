import axios from 'axios';
import type { ResolveResult } from './types';
import { fileNameFromUrl, sanitizeBaseName } from './utils';
import { ServiceAvailabilityError } from './errors';

const DEFAULT_PIPED_INSTANCES = [
    'https://piped.video',
    'https://piped.mha.fi',
    'https://piped.lunar.icu',
    'https://piped.projectsegfau.lt',
    'https://piped.mint.lgbt',
    'https://piped.syncpundit.com',
    'https://piped.smnz.de',
    'https://piped.in.projectsegfau.lt',
];

const DEFAULT_INVIDIOUS_INSTANCES = [
    'https://yt.artemislena.eu',
    'https://iv.ggtyler.dev',
    'https://inv.nadeko.net',
    'https://yewtu.be',
    'https://inv.tux.pizza',
    'https://iv.nboeck.de',
    'https://invidious.private.coffee',
    'https://invidious.lunar.icu',
];

const PROVIDER_TIMEOUT_MS = 8000;
const YOUTUBE_WATCH_BASE = 'https://www.youtube.com/watch?v=';
const REQUEST_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

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

type PipedStream = {
    url?: string;
    format?: string;
    codec?: string;
    mimeType?: string;
    quality?: string;
    qualityLabel?: string;
    bitrate?: number;
    contentLength?: number | string;
    fps?: number;
    width?: number;
    height?: number;
    itag?: number;
    audioTrackName?: string;
    audioTrackId?: string;
    videoOnly?: boolean;
};

type PipedResponse = {
    title?: string;
    description?: string;
    uploader?: string;
    uploaderUrl?: string;
    thumbnailUrl?: string;
    duration?: number | string;
    url?: string;
    videoStreams?: PipedStream[];
    audioStreams?: PipedStream[];
    hls?: string;
    dash?: string;
    livestream?: boolean;
    error?: string;
};

type InvidiousStream = {
    url?: string;
    itag?: number;
    type?: string;
    container?: string;
    quality?: string;
    qualityLabel?: string;
    size?: string;
    bitrate?: string | number;
    fps?: number;
    width?: number;
    height?: number;
};

type InvidiousResponse = {
    title?: string;
    description?: string;
    author?: string;
    authorId?: string;
    authorUrl?: string;
    lengthSeconds?: number | string;
    videoStreams?: InvidiousStream[];
    formatStreams?: InvidiousStream[];
    adaptiveFormats?: InvidiousStream[];
    videoThumbnails?: Array<{ url?: string; width?: number; height?: number }>;
    hlsUrl?: string;
    dashUrl?: string;
    liveNow?: boolean;
    error?: string;
};

class YoutubeService {
    private readonly pipedInstances: string[];
    private readonly invidiousInstances: string[];

    constructor() {
        this.pipedInstances = this.parseInstanceList(process.env.PIPED_INSTANCES, DEFAULT_PIPED_INSTANCES);
        this.invidiousInstances = this.parseInstanceList(process.env.INVIDIOUS_INSTANCES, DEFAULT_INVIDIOUS_INSTANCES);
    }

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
            if (err instanceof ServiceAvailabilityError) {
                throw err;
            }
            const message = err instanceof Error ? err.message : 'Unknown error';
            throw new Error(`YouTube downloader request failed: ${message}`);
        }
    }

    private async fetchVideoInfo(url: string): Promise<YtDlpInfo> {
        const videoId = this.extractVideoId(url);
        if (!videoId) {
            throw new Error('Não foi possível identificar o vídeo do YouTube.');
        }

        const providerAttempts: Array<() => Promise<YtDlpInfo>> = [
            () => this.fetchViaPiped(videoId),
            () => this.fetchViaInvidious(videoId),
        ];

        const errors: string[] = [];

        for (const attempt of providerAttempts) {
            try {
                const info = await attempt();
                if (info?.formats?.length) {
                    return info;
                }
            } catch (error) {
                errors.push(error instanceof Error ? error.message : String(error));
            }
        }

        const reason = errors.length ? errors.join(' | ') : 'Nenhum provedor disponível.';
        throw new ServiceAvailabilityError(
            'youtube',
            'YouTube está temporariamente indisponível. Estamos buscando novos provedores, tente de novo em alguns minutos.',
            reason,
            503,
        );
    }

    private parseInstanceList(value: string | undefined, defaults: string[]): string[] {
        const entries = (value ?? '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        const selected = entries.length > 0 ? entries : defaults;
        return selected
            .map(item => this.normalizeBaseUrl(item))
            .filter((item): item is string => Boolean(item));
    }

    private normalizeBaseUrl(value: string): string | null {
        try {
            const url = new URL(value);
            url.pathname = '/';
            url.hash = '';
            url.search = '';
            return url.toString().replace(/\/+$/, '');
        } catch {
            return null;
        }
    }

    private buildProviderUrl(base: string, pathname: string): string {
        const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
        return new URL(normalizedPath, `${base}/`).toString();
    }

    private async fetchViaPiped(videoId: string): Promise<YtDlpInfo> {
        if (this.pipedInstances.length === 0) {
            throw new Error('Nenhuma instância do Piped configurada.');
        }

        const errors: string[] = [];
        for (const base of this.pipedInstances) {
            try {
                const endpoint = this.buildProviderUrl(base, `/api/v1/streams/${encodeURIComponent(videoId)}`);
                const response = await axios.get<PipedResponse>(endpoint, {
                    timeout: PROVIDER_TIMEOUT_MS,
                    headers: {
                        'User-Agent': REQUEST_USER_AGENT,
                        Accept: 'application/json',
                    },
                });
                if (response?.data) {
                    if (response.data.error) {
                        errors.push(`${base}: ${response.data.error}`);
                        continue;
                    }
                    const mapped = this.mapPipedResponse(response.data, videoId);
                    if (mapped.formats?.length) {
                        return mapped;
                    }
                }
                errors.push(`${base}: resposta vazia`);
            } catch (error) {
                errors.push(`${base}: ${this.describeAxiosError(error)}`);
            }
        }

        throw new Error(errors.join(' | '));
    }

    private async fetchViaInvidious(videoId: string): Promise<YtDlpInfo> {
        if (this.invidiousInstances.length === 0) {
            throw new Error('Nenhuma instância do Invidious configurada.');
        }

        const errors: string[] = [];
        for (const base of this.invidiousInstances) {
            try {
                const endpoint = this.buildProviderUrl(base, `/api/v1/videos/${encodeURIComponent(videoId)}`);
                const response = await axios.get<InvidiousResponse>(endpoint, {
                    timeout: PROVIDER_TIMEOUT_MS,
                    headers: {
                        'User-Agent': REQUEST_USER_AGENT,
                        Accept: 'application/json',
                    },
                });
                if (response?.data) {
                    if (response.data.error) {
                        errors.push(`${base}: ${response.data.error}`);
                        continue;
                    }
                    const mapped = this.mapInvidiousResponse(response.data, videoId);
                    if (mapped.formats?.length) {
                        return mapped;
                    }
                }
                errors.push(`${base}: resposta vazia`);
            } catch (error) {
                errors.push(`${base}: ${this.describeAxiosError(error)}`);
            }
        }

        throw new Error(errors.join(' | '));
    }

    private mapPipedResponse(payload: PipedResponse, videoId: string): YtDlpInfo {
        const videoStreams = Array.isArray(payload?.videoStreams) ? payload.videoStreams : [];
        const audioStreams = Array.isArray(payload?.audioStreams) ? payload.audioStreams : [];
        const formats: YtDlpFormat[] = [
            ...this.convertPipedVideoStreams(videoStreams),
            ...this.convertPipedAudioStreams(audioStreams),
            ...this.convertPipedAdaptiveStreams(payload),
        ];

        const uploaderUrl = payload?.uploaderUrl
            ? new URL(payload.uploaderUrl, 'https://www.youtube.com').toString()
            : undefined;

        return {
            title: payload?.title,
            description: payload?.description,
            duration: this.parseNumber(payload?.duration),
            webpage_url: payload?.url || `${YOUTUBE_WATCH_BASE}${videoId}`,
            display_id: videoId,
            id: videoId,
            channel: payload?.uploader,
            channel_id: this.extractChannelIdFromUrl(uploaderUrl),
            uploader: payload?.uploader,
            uploader_id: uploaderUrl ? this.extractChannelIdFromUrl(uploaderUrl) ?? uploaderUrl : undefined,
            uploader_url: uploaderUrl,
            thumbnails: payload?.thumbnailUrl ? [{ url: payload.thumbnailUrl }] : undefined,
            thumbnail: payload?.thumbnailUrl,
            formats,
        };
    }

    private mapInvidiousResponse(payload: InvidiousResponse, videoId: string): YtDlpInfo {
        const adaptiveFormats = Array.isArray(payload?.adaptiveFormats) ? payload.adaptiveFormats : [];
        const progressiveStreams = Array.isArray(payload?.formatStreams) ? payload.formatStreams : payload?.videoStreams ?? [];
        const audioFormats = adaptiveFormats.filter(stream => {
            const mime = (stream?.type ?? '').toLowerCase();
            return mime.startsWith('audio/');
        });

        const formats: YtDlpFormat[] = [
            ...this.convertInvidiousVideoStreams(progressiveStreams),
            ...this.convertInvidiousAudioStreams(audioFormats),
            ...this.convertInvidiousAdaptiveStreams(payload),
        ];

        const thumbnails = Array.isArray(payload?.videoThumbnails)
            ? payload.videoThumbnails
                .filter(item => typeof item?.url === 'string')
                .map(item => ({ url: item.url, width: item.width, height: item.height }))
            : undefined;

        const authorUrl = payload?.authorUrl
            ? new URL(payload.authorUrl, 'https://www.youtube.com').toString()
            : undefined;

        return {
            title: payload?.title,
            description: payload?.description,
            duration: this.parseNumber(payload?.lengthSeconds),
            webpage_url: `${YOUTUBE_WATCH_BASE}${videoId}`,
            display_id: videoId,
            id: videoId,
            channel: payload?.author,
            channel_id: payload?.authorId ?? this.extractChannelIdFromUrl(authorUrl),
            uploader: payload?.author,
            uploader_id: payload?.authorId ?? this.extractChannelIdFromUrl(authorUrl) ?? undefined,
            uploader_url: authorUrl,
            thumbnails,
            thumbnail: thumbnails && thumbnails.length > 0 ? thumbnails[0].url : undefined,
            formats,
        };
    }

    private convertPipedVideoStreams(streams: PipedStream[]): YtDlpFormat[] {
        return streams
            .filter(stream => Boolean(stream?.url))
            .map((stream, index) => {
                const mime = stream?.mimeType;
                const ext = this.inferExtension(mime, stream?.format);
                const bitrate = typeof stream?.bitrate === 'number' ? stream?.bitrate : undefined;
                const hasAudio = !stream?.videoOnly;
                return {
                    format_id: stream?.itag ? String(stream.itag) : `piped-video-${index}`,
                    format_note: stream?.qualityLabel || stream?.quality || undefined,
                    ext,
                    url: stream?.url,
                    vcodec: stream?.codec || 'unknown',
                    acodec: hasAudio ? 'unknown' : 'none',
                    height: stream?.height,
                    width: stream?.width,
                    fps: stream?.fps,
                    tbr: typeof bitrate === 'number' ? bitrate / 1000 : undefined,
                    mime_type: mime,
                    filesize: this.parseContentLength(stream?.contentLength),
                    audio_ext: ext,
                    video_ext: ext,
                };
            });
    }

    private convertPipedAudioStreams(streams: PipedStream[]): YtDlpFormat[] {
        return streams
            .filter(stream => Boolean(stream?.url))
            .map((stream, index) => {
                const mime = stream?.mimeType;
                const ext = this.inferExtension(mime, stream?.format);
                const bitrate = typeof stream?.bitrate === 'number' ? stream?.bitrate : undefined;
                const abr = typeof bitrate === 'number' ? Math.round(bitrate / 1000) : undefined;
                return {
                    format_id: stream?.itag ? `piped-audio-${stream.itag}` : `piped-audio-${index}`,
                    format_note: stream?.qualityLabel || stream?.quality || undefined,
                    ext,
                    url: stream?.url,
                    vcodec: 'none',
                    acodec: stream?.codec || 'unknown',
                    abr,
                    tbr: abr,
                    mime_type: mime,
                    filesize: this.parseContentLength(stream?.contentLength),
                    audio_ext: ext,
                };
            });
    }

    private convertPipedAdaptiveStreams(payload: PipedResponse): YtDlpFormat[] {
        const formats: YtDlpFormat[] = [];
        if (typeof payload?.hls === 'string' && payload.hls.trim()) {
            formats.push(this.buildAdaptiveFormat('piped-hls', payload.hls, 'HLS (Piped)', 'application/vnd.apple.mpegurl'));
        }
        return formats;
    }

    private convertInvidiousVideoStreams(streams: InvidiousStream[]): YtDlpFormat[] {
        return streams
            .filter(stream => Boolean(stream?.url))
            .map((stream, index) => {
                const mime = this.extractMimeType(stream?.type);
                const ext = this.inferExtension(mime, stream?.container);
                const bitrate = this.parseBitrate(stream?.bitrate);
                const [videoCodec, audioCodec] = this.extractCodecList(stream?.type);
                return {
                    format_id: stream?.itag ? String(stream.itag) : `invidious-video-${index}`,
                    format_note: stream?.qualityLabel || stream?.quality || undefined,
                    ext,
                    url: stream?.url,
                    vcodec: videoCodec || 'unknown',
                    acodec: audioCodec || 'unknown',
                    height: stream?.height,
                    width: stream?.width,
                    fps: stream?.fps,
                    tbr: bitrate,
                    mime_type: mime,
                    filesize: this.parseSizeString(stream?.size),
                    audio_ext: ext,
                    video_ext: ext,
                };
            });
    }

    private convertInvidiousAudioStreams(streams: InvidiousStream[]): YtDlpFormat[] {
        return streams
            .filter(stream => Boolean(stream?.url))
            .map((stream, index) => {
                const mime = this.extractMimeType(stream?.type);
                const ext = this.inferExtension(mime, stream?.container);
                const bitrate = this.parseBitrate(stream?.bitrate);
                const codecs = this.extractCodecList(stream?.type);
                return {
                    format_id: stream?.itag ? `invidious-audio-${stream.itag}` : `invidious-audio-${index}`,
                    format_note: stream?.qualityLabel || stream?.quality || undefined,
                    ext,
                    url: stream?.url,
                    vcodec: 'none',
                    acodec: codecs[0] || mime || 'unknown',
                    abr: bitrate,
                    tbr: bitrate,
                    mime_type: mime,
                    filesize: this.parseSizeString(stream?.size),
                    audio_ext: ext,
                };
            });
    }

    private convertInvidiousAdaptiveStreams(payload: InvidiousResponse): YtDlpFormat[] {
        const formats: YtDlpFormat[] = [];
        if (typeof payload?.hlsUrl === 'string' && payload.hlsUrl.trim()) {
            formats.push(this.buildAdaptiveFormat('invidious-hls', payload.hlsUrl, 'HLS (Invidious)', 'application/vnd.apple.mpegurl'));
        }
        return formats;
    }

    private extractMimeType(typeField?: string): string | undefined {
        if (!typeField) return undefined;
        const [mime] = typeField.split(';');
        return mime?.trim();
    }

    private parseSizeString(value?: string): number | undefined {
        if (!value) return undefined;
        const normalized = value.trim().toUpperCase();
        const match = normalized.match(/([\d.]+)\s*(K|M|G)?I?B/);
        if (!match) return undefined;
        const num = parseFloat(match[1]);
        if (!Number.isFinite(num)) return undefined;
        const unit = match[2] || '';
        const multipliers: Record<string, number> = {
            '': 1,
            K: 1024,
            M: 1024 ** 2,
            G: 1024 ** 3,
        };
        const multiplier = multipliers[unit] ?? 1;
        return Math.round(num * multiplier);
    }

    private parseBitrate(value?: string | number): number | undefined {
        if (typeof value === 'number') {
            return Math.round(value);
        }
        if (typeof value !== 'string') {
            return undefined;
        }
        const match = value.trim().match(/([\d.]+)\s*(KBPS|MBPS|BPS|KB|MB)?/i);
        if (!match) {
            return undefined;
        }
        const num = parseFloat(match[1]);
        const unit = (match[2] || '').toUpperCase();
        if (!Number.isFinite(num)) {
            return undefined;
        }
        if (unit === 'MBPS' || unit === 'MB') {
            return Math.round(num * 1000);
        }
        if (unit === 'KBPS' || unit === 'KB') {
            return Math.round(num);
        }
        if (unit === 'BPS') {
            return Math.round(num / 1000);
        }
        return Math.round(num);
    }

    private parseContentLength(value?: number | string): number | undefined {
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
    }

    private parseNumber(value?: number | string): number | undefined {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : undefined;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
    }

    private inferExtension(mime?: string, fallback?: string): string | undefined {
        const source = (mime || fallback || '').toLowerCase();
        if (!source) return undefined;
        if (source.includes('m4a')) return 'm4a';
        if (source.includes('mp4')) return 'mp4';
        if (source.includes('webm')) return 'webm';
        if (source.includes('m3u8') || source.includes('mpegurl')) return 'm3u8';
        if (source.includes('dash') || source.includes('mpd')) return 'mpd';
        if (source.includes('opus')) return 'opus';
        if (source.includes('3gpp') || source.includes('3gp')) return '3gp';
        if (source.includes('mpeg')) return 'mpg';
        return undefined;
    }

    private extractChannelIdFromUrl(url?: string): string | null {
        if (!url) return null;
        try {
            const parsed = new URL(url);
            const parts = parsed.pathname.split('/').filter(Boolean);
            const channelIndex = parts.indexOf('channel');
            if (channelIndex !== -1 && parts[channelIndex + 1]) {
                return parts[channelIndex + 1];
            }
            return null;
        } catch {
            return null;
        }
    }

    private extractVideoId(rawUrl: string): string | null {
        try {
            const url = new URL(rawUrl);
            if (url.hostname.includes('youtu.be')) {
                const candidate = url.pathname.replace(/^\/+/, '').split('/')[0];
                return this.normalizeVideoId(candidate);
            }

            if (url.searchParams.has('v')) {
                return this.normalizeVideoId(url.searchParams.get('v'));
            }

            const path = url.pathname.replace(/^\/+/, '');
            if (path.startsWith('shorts/')) {
                return this.normalizeVideoId(path.replace('shorts/', '').split('/')[0]);
            }
            if (path.startsWith('embed/')) {
                return this.normalizeVideoId(path.replace('embed/', '').split('/')[0]);
            }
            if (path.startsWith('watch/')) {
                return this.normalizeVideoId(path.replace('watch/', '').split('/')[0]);
            }
            if (path.startsWith('live/')) {
                return this.normalizeVideoId(path.replace('live/', '').split('/')[0]);
            }
            if (path.startsWith('v/')) {
                return this.normalizeVideoId(path.replace('v/', '').split('/')[0]);
            }

            return null;
        } catch {
            return null;
        }
    }

    private normalizeVideoId(candidate: string | null): string | null {
        if (!candidate) return null;
        const cleaned = candidate.trim();
        const match = cleaned.match(/[a-zA-Z0-9_-]{11}/);
        return match ? match[0] : null;
    }

    private describeAxiosError(error: unknown): string {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const statusText = error.response?.statusText;
            if (status) {
                return `HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
            }
            if (error.code) {
                return error.code;
            }
            if (error.message) {
                return error.message;
            }
        }
        return error instanceof Error ? error.message : 'erro desconhecido';
    }

    private extractCodecList(typeField?: string): string[] {
        if (!typeField) return [];
        const match = typeField.match(/codecs="([^"]+)"/i);
        if (!match) return [];
        return match[1]
            .split(',')
            .map(codec => codec.trim())
            .filter(Boolean);
    }

    private buildAdaptiveFormat(formatId: string, url: string, note: string, mimeType: string): YtDlpFormat {
        return {
            format_id: formatId,
            format_note: note,
            ext: this.inferExtension(mimeType, mimeType),
            url,
            vcodec: 'unknown',
            acodec: 'unknown',
            mime_type: mimeType,
        };
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
                const isPreferredContainer =
                    mime.includes('mp4') ||
                    ext === 'mp4' ||
                    ext === 'm4v' ||
                    mime.includes('webm') ||
                    ext === 'webm' ||
                    mime.includes('mpegurl') ||
                    ext === 'm3u8';
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
