import e from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import log from './log';
import { ensureApiCookie } from './middleware/cookieInitializer';
import { createViewRouter } from './routes/viewRoutes';
import { createApiRouter } from './routes/apiRoutes';
import { initializeAssetVersioning } from './services/versioningService';

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
app.listen(PORT, () => {
  log.info(`Server is running on port ${PORT}`);
});

export default app;
