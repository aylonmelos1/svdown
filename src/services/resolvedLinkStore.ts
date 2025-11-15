import { createHash } from 'crypto';

export interface StoredLinkData {
    link: string;
    service?: string | null;
    caption?: string | null;
    description?: string | null;
    title?: string | null;
    resolvedAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, StoredLinkData>();

function cleanupExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
        if (entry.resolvedAt + TTL_MS < now) {
            store.delete(key);
        }
    }
}

export function hashLink(link: string): string {
    return createHash('sha256').update(link).digest('hex');
}

export function rememberResolvedLink(hash: string, link: string, payload: Partial<Omit<StoredLinkData, 'link' | 'resolvedAt'>>) {
    if (!hash || !link) {
        return;
    }
    cleanupExpiredEntries();
    const safeCaption = truncateText(payload.caption);
    const safeDescription = truncateText(payload.description);
    const safeTitle = truncateText(payload.title);
    store.set(hash, {
        link,
        service: payload.service ?? null,
        caption: safeCaption,
        description: safeDescription,
        title: safeTitle,
        resolvedAt: Date.now(),
    });
}

export function getResolvedLink(hash: string): StoredLinkData | null {
    if (!hash) {
        return null;
    }
    cleanupExpiredEntries();
    return store.get(hash) ?? null;
}

function truncateText(value?: string | null, limit = 600): string | null {
    if (!value) return null;
    const trimmed = value.toString().trim();
    if (!trimmed) return null;
    if (trimmed.length <= limit) {
        return trimmed;
    }
    return `${trimmed.slice(0, limit)}…`;
}
