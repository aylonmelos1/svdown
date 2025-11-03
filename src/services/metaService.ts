import axios from 'axios';
import * as cheerio from 'cheerio';
import vm from 'node:vm';
import type { ResolveResult, ResolveService } from './types';
import { fileNameFromUrl, sanitizeBaseName } from './utils';

export class MetaService implements ResolveService {
    private readonly endpoint = 'https://snapsave.app/action.php?lang=id';

    public isApplicable(url: string): boolean {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase();
            return host.includes('instagram.com') || host.includes('facebook.com') || host.includes('fb.watch');
        } catch {
            return false;
        }
    }

    public async resolve(url: string): Promise<ResolveResult> {
        if (!url) {
            throw new Error('Link não informado');
        }

        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error('Link inválido');
        }

        const decodedHtml = await this.fetchSnapSaveHtml(parsed.toString());
        const media = this.extractMedia(decodedHtml);
        if (!media.videoUrl) {
            throw new Error('Não foi possível localizar o arquivo para download');
        }

        const title = this.buildTitle(parsed);
        const fileName = fileNameFromUrl(media.videoUrl, `${sanitizeBaseName(title)}.mp4`);

        return {
            service: 'meta',
            title,
            thumbnail: media.thumbnail,
            video: {
                url: media.videoUrl,
                fileName,
                qualityLabel: media.qualityLabel,
            },
            extras: {
                source: this.endpoint,
            },
        };
    }

    private async fetchSnapSaveHtml(targetUrl: string): Promise<string> {
        try {
            const payload = new URLSearchParams({ url: targetUrl }).toString();
            const response = await axios.post(this.endpoint, payload, {
                headers: {
                    accept:
                        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                    'content-type': 'application/x-www-form-urlencoded',
                    origin: 'https://snapsave.app',
                    referer: 'https://snapsave.app/id',
                    'user-agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36',
                },
                timeout: 15000,
            });

            const scriptPayload = String(response.data ?? '');
            const decoded = this.decodeSnapSaveScript(scriptPayload);
            if (!decoded) {
                throw new Error('Resposta vazia do Snapsave');
            }
            return decoded;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'falha desconhecida';
            throw new Error(`Falha na requisição ao Snapsave: ${message}`);
        }
    }

    private decodeSnapSaveScript(obfuscatedJs: string): string {
        const captured: Record<string, string> = {};
        const elements: Record<string, any> = {};

        const createElement = (id: string) => {
            if (elements[id]) return elements[id];
            let innerHTMLValue = '';
            const element = {
                set innerHTML(value: string) {
                    innerHTMLValue = value;
                    captured[id] = value;
                },
                get innerHTML() {
                    return innerHTMLValue;
                },
                remove() {
                    captured[id] = '';
                },
            };
            elements[id] = element;
            return element;
        };

        const context = {
            window: { location: { hostname: 'snapsave.app' } },
            document: {
                scrollingElement: {},
                documentElement: {},
                getElementById: (id: string) => createElement(id),
                querySelector: () => ({}),
            },
            gtag: () => undefined,
            getPosition: () => ({ y: 0 }),
            animate: () => undefined,
        } as Record<string, any>;

        try {
            vm.createContext(context);
            vm.runInContext(obfuscatedJs, context, { timeout: 5000 });
        } catch (_error) {
            throw new Error('Falha ao decodificar resposta do Snapsave');
        }

        return captured['download-section'] || '';
    }

    private extractMedia(html: string): { videoUrl?: string; thumbnail?: string; qualityLabel?: string } {
        if (!html) return {};
        const $ = cheerio.load(html);

        const selectors = [
            '.download-items__btn a[href]',
            '.download-link a.button[href*="rapidcdn"]',
            'a[href*="rapidcdn"]',
        ];
        let videoAnchor: cheerio.Cheerio<cheerio.Element> | undefined;
        for (const selector of selectors) {
            const candidate = $(selector).filter((_, el) => Boolean($(el).attr('href'))).first();
            if (candidate.length) {
                videoAnchor = candidate;
                break;
            }
        }

        if (!videoAnchor || !videoAnchor.length) {
            return {
                thumbnail: this.extractThumbnail($),
            };
        }

        let qualityLabel = videoAnchor.text().trim();
        const trQuality = videoAnchor.closest('tr').find('.video-quality').first().text().trim();
        if (trQuality) {
            qualityLabel = trQuality;
        }

        return {
            videoUrl: videoAnchor.attr('href') || undefined,
            thumbnail: this.extractThumbnail($),
            qualityLabel: qualityLabel || undefined,
        };
    }

    private extractThumbnail($: cheerio.CheerioAPI): string | undefined {
        const thumbSources = [
            '.download-items__thumb img',
            '.download-link img',
            'img[src*="rapidcdn"]',
        ];
        for (const selector of thumbSources) {
            const src = $(selector).first().attr('src');
            if (src) return src;
        }
        return undefined;
    }

    private buildTitle(url: URL): string {
        const host = url.hostname.toLowerCase();
        if (host.includes('instagram')) return 'Vídeo do Instagram';
        if (host.includes('facebook') || host.includes('fb.watch')) return 'Vídeo do Facebook';
        return 'Vídeo Meta';
    }
}
