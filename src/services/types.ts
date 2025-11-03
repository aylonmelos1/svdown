export type SupportedService = 'shopee' | 'pinterest' | 'tiktok' | 'youtube';

export interface MediaSelection {
    url: string;
    fallbackUrls?: string[];
    fileName?: string;
    contentType?: string;
    qualityLabel?: string;
}

export interface ResolveResult {
    service: SupportedService;
    title?: string;
    description?: string;
    thumbnail?: string;
    shareUrl?: string;
    video?: MediaSelection;
    audio?: MediaSelection;
    pageProps?: any;
    extras?: Record<string, unknown>;
}

export interface ResolveService {
    isApplicable(url: string): boolean;
    resolve(url: string): Promise<ResolveResult>;
}
