import type { Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import log from '../log';

const DEFAULT_COOKIE_FILE = path.join(process.cwd(), 'data', 'youtube-cookies.txt');

function resolveCookieFilePath(): string {
    return process.env.YT_DLP_COOKIES_PATH || process.env.YT_DLP_COOKIES_FILE || process.env.YTDLP_COOKIES_PATH || DEFAULT_COOKIE_FILE;
}

function extractContent(body: unknown): string | null {
    if (typeof body === 'string') {
        return body;
    }

    if (body && typeof body === 'object') {
        const possible = (body as Record<string, unknown>).cookies ?? (body as Record<string, unknown>).content ?? (body as Record<string, unknown>).data;
        return typeof possible === 'string' ? possible : null;
    }

    return null;
}

export async function cookieUploadHandler(req: Request, res: Response) {
    try {
        const content = extractContent(req.body);

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Conteúdo dos cookies ausente ou vazio.' });
        }

        const targetPath = resolveCookieFilePath();
        const dir = path.dirname(targetPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(targetPath, content, 'utf-8');

        log.info(`Arquivo de cookies atualizado: ${targetPath}`);

        return res.status(204).send();
    } catch (error) {
        log.error('Falha ao salvar arquivo de cookies', error);
        return res.status(500).json({ error: 'Falha ao salvar arquivo de cookies.' });
    }
}
