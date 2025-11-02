import axios from 'axios';

export async function resolveShopeeUniversalLink(shortUrl: string) {
    const resp = await axios.get(shortUrl, {
        maxRedirects: 0,
        validateStatus: status => status === 301 || status === 302,
    });

    const universalLink = resp.headers['location'];
    if (!universalLink) throw new Error('Shopee não retornou Location');

    return universalLink;
}
