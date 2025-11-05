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

app.get('/ads.txt', (_req, res) => {
  res.status(301).redirect('https://srv.adstxtmanager.com/19390/svdown.tech')
});

app.get('/como-usar', (_req, res) => {
  log.info('Rendering view /como-usar');
  res.sendFile(path.join(viewPath, 'como-usar.html'));
});

app.get('/sitemap.xml', (_req, res) => {
  res.sendFile(path.join(viewPath, 'sitemap.xml'));
});

app.post('/api/resolve', apiKeyGuard, resolveLinkResponse);
app.get('/api/download', apiKeyGuard, downloadVideoHandler);

// Catch-all route to redirect to the home page
app.get('/*splat', (_req, res) => {
  res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log.info(`Server is running on port ${PORT}`);
});

export default app;
