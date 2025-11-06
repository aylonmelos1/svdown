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
