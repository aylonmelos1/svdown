import path from 'path';
import fs from 'fs/promises';
import { Router, type Request, type Response } from 'express';
import log from '../log';
import { getVersionedAssetTags } from '../services/versioningService';

export function createViewRouter(viewPath: string): Router {
    const router = Router();

    const sendView = (relativePath: string, description: string) => async (_req: Request, res: Response) => {
        try {
            log.info(`Rendering view ${description}`);
            const filePath = path.join(viewPath, relativePath);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const finalHtml = fileContent.replace('<!-- ASSET_TAGS_PLACEHOLDER -->', getVersionedAssetTags());
            res.send(finalHtml);
        } catch (error) {
            log.error(`Failed to render view ${description}:`, error);
            res.status(500).send('Error loading page.');
        }
    };

    router.get('/', sendView('index.html', '/'));
    router.get('/en', sendView(path.join('en', 'index.html'), '/en'));
    router.get('/en/how-to', sendView(path.join('en', 'how-to.html'), '/en/how-to'));
    router.get('/como-usar', sendView('como-usar.html', '/como-usar'));
    router.get('/remover-metadados', sendView('metadata-cleaner.html', '/remover-metadados'));

    // sitemap.xml is not an HTML file, so it should be sent as is.
    router.get('/sitemap.xml', (_req, res) => {
        log.info('Rendering view /sitemap.xml');
        res.sendFile(path.join(viewPath, 'sitemap.xml'));
    });

    router.get('/*splat', (_req, res) => {
        res.redirect('/');
    });

    return router;
}
