import axios from 'axios';

interface ShopeePayload {
    shareUrl: string;
    pageProps: any;
    directVideoUrl?: string;
    title?: string;
    thumbnail?: string;
}

export class ShopeeService {
    public isApplicable(url: string): boolean {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        const pathname = parsedUrl.pathname;

        return hostname.endsWith('shp.ee') || pathname.includes('/universal-link');
    }

    public async resolve(url: string): Promise<ShopeePayload> {
        if (!url) {
            throw new Error('Link não informado');
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            throw new Error('Link inválido');
        }

        const hostname = parsedUrl.hostname;
        const pathname = parsedUrl.pathname;

        let universalLink: string;

        if (hostname.endsWith('shp.ee')) {
            universalLink = await this.resolveShopeeUniversalLink(url);
        } else if (pathname.includes('/universal-link')) {
            universalLink = parsedUrl.toString();
        } else {
            throw new Error('Tipo de link não suportado');
        }

        const payload = await this.fetchUniversalLinkPayload(universalLink);

        return {
            universalLink,
            ...payload,
        };
    }

    private async resolveShopeeUniversalLink(shortUrl: string): Promise<string> {
        const resp = await axios.get(shortUrl, {
            maxRedirects: 0,
            validateStatus: status => status === 301 || status === 302,
        });

        const universalLink = resp.headers['location'];
        if (!universalLink) throw new Error('Shopee não retornou Location');

        return universalLink;
    }

    private async fetchUniversalLinkPayload(universalLink: string): Promise<ShopeePayload> {
        if (!universalLink) {
            throw new Error('Link não informado');
        }

        let universalUrl: URL;
        try {
            universalUrl = new URL(universalLink);
        } catch {
            throw new Error('Universal link inválido');
        }

        const redirParam = universalUrl.searchParams.get('redir');
        if (!redirParam) {
            throw new Error('Parâmetro redir ausente no universal link');
        }

        const shareUrl = decodeURIComponent(redirParam);
        const shareResponse = await axios.get(shareUrl);
        const html = shareResponse.data as string;

        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match || match.length < 2) {
            throw new Error('__NEXT_DATA__ não encontrado na página de share');
        }

        const nextData = JSON.parse(match[1]);
        const pageProps = nextData?.props?.pageProps;
        if (!pageProps) {
            throw new Error('pageProps ausente no payload do Next.js');
        }

        const watermarkVideoUrl: string | undefined = pageProps?.mediaInfo?.video?.watermarkVideoUrl;
        const directVideoUrl = watermarkVideoUrl ? this.stripWatermarkSuffix(watermarkVideoUrl) : undefined;

        if (directVideoUrl && pageProps.mediaInfo?.video) {
            pageProps.mediaInfo.video.directVideoUrl = directVideoUrl;
        }

        const title = pageProps?.mediaInfo?.video?.caption;
        const thumbnail = pageProps?.mediaInfo?.video?.coverUrl;

        return {
            shareUrl,
            pageProps,
            directVideoUrl,
            title,
            thumbnail,
        };
    }

    private stripWatermarkSuffix(url: string): string {
        return url.replace(/\.[0-9]+\.[0-9]+(?=\.mp4$)/, '');
    }
}
