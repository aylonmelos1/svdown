import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

const ORIGINAL_ENV = { ...process.env };

async function importModule() {
    jest.resetModules();
    return import('../ytDlp');
}

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
});

describe('findYtDlpBinary', () => {
    it('prioriza o valor relativo informado via variável de ambiente', async () => {
        process.env.YT_DLP_BINARY = 'custom-binary';
        const { findYtDlpBinary } = await importModule();

        await expect(findYtDlpBinary()).resolves.toBe('custom-binary');
    });

    it('resolve caminho absoluto e verifica permissão de execução', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-dlp-bin-'));
        const fakeBinaryPath = path.join(tmpDir, 'yt-dlp');
        await fs.writeFile(fakeBinaryPath, '#!/bin/sh\nexit 0\n', { encoding: 'utf-8' });
        await fs.chmod(fakeBinaryPath, 0o755);

        process.env.YT_DLP_BINARY = fakeBinaryPath;
        const { findYtDlpBinary } = await importModule();

        await expect(findYtDlpBinary()).resolves.toBe(fakeBinaryPath);

        await fs.rm(tmpDir, { recursive: true, force: true });
    });
});
