import 'dotenv/config';
import e from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import log from './log';
import { ensureApiCookie } from './middleware/cookieInitializer';
import { createViewRouter } from './routes/viewRoutes';
import { createApiRouter } from './routes/apiRoutes';
import { initializeAssetVersioning } from './services/versioningService';
import { initializeWebSocket } from './services/websocketService';
import { initializeProductPushScheduler } from './services/productPushScheduler';
import webpush from 'web-push';

// Configure web-push
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const mailto = process.env.VAPID_MAILTO;

if (!vapidPublicKey || !vapidPrivateKey || !mailto) {
    log.error('VAPID keys and mailto must be configured in .env file. Please check VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_MAILTO.');
    // In a real production environment, you might want to exit the process
    // process.exit(1);
} else {
    try {
        webpush.setVapidDetails(mailto, vapidPublicKey, vapidPrivateKey);
        log.info('Web-push configured with VAPID details.');
    } catch (error) {
        log.error('Failed to configure web-push. Check your VAPID keys.', error);
    }
}

const app = e();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewPath = path.resolve(__dirname, 'view');

initializeAssetVersioning(viewPath);

app.use(cookieParser());
app.use(e.json());

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  return ensureApiCookie(req, res, next);
});

app.use(e.static(viewPath));
app.use('/api', createApiRouter());
app.use('/', createViewRouter(viewPath));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  log.info(`Server is running on port ${PORT}`);
});

initializeWebSocket(server);
initializeProductPushScheduler();

export default server;
