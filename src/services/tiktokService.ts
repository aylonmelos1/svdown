import axios from 'axios';
import * as cheerio from 'cheerio';

interface TiktokPayload {
    title: string | null;
    thumbnail: string | null;
    downloads: { text: string; url: string | undefined }[];
}

export class TiktokService {
    public isApplicable(url: string): boolean {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname.includes('tiktok.com');
    }

    public async resolve(url: string): Promise<TiktokPayload> {
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

            return {
                title,
                thumbnail,
                downloads,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`TikDownloader request failed: ${message}`);
        }
    }
}
