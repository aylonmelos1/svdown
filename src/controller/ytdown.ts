import { Request, Response } from 'express';
import log from '../log';
import {
    requestYtdownProxy,
    requestYtdownCooldown,
    requestYtdownTurnstile,
    requestYtdownDarkMode,
} from '../services/ytdownService';

function handleError(res: Response, message: string): Response {
    return res.status(502).json({ error: message });
}

export async function ytdownProxyHandler(req: Request, res: Response): Promise<Response> {
    const targetUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url' });
    }

    try {
        const data = await requestYtdownProxy(targetUrl);
        return res.json(data);
    } catch (error) {
        log.error('ytdownProxyHandler failed', { error });
        return handleError(res, 'Failed to reach YTDown proxy');
    }
}

export async function ytdownCooldownHandler(req: Request, res: Response): Promise<Response> {
    const action = req.body?.action === 'record' ? 'record' : 'check';

    try {
        const data = await requestYtdownCooldown(action);
        return res.json(data);
    } catch (error) {
        log.error('ytdownCooldownHandler failed', { error });
        return handleError(res, 'Failed to reach YTDown cooldown');
    }
}

export async function ytdownTurnstileHandler(req: Request, res: Response): Promise<Response> {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }

    try {
        const data = await requestYtdownTurnstile(token);
        return res.json(data);
    } catch (error) {
        log.error('ytdownTurnstileHandler failed', { error });
        return handleError(res, 'Failed to verify Turnstile with YTDown');
    }
}

export async function ytdownDarkModeHandler(req: Request, res: Response): Promise<Response> {
    const mode = req.body?.mode === '1' ? '1' : '0';

    try {
        const data = await requestYtdownDarkMode(mode);
        if (typeof data === 'string') {
            return res.send(data);
        }
        return res.json(data);
    } catch (error) {
        log.error('ytdownDarkModeHandler failed', { error });
        return handleError(res, 'Failed to proxy dark mode preference');
    }
}
