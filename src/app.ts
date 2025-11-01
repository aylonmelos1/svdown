import e from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import log from './log';
import { resolveLinkResponse } from './controller/linkResolver';
import { downloadVideoHandler } from './controller/download';
import { ensureApiCookie } from './middleware/cookieInitializer';
import { apiKeyGuard } from './middleware/apiKey';

const app = e();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewPath = path.resolve(__dirname, 'view');

app.use(cookieParser());
app.use(e.json());

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  return ensureApiCookie(req, res, next);
});

app.use(e.static(viewPath));

app.get('/', (_req, res) => {
  log.info('Rendering view /');
  res.sendFile(path.join(viewPath, 'index.html'));
});

app.post('/api/resolve', apiKeyGuard, resolveLinkResponse);
app.get('/api/download', apiKeyGuard, downloadVideoHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log.info(`Server is running on port ${PORT}`);
});

export default app;
