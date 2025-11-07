import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { findYtDlpBinary } from '../src/lib/ytDlp';
import { pushCookies } from './utils/pushCookies';

const DEFAULT_BROWSER = process.env.COOKIES_BROWSER || 'chrome';
const DEFAULT_TEST_URL = process.env.COOKIES_TEST_URL || 'https://www.youtube.com/watch?v=BaW_jenozKc';

function resolveOutputPath(arg?: string) {
    if (arg) return path.resolve(arg);
    return path.join(process.cwd(), 'data', 'youtube-cookies.txt');
}

async function runYtDlpCookies(binary: string, browser: string, targetFile: string, testUrl: string): Promise<void> {
    const args = [
        '--cookies-from-browser',
        browser,
        '--cookies',
        targetFile,
        '--skip-download',
        '--dump-json',
        '--no-warnings',
        testUrl,
    ];

    await new Promise<void>((resolve, reject) => {
        const ytProcess = spawn(binary, args, { stdio: 'inherit' });

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
    const testUrl = DEFAULT_TEST_URL;

    const binary = await findYtDlpBinary();
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await runYtDlpCookies(binary, browser, tmpPath, testUrl);
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
