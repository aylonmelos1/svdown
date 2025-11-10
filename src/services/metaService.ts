import log from '../log';
import snapsave from 'metadownloader';
import type { ResolveResult, ResolveService } from './types';
import { fileNameFromUrl, sanitizeBaseName } from './utils';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

type MetaDownloaderItem = {
    url?: string;
    thumbnail?: string;
    quality?: string;
    label?: string;
};

type MetaDownloaderResponse = {
    developer?: string;
    status?: boolean;
    msg?: string;
    data?: MetaDownloaderItem[];
};

type MetaMedia = {
    videoUrl?: string;
    thumbnail?: string;
    qualityLabel?: string;
    fallbackUrls?: string[];
};

type DownloaderFn = (url: string) => Promise<MetaDownloaderResponse>;

const PROVIDER_NAME = 'metadownloader';
const YTDLP_PATH = './bin/yt-dlp'; // Caminho relativo ao root do projeto

export class MetaService implements ResolveService {
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

        const media = await this.fetchMetaDownloads(parsed);
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
                fallbackUrls: media.fallbackUrls,
                fileName,
                qualityLabel: media.qualityLabel ?? 'original',
            },
            extras: {
                source: PROVIDER_NAME,
            },
        };
    }

    private async fetchMetaDownloads(parsedUrl: URL): Promise<MetaMedia> {
        try {
            const downloader = this.pickDownloader(parsedUrl);
            const response = await downloader(parsedUrl.toString());
            // log.debug(`[metadownloader] Raw response: ${JSON.stringify(response)}`); // Removido

            if (!response?.status) {
                const reason = response?.msg || 'Resposta inválida do metadownloader';
                throw new Error(reason);
            }

            const items = this.normalizeDownloaderItems(response?.data ?? []);
            if (items.length === 0) {
                throw new Error('O provedor não retornou URLs de mídia válidos.');
            }

            const [primary, ...rest] = items;
            return {
                videoUrl: primary.url,
                thumbnail: primary.thumbnail,
                qualityLabel: primary.qualityLabel,
                fallbackUrls: rest.map(item => item.url).filter(Boolean),
            };
        } catch (error) {
            // log.warn(`[metadownloader] Falha na requisição ao ${PROVIDER_NAME}, tentando yt-dlp: ${error instanceof Error ? error.message : 'falha desconhecida'}`); // Removido
            return this.fetchWithYtdlp(parsedUrl);
        }
    }

    private async fetchWithYtdlp(parsedUrl: URL): Promise<MetaMedia> {
        try {
            const { stdout } = await execAsync(`${YTDLP_PATH} -j "${parsedUrl.toString()}"`);
            const data = JSON.parse(stdout);

            const videoUrl = data.url || data.webpage_url; // yt-dlp pode retornar 'url' ou 'webpage_url'
            const thumbnail = data.thumbnail;
            const qualityLabel = data.format_note || data.ext;

            if (!videoUrl) {
                throw new Error('yt-dlp não encontrou URL de vídeo.');
            }

            return {
                videoUrl,
                thumbnail,
                qualityLabel,
                fallbackUrls: [], // yt-dlp geralmente retorna a melhor qualidade diretamente
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'falha desconhecida';
            throw new Error(`Falha na requisição ao yt-dlp: ${message}`);
        }
    }

    private pickDownloader(parsedUrl: URL): DownloaderFn {
        const host = parsedUrl.hostname.toLowerCase();
        const snapsaveAny = snapsave as unknown as Record<string, DownloaderFn>;

        if (host.includes('facebook') || host.includes('fb.watch')) {
            const facebookFn = snapsaveAny?.facebook;
            if (typeof facebookFn === 'function') {
                return facebookFn;
            }
        }

        return snapsave as unknown as DownloaderFn;
    }

    private normalizeDownloaderItems(items: MetaDownloaderItem[]) {
        return items
            .filter(item => typeof item?.url === 'string' && item.url.trim().length > 0)
            .map(item => ({
                url: item.url!.trim(),
                thumbnail: item.thumbnail,
                qualityLabel: item.label ?? item.quality ?? undefined,
            }));
    }

    private buildTitle(url: URL): string {
        const host = url.hostname.toLowerCase();
        if (host.includes('instagram')) return 'Vídeo do Instagram';
        if (host.includes('facebook') || host.includes('fb.watch')) return 'Vídeo do Facebook';
        return 'Vídeo Meta';
    }
}
