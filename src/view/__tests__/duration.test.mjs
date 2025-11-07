import { beforeAll, describe, expect, it } from '@jest/globals';

let extractMediaDurationSeconds;

beforeAll(async () => {
    ({ extractMediaDurationSeconds } = await import('../../view/duration.mjs'));
});

describe('duration helpers', () => {
    it('normaliza durationMs da Shopee para segundos', () => {
        const data = {
            service: 'shopee',
            pageProps: {
                mediaInfo: {
                    video: {
                        duration: 15000,
                        durationMs: 15000,
                    },
                },
            },
        };
        expect(extractMediaDurationSeconds(data, 'video')).toBe(15);
    });

    it('prioriza lengthSeconds quando disponível', () => {
        const data = {
            service: 'shopee',
            pageProps: {
                mediaInfo: {
                    video: {
                        lengthSeconds: 42,
                        duration: 42000,
                    },
                },
            },
        };
        expect(extractMediaDurationSeconds(data, 'video')).toBe(42);
    });

    it('usa extras.duration (YouTube) já em segundos', () => {
        const data = {
            service: 'youtube',
            extras: {
                duration: 3661,
            },
        };
        expect(extractMediaDurationSeconds(data, 'video')).toBe(3661);
    });

    it('interpreta strings ISO 8601', () => {
        const data = {
            service: 'meta',
            duration: 'PT1H5S',
        };
        expect(extractMediaDurationSeconds(data, 'video')).toBe(3605);
    });

    it('retorna null quando não há candidatos válidos', () => {
        const data = {
            service: 'tiktok',
        };
        expect(extractMediaDurationSeconds(data, 'video')).toBeNull();
    });
});
