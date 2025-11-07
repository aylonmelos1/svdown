import { Router } from 'express';
import { resolveLinkResponse } from '../controller/linkResolver';
import { downloadVideoHandler } from '../controller/download';
import { sessionStatsHandler } from '../controller/sessionStats';
import { apiKeyGuard } from '../middleware/apiKey';
import { cookieUploadHandler } from '../controller/cookieUploader';
import { cookieTokenGuard } from '../middleware/cookieTokenGuard';

export function createApiRouter(): Router {
    const router = Router();

    router.post('/resolve', apiKeyGuard, resolveLinkResponse);
    router.get('/download', apiKeyGuard, downloadVideoHandler);
    router.get('/session/stats', apiKeyGuard, sessionStatsHandler);
    router.post('/admin/cookies', cookieTokenGuard, cookieUploadHandler);

    return router;
}
