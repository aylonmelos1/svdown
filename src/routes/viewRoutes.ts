import path from 'path';
import { Router, type Request, type Response } from 'express';
import log from '../log';

export function createViewRouter(viewPath: string): Router {
    const router = Router();

    const sendView = (relativePath: string, description: string) => (_req: Request, res: Response) => {
        log.info(`Rendering view ${description}`);
        res.sendFile(path.join(viewPath, relativePath));
    };

    router.get('/', sendView('index.html', '/'));
    router.get('/en', sendView(path.join('en', 'index.html'), '/en'));
    router.get('/en/how-to', sendView(path.join('en', 'how-to.html'), '/en/how-to'));
    router.get('/como-usar', sendView('como-usar.html', '/como-usar'));
    router.get('/sitemap.xml', sendView('sitemap.xml', '/sitemap.xml'));

    router.get('*', (_req, res) => {
        res.redirect('/');
    });

    return router;
}
