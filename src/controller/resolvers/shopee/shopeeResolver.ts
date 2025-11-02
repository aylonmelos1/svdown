
import { resolveShopeeUniversalLink } from './linkShort';
import { fetchUniversalLinkPayload } from './payloadFetcher';

export async function resolveShopeeLink(input: string) {
    if (!input) {
        throw new Error('Link não informado');
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(input);
    } catch {
        throw new Error('Link inválido');
    }

    const hostname = parsedUrl.hostname;
    const pathname = parsedUrl.pathname;

    let universalLink: string;

    if (hostname.endsWith('shp.ee')) {
        universalLink = await resolveShopeeUniversalLink(input);
    } else if (pathname.includes('/universal-link')) {
        universalLink = parsedUrl.toString();
    } else {
        throw new Error('Tipo de link não suportado');
    }

    const payload = await fetchUniversalLinkPayload(universalLink);

    return {
        universalLink,
        ...payload,
    };
}
