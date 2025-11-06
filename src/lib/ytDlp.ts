import path from 'path';
import { promises as fs, constants as fsConstants } from 'fs';

const EXECUTABLE_CANDIDATES = [
    process.env.YT_DLP_BINARY,
    process.env.YT_DLP_PATH,
    process.env.YTDLP_PATH,
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    path.join(process.cwd(), 'bin', 'yt-dlp.exe'),
    'yt-dlp',
];

const COOKIE_PATH_ENV_VARS = [
    'YT_DLP_COOKIES_PATH',
    'YT_DLP_COOKIES_FILE',
    'YTDLP_COOKIES_PATH',
];

export async function findYtDlpBinary(): Promise<string> {
    for (const candidate of EXECUTABLE_CANDIDATES) {
        if (!candidate) continue;

        // If the candidate looks like a relative name (no path separators),
        // assume it's available via PATH and return immediately.
        if (!candidate.includes('/') && !candidate.includes('\\')) {
            return candidate;
        }

        try {
            await fs.access(candidate, fsConstants.X_OK);
            return candidate;
        } catch {
            continue;
        }
    }

    throw new Error('yt-dlp não encontrado. Defina YT_DLP_BINARY ou adicione o executável em ./bin/yt-dlp.');
}

export async function buildYtDlpCookieArgs(): Promise<string[]> {
    const cookiePath = COOKIE_PATH_ENV_VARS.map(name => process.env[name]).find(Boolean);
    if (!cookiePath) {
        return [];
    }

    try {
        await fs.access(cookiePath, fsConstants.R_OK);
    } catch {
        throw new Error(`Arquivo de cookies do yt-dlp não pode ser lido: ${cookiePath}`);
    }

    return ['--cookies', cookiePath];
}
