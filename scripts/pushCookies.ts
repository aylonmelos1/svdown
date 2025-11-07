import { pushCookies } from './utils/pushCookies';

async function main() {
    const [, , fileArg, urlArg] = process.argv;

    await pushCookies({
        filePath: fileArg,
        url: urlArg,
    });

    // eslint-disable-next-line no-console
    console.log(`Cookies enviados para ${urlArg || process.env.COOKIES_ENDPOINT_URL || 'http://localhost:3000/api/admin/cookies'}`);
}

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao enviar cookies:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
