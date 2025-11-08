import axios from 'axios';
import { JSDOM } from 'jsdom';
import { ResolveResult, ResolveService, SupportedService } from './types';

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1';

export class MercadoLivreService implements ResolveService {
    isApplicable(url: string): boolean {
        return url.includes('mercadolivre.com');
    }

    async resolve(url: string): Promise<ResolveResult> {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
            },
        });

        const dom = new JSDOM(response.data);
        const preloadedStateScript = dom.window.document.querySelector('#__PRELOADED_STATE__');
        if (!preloadedStateScript) {
            throw new Error('Could not find preloaded state script');
        }

        const preloadedState = JSON.parse(preloadedStateScript.textContent || '{}');
        const videoUrl = preloadedState.pageState.initialData.initialState.shortContent[0].videoUrl;

        return {
            service: 'mercadolivre' as SupportedService,
            video: {
                url: videoUrl,
            },
        };
    }
}
