import path from 'path';
import { promises as fs } from 'fs';
import axios from 'axios';

type PushCookiesOptions = {
    filePath?: string;
    url?: string;
    token?: string;
};

const DEFAULT_ENDPOINT = 'http://localhost:3000/api/admin/cookies';

function resolveFilePath(fileArg?: string) {
    if (fileArg) return path.resolve(fileArg);
    return path.join(process.cwd(), 'data', 'youtube-cookies.txt');
}

export async function pushCookies(options: PushCookiesOptions = {}): Promise<void> {
    const filePath = resolveFilePath(options.filePath);
    const url = options.url ?? process.env.COOKIES_ENDPOINT_URL ?? DEFAULT_ENDPOINT;
    const token = options.token ?? process.env.TOKEN_COOKIES ?? process.env.COOKIES_PUSH_TOKEN;

    if (!token) {
        throw new Error('Defina TOKEN_COOKIES (ou COOKIES_PUSH_TOKEN) para enviar os cookies.');
    }

    const cookiesContent = await fs.readFile(filePath, 'utf-8');

    await axios.post(
        url,
        { cookies: cookiesContent },
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            timeout: 15000,
        },
    );
}
