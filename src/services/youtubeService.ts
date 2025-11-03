import axios from 'axios';

interface YoutubePayload {
    title: string;
    thumbnail: string;
    duration: number;
    formats: any[];
}

export class YoutubeService {
    public isApplicable(url: string): boolean {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be');
    }

    public async resolve(url: string): Promise<YoutubePayload> {
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

            return {
                title: data.title,
                thumbnail: data.cover,
                duration: data.duration,
                formats: data.items,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            throw new Error(`YouTube downloader request failed: ${message}`);
        }
    }
}
