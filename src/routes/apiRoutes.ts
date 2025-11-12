import { Router, Request, Response } from 'express';
import { resolveLinkResponse } from '../controller/linkResolver';
import { downloadVideoHandler } from '../controller/download';
import { sessionStatsHandler } from '../controller/sessionStats';
import { metadataUploadHandler, metadataUploadMiddleware } from '../controller/metadataUpload';
import { apiKeyGuard } from '../middleware/apiKey';
import { getTrendingCategories, getProductsByCategory, getTrendingProducts } from '../services/shopeeAffiliateService'; // Import the new service
import { saveSubscription, PushSubscription, trackNotificationClick, sendNotification } from '../services/notificationService';
import log from '../log';
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

    router.get('/vapid-public-key', (req, res) => {
        const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
            log.error('VAPID_PUBLIC_KEY is not configured on the server.');
            return res.status(500).send('VAPID public key not configured.');
        }
        res.send(vapidPublicKey);
    });

    router.post('/subscribe', apiKeyGuard, async (req, res) => {
        try {
            const subscription = req.body;
            // Assuming session middleware adds userId to req.session
            const userIdentifier = req.session?.userId || null; 

            if (!subscription || !subscription.endpoint || !subscription.keys) {
                return res.status(400).json({ message: 'Invalid subscription object' });
            }

            const subscriptionId = await saveSubscription(subscription, userIdentifier);
            res.status(201).json({ message: 'Subscription saved successfully', subscriptionId });
        } catch (error) {
            log.error('Error saving push subscription:', error);
            res.status(500).json({ message: 'Failed to save subscription' });
        }
    });

    router.post('/notification-click/:logId', async (req, res) => {
        try {
            const logId = parseInt(req.params.logId, 10);
            if (isNaN(logId)) {
                return res.status(400).json({ message: 'Invalid log ID' });
            }

            await trackNotificationClick(logId);
            res.status(200).json({ message: 'Click tracked successfully' });
        } catch (error) {
            log.error('Error tracking notification click:', error);
            res.status(500).json({ message: 'Failed to track click' });
        }
    });

    router.post('/send-notification', apiKeyGuard, async (req, res) => {
        try {
            const payload = req.body;
            if (!payload || typeof payload !== 'object') {
                return res.status(400).json({ message: 'Invalid notification payload' });
            }

            await sendNotification(payload);
            res.status(200).json({ message: 'Notifications sent successfully' });
        } catch (error) {
            log.error('Error sending notifications:', error);
            res.status(500).json({ message: 'Failed to send notifications' });
        }
    });

    return router;
}
