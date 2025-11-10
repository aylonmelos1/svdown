import { Router } from 'express';
import { resolveLinkResponse } from '../controller/linkResolver';
import { downloadVideoHandler } from '../controller/download';
import { sessionStatsHandler } from '../controller/sessionStats';
import { metadataUploadHandler, metadataUploadMiddleware } from '../controller/metadataUpload';
import { apiKeyGuard } from '../middleware/apiKey';
import { getTrendingCategories, getProductsByCategory, getTrendingProducts } from '../services/shopeeAffiliateService'; // Import the new service
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

    // New route for Shopee Affiliate trending categories
    router.get('/shopee-affiliate/trending-categories', apiKeyGuard, async (req, res) => {
        try {
            const categories = await getTrendingCategories();
            res.json(categories);
        } catch (error) {
            console.error('Error in /shopee-affiliate/trending-categories:', error);
            res.status(500).json({ message: 'Failed to fetch trending categories' });
        }
    });

    // New route for Shopee Affiliate products by category
    router.get('/shopee-affiliate/products', apiKeyGuard, async (req, res) => {
        try {
            const categoryId = parseInt(req.query.categoryId as string);
            if (isNaN(categoryId)) {
                return res.status(400).json({ message: 'categoryId is required and must be a number' });
            }
            const products = await getProductsByCategory(categoryId);
            res.json(products);
        } catch (error) {
            console.error('Error in /shopee-affiliate/products:', error);
            res.status(500).json({ message: 'Failed to fetch products by category' });
        }
    });

    router.get('/products/trending', apiKeyGuard, async (req, res) => {
        try {
            const products = await getTrendingProducts();
            res.json(products);
        } catch (error) {
            console.error('Error in /products/trending:', error);
            res.status(500).json({ message: 'Failed to fetch trending products' });
        }
    });

    return router;
}
