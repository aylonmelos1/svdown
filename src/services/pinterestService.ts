import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import type { ResolveResult } from './types';
import { fileNameFromUrl, sanitizeBaseName } from './utils';

export class PinterestService {
    private readonly shortDomains = new Set(['pin.it', 'www.pin.it']);

    public isApplicable(url: string): boolean {
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname.toLowerCase();
            return this.isPinterestHostname(hostname);
        } catch {
            return false;
        }
    }

    public async resolve(url: string): Promise<ResolveResult> {
        const pinterestUrl = await this.normalizePinterestUrl(url);
        const encodedUrl = encodeURIComponent(pinterestUrl);
        const fullUrl = `https://www.savepin.app/download.php?url=${encodedUrl}&lang=en&type=redirect`;

        try {
            const response = await axios.get(fullUrl, {
                headers: {
                    accept:
                        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'accept-language': 'en-US,en;q=0.9',
                    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    Referer: 'https://www.savepin.app/',
                },
            });

            const $ = cheerio.load(response.data);
            const title = $('h1').first().text().trim();
            const thumbnail = $('.image-container img').attr('src');
            const results: { quality: string; format: string; url: string }[] = [];

            $('tbody tr').each((_, el) => {
                const quality = $(el).find('.video-quality').text().trim();
                const format = $(el).find('td:nth-child(2)').text().trim();
                const href = $(el).find('a').attr('href');
                const directUrl = decodeURIComponent(href?.split('url=')[1] || '');

                if (quality && format && directUrl) {
                    results.push({
                        quality,
                        format,
                        url: directUrl,
                    });
                }
            });

            const ordered = this.sortByQuality(results);
            const primary = ordered[0];
            const fallbacks = ordered.slice(1).map(item => item.url);

            return {
                service: 'pinterest',
                title,
                thumbnail,
                video: primary
                    ? {
                        url: primary.url,
                        fallbackUrls: fallbacks,
                        fileName: fileNameFromUrl(primary.url, `${sanitizeBaseName(title)}.mp4`),
                        qualityLabel: primary.quality || primary.format,
                    }
                    : undefined,
                extras: {
                    rawDownloads: results,
                    source: fullUrl,
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error('Failed to scrape Pinterest media: ' + message);
        }
    }

    private sortByQuality(items: { quality: string; format: string; url: string }[]) {
        const mp4Items = items.filter(item => item.format?.toLowerCase().includes('mp4'));
        const scored = mp4Items.map(item => ({
            ...item,
            score: this.extractResolution(item.quality) ?? 0,
        }));

        return scored
            .sort((a, b) => b.score - a.score)
            .map(({ score, ...rest }) => rest);
    }

    private extractResolution(value?: string): number | undefined {
        if (!value) return undefined;
        const match = value.match(/(\d{3,4})p/i);
        if (match) return parseInt(match[1], 10);
        const digits = value.match(/(\d{3,4})/);
        if (digits) return parseInt(digits[1], 10);
        return undefined;
    }

    private isPinterestHostname(hostname: string): boolean {
        return hostname.includes('pinterest.') || this.shortDomains.has(hostname);
    }

    private async normalizePinterestUrl(url: string): Promise<string> {
        let hostname: string;

        try {
            hostname = new URL(url).hostname.toLowerCase();
        } catch {
            return url;
        }

        if (!this.shortDomains.has(hostname)) {
            return url;
        }

        try {
            const response = await axios.get(url, {
                maxRedirects: 5,
                timeout: 5000,
                responseType: 'text',
            });
            const redirectedUrl = this.extractRedirectTarget(response, url);
            return redirectedUrl || url;
        } catch {
            return url;
        }
    }

    private extractRedirectTarget(response: AxiosResponse, fallback: string): string | undefined {
        const request: any = response.request;
        const responseUrl: string | undefined = request?.res?.responseUrl;
        if (responseUrl) {
            return responseUrl;
        }

        const locationHeader =
            response.headers?.['location'] ||
            response.headers?.['Location'] ||
            (typeof response.headers?.get === 'function' ? response.headers.get('location') : undefined);

        if (locationHeader) {
            try {
                return new URL(locationHeader, fallback).toString();
            } catch {
                return undefined;
            }
        }

        return undefined;
    }
}
