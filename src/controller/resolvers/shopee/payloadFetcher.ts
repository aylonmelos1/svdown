import axios from 'axios';

export async function fetchUniversalLinkPayload(universalLink: string) {
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
    const directVideoUrl = watermarkVideoUrl ? stripWatermarkSuffix(watermarkVideoUrl) : undefined;

    if (directVideoUrl && pageProps.mediaInfo?.video) {
        pageProps.mediaInfo.video.directVideoUrl = directVideoUrl;
    }

    return {
        shareUrl,
        pageProps,
        directVideoUrl,
    };
}

function stripWatermarkSuffix(url: string) {
    return url.replace(/\.[0-9]+\.[0-9]+(?=\.mp4$)/, '');
}
