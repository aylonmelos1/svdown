import { Router } from 'express';
import { resolveLinkResponse } from '../controller/linkResolver';
import { downloadVideoHandler } from '../controller/download';
import { apiKeyGuard } from '../middleware/apiKey';

export function createApiRouter(): Router {
    const router = Router();

    router.post('/resolve', apiKeyGuard, resolveLinkResponse);
    router.get('/download', apiKeyGuard, downloadVideoHandler);

    return router;
}
