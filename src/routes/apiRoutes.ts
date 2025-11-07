import { Router } from 'express';
import { resolveLinkResponse } from '../controller/linkResolver';
import { downloadVideoHandler } from '../controller/download';
import { sessionStatsHandler } from '../controller/sessionStats';
import { metadataUploadHandler, metadataUploadMiddleware } from '../controller/metadataUpload';
import { apiKeyGuard } from '../middleware/apiKey';
import {
    ytdownProxyHandler,
    ytdownCooldownHandler,
    ytdownTurnstileHandler,
    ytdownDarkModeHandler,
} from '../controller/ytdown';

export function createApiRouter(): Router {
    const router = Router();

    router.post('/resolve', apiKeyGuard, resolveLinkResponse);
    router.get('/download', apiKeyGuard, downloadVideoHandler);
    router.post('/clean/upload', apiKeyGuard, metadataUploadMiddleware, metadataUploadHandler);
    router.get('/session/stats', apiKeyGuard, sessionStatsHandler);
    router.post('/ytdown/proxy', apiKeyGuard, ytdownProxyHandler);
    router.post('/ytdown/cooldown', apiKeyGuard, ytdownCooldownHandler);
    router.post('/ytdown/turnstile', apiKeyGuard, ytdownTurnstileHandler);
    router.post('/ytdown/darkmode', apiKeyGuard, ytdownDarkModeHandler);
    return router;
}
