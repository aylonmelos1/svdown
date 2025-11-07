import axios, { AxiosInstance } from 'axios';
import log from '../log';

const DEFAULT_BASE_URL = 'https://ytdown.to';
const DEFAULT_TIMEOUT = 15000;

export interface YtdownProxyResponse {
    api?: {
        status?: string;
        service?: string;
        percent?: string;
        estimatedFileSize?: string;
        fileUrl?: string;
        fileName?: string;
        mediaItems?: Array<Record<string, unknown>>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface YtdownCooldownResponse {
    can_download?: boolean;
    remaining_time?: number;
    download_count?: number;
    success?: boolean;
    timestamp?: number;
}

export interface YtdownVerifyResponse {
    success?: boolean;
    message?: string;
}

function createClient(): AxiosInstance {
    const baseURL = process.env.YTDOWN_BASE_URL || DEFAULT_BASE_URL;
    const timeout =
        process.env.YTDOWN_TIMEOUT_MS && Number.isFinite(Number(process.env.YTDOWN_TIMEOUT_MS))
            ? Number(process.env.YTDOWN_TIMEOUT_MS)
            : DEFAULT_TIMEOUT;

    return axios.create({
        baseURL,
        timeout,
        headers: {
            'User-Agent': 'SVDown/1.0 (+https://svdown.com)',
        },
    });
}

const client = createClient();

async function postForm<T>(path: string, payload: Record<string, string | number | boolean>): Promise<T> {
    const form = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        form.append(key, String(value));
    });

    try {
        const response = await client.post<T>(path, form.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return response.data;
    } catch (error) {
        log.error('Ytdown request failed', { path, error });
        throw error;
    }
}

export function requestYtdownProxy(targetUrl: string): Promise<YtdownProxyResponse> {
    return postForm('/proxy.php', { url: targetUrl });
}

export function requestYtdownCooldown(action: 'check' | 'record'): Promise<YtdownCooldownResponse> {
    return postForm('/cooldown.php', { action });
}

export function requestYtdownTurnstile(token: string): Promise<YtdownVerifyResponse> {
    return postForm('/verify-turnstile.php', { 'cf-turnstile-response': token });
}

export function requestYtdownDarkMode(mode: '0' | '1'): Promise<string | Record<string, unknown>> {
    return postForm('/darkmode.php', { darkMode: mode });
}
