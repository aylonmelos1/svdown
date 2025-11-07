import { Router } from 'express';
import { resolveLinkResponse } from '../controller/linkResolver';
import { downloadVideoHandler } from '../controller/download';
import { sessionStatsHandler } from '../controller/sessionStats';
import { metadataUploadHandler, metadataUploadMiddleware } from '../controller/metadataUpload';
import { apiKeyGuard } from '../middleware/apiKey';

export function createApiRouter(): Router {
    const router = Router();

    router.post('/resolve', apiKeyGuard, resolveLinkResponse);
    router.get('/download', apiKeyGuard, downloadVideoHandler);
    router.post('/clean/upload', apiKeyGuard, metadataUploadMiddleware, metadataUploadHandler);
    router.get('/session/stats', apiKeyGuard, sessionStatsHandler);
    return router;
}
