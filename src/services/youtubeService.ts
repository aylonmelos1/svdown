import axios from 'axios';
import type { ResolveResult } from './types';
import { fileNameFromUrl, sanitizeBaseName } from './utils';

export class YoutubeService {
    public isApplicable(url: string): boolean {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be');
    }

    public async resolve(url: string): Promise<ResolveResult> {
        try {
            const res = await axios.get(
                'https://api.vidfly.ai/api/media/youtube/download',
                {
                    params: { url },
                    headers: {
                        accept: '*/*',
                        'content-type': 'application/json',
                        'x-app-name': 'vidfly-web',
                        'x-app-version': '1.0.0',
                        Referer: 'https://vidfly.ai/',
                    },
                }
            );

            const data = res.data?.data;
            if (!data || !data.items || !data.title) {
                throw new Error('Invalid or empty response from YouTube downloader API');
            }

            const formats = Array.isArray(data.items) ? data.items : [];
            const videoCandidate = this.pickBestVideo(formats);
            const audioCandidate = this.pickBestAudio(formats);

            return {
                service: 'youtube',
                title: data.title,
                thumbnail: data.cover,
                description: data.description,
                video: videoCandidate
                    ? {
                        url: videoCandidate.url,
                        fallbackUrls: videoCandidate.fallbacks,
                        fileName: this.buildFileName(videoCandidate.url, data.title, 'mp4'),
                        qualityLabel: videoCandidate.qualityLabel,
                    }
                    : undefined,
                audio: audioCandidate
                    ? {
                        url: audioCandidate.url,
                        fallbackUrls: audioCandidate.fallbacks,
                        fileName: this.buildFileName(audioCandidate.url, data.title, 'mp3'),
                        qualityLabel: audioCandidate.qualityLabel,
                    }
                    : undefined,
                extras: {
                    duration: data.duration,
                    rawFormats: formats,
                },
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            throw new Error(`YouTube downloader request failed: ${message}`);
        }
    }

    private pickBestVideo(formats: any[]) {
        const videoFormats = formats
            .filter((format) => {
                const mime: string = format?.mimeType || format?.mime_type || '';
                const rawType: unknown = format?.type;
                const type = typeof rawType === 'string' ? rawType.toLowerCase() : '';
                const hasAudio = format?.hasAudio ?? format?.has_audio ?? type.includes('audio');
                const isVideo = mime.includes('video') || type.includes('video');
                return isVideo && (hasAudio || mime.includes('audio'));
            })
            .map(format => ({
                url: format.url,
                qualityLabel: format.qualityLabel || format.label || format.quality,
                score: this.extractQualityScore(format),
            }))
            .filter(item => Boolean(item.url));

        if (videoFormats.length === 0) return undefined;
        videoFormats.sort((a, b) => (b.score - a.score));
        const [best, ...rest] = videoFormats;
        return {
            url: best.url,
            qualityLabel: best.qualityLabel,
            fallbacks: rest.map(item => item.url),
        };
    }

    private pickBestAudio(formats: any[]) {
        const audioFormats = formats
            .filter((format) => {
                const mime: string = format?.mimeType || format?.mime_type || '';
                const rawType: unknown = format?.type;
                const type = typeof rawType === 'string' ? rawType.toLowerCase() : '';
                return mime.includes('audio') || type.includes('audio');
            })
            .map(format => ({
                url: format.url,
                qualityLabel: format.qualityLabel || format.label || format.quality || 'audio',
                score: this.extractAudioScore(format),
            }))
            .filter(item => Boolean(item.url));

        if (audioFormats.length === 0) return undefined;
        audioFormats.sort((a, b) => b.score - a.score);
        const [best, ...rest] = audioFormats;
        return {
            url: best.url,
            qualityLabel: best.qualityLabel,
            fallbacks: rest.map(item => item.url),
        };
    }

    private extractQualityScore(format: any): number {
        const qualityLabel: string = format?.qualityLabel || format?.quality || format?.label || '';
        const match = qualityLabel.match(/(\d{3,4})p/);
        if (match) return parseInt(match[1], 10);
        const height = format?.height;
        if (typeof height === 'number') return height;
        const bitrate = format?.bitrate || format?.bit_rate;
        if (typeof bitrate === 'number') return bitrate / 1000;
        return 0;
    }

    private extractAudioScore(format: any): number {
        const bitrate = format?.bitrate || format?.bit_rate;
        if (typeof bitrate === 'number') return bitrate;
        const quality = String(format?.qualityLabel || format?.quality || format?.label || '');
        const match = quality.match(/(\d+)\s?kbps/i);
        if (match) return parseInt(match[1], 10) * 1000;
        return 0;
    }

    private buildFileName(url: string, title: string, extension: string) {
        const fallback = `${sanitizeBaseName(title)}.${extension}`;
        return fileNameFromUrl(url, fallback);
    }
}
