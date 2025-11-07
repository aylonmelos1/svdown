import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { findYtDlpBinary } from '../src/lib/ytDlp';
import { pushCookies } from './utils/pushCookies';

const DEFAULT_BROWSER = process.env.COOKIES_BROWSER || 'chrome';

function resolveOutputPath(arg?: string) {
    if (arg) return path.resolve(arg);
    return path.join(process.cwd(), 'data', 'youtube-cookies.txt');
}

async function runYtDlpCookies(binary: string, browser: string, targetFile: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const ytProcess = spawn(binary, ['--cookies-from-browser', browser, targetFile], {
            stdio: 'inherit',
        });

        ytProcess.on('error', reject);
        ytProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`yt-dlp saiu com código ${code}`));
            }
        });
    });
}

async function main() {
    const [, , browserArg, outputArg, urlArg] = process.argv;
    const browser = browserArg || DEFAULT_BROWSER;
    const outputPath = resolveOutputPath(outputArg);
    const tmpPath = `${outputPath}.tmp`;

    const binary = await findYtDlpBinary();
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await runYtDlpCookies(binary, browser, tmpPath);
    await fs.rename(tmpPath, outputPath);

    await pushCookies({
        filePath: outputPath,
        url: urlArg,
    });

    // eslint-disable-next-line no-console
    console.log(`Cookies gerados com o browser "${browser}" e enviados para o servidor.`);
}

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao gerar/enviar cookies:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
