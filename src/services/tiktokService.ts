import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ResolveResult } from './types';
import { fileNameFromUrl, sanitizeBaseName } from './utils';

export class TiktokService {
    public isApplicable(url: string): boolean {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname.includes('tiktok.com');
    }

    public async resolve(url: string): Promise<ResolveResult> {
        const endpoint = 'https://tikdownloader.io/api/ajaxSearch';

        try {
            const res = await axios.post(
                endpoint,
                new URLSearchParams({
                    q: url,
                    lang: 'en',
                }),
                {
                    headers: {
                        accept: '*/*',
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'x-requested-with': 'XMLHttpRequest',
                        Referer: 'https://tikdownloader.io/en',
                    },
                }
            );

            const html = res.data.data;
            const $ = cheerio.load(html);

            const thumbnail = $('.thumbnail img').attr('src') || null;
            const title = $('.thumbnail h3').text().trim() || null;

            const downloads: { text: string; url: string | undefined }[] = [];
            $('.dl-action a').each((i, el) => {
                downloads.push({
                    text: $(el).text().trim(),
                    url: $(el).attr('href'),
                });
            });

            const candidates = downloads
                .filter(item => Boolean(item.url))
                .map(item => ({
                    ...item,
                    url: item.url!,
                    score: this.scoreDownload(item),
                }))
                .sort((a, b) => b.score - a.score);

            const primary = candidates[0];
            const fallbacks = candidates.slice(1).map(item => item.url);

            return {
                service: 'tiktok',
                title: title || undefined,
                thumbnail: thumbnail || undefined,
                video: primary
                    ? {
                        url: primary.url,
                        fallbackUrls: fallbacks,
                        fileName: fileNameFromUrl(primary.url, `${sanitizeBaseName(title ?? 'tiktok')}.mp4`),
                        qualityLabel: primary.text,
                    }
                    : undefined,
                extras: {
                    rawDownloads: downloads,
                    endpoint,
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`TikDownloader request failed: ${message}`);
        }
    }

    private scoreDownload(item: { text: string; url?: string }) {
        let score = 0;
        if (item.text?.toLowerCase().includes('no watermark')) {
            score += 1000;
        }
        const quality = item.text?.match(/(\d{3,4})p/);
        if (quality) {
            score += parseInt(quality[1], 10);
        }
        if (item.text?.toLowerCase().includes('hd')) {
            score += 50;
        }
        return score;
    }
}
