export function fileNameFromUrl(url: string, fallback: string): string {
    try {
        const pathname = new URL(url).pathname;
        const candidate = pathname.split('/').filter(Boolean).pop();
        return candidate || fallback;
    } catch {
        return fallback;
    }
}

export function sanitizeBaseName(name?: string | null, fallback = 'video'): string {
    if (!name) return fallback;
    const sanitized = name
        .trim()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    return sanitized || fallback;
}

export function extractUrl(text: string): string | null {
    if (!text) {
        return null;
    }
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const foundUrls = text.match(urlRegex);

    if (foundUrls) {
        // Return the first URL found
        return foundUrls[0];
    }

    return null;
}
