import express from 'express';
import request from 'supertest';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { cookieUploadHandler } from '../../controller/cookieUploader';
import { cookieTokenGuard } from '../../middleware/cookieTokenGuard';

const ORIGINAL_ENV = { ...process.env };

function createApp() {
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.post('/api/admin/cookies', cookieTokenGuard, cookieUploadHandler);
    return app;
}

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
});

describe('POST /api/admin/cookies', () => {
    it('retorna 503 quando o token não está configurado', async () => {
        delete process.env.TOKEN_COOKIES;
        const app = createApp();

        await request(app).post('/api/admin/cookies').send({ cookies: 'a=b' }).expect(503);
    });

    it('bloqueia requisições sem token válido', async () => {
        process.env.TOKEN_COOKIES = 'expected-token';
        const app = createApp();

        await request(app).post('/api/admin/cookies').send({ cookies: 'a=b' }).expect(401);
    });

    it('salva o arquivo de cookies quando o token é válido', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cookies-upload-'));
        const targetFile = path.join(tmpDir, 'cookies.txt');
        process.env.TOKEN_COOKIES = 'expected-token';
        process.env.YT_DLP_COOKIES_PATH = targetFile;
        const app = createApp();

        await request(app)
            .post('/api/admin/cookies')
            .set('authorization', 'Bearer expected-token')
            .send({ cookies: '# Netscape HTTP Cookie File' })
            .expect(204);

        const stored = await fs.readFile(targetFile, 'utf-8');
        expect(stored).toContain('Netscape HTTP Cookie File');

        await fs.rm(tmpDir, { recursive: true, force: true });
    });
});
