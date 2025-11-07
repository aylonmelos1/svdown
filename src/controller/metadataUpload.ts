import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import log from '../log';
import { cleanupMetadata, finalizeCleanMedia, redactForLogs } from '../lib/mediaCleaner';

const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200 MB
const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v']);

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, os.tmpdir());
    },
    filename: (_req, file, cb) => {
        const ext = normalizeExtension(file.originalname);
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `svdown-upload-${unique}${ext}`);
    },
});

export const metadataUploadMiddleware = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_SIZE },
}).single('file');

export async function metadataUploadHandler(req: Request, res: Response) {
    const uploadedFile = req.file;
    if (!uploadedFile) {
        return res.status(400).json({ error: 'Envie um arquivo para remover os metadados.' });
    }

    const extension = normalizeExtension(uploadedFile.originalname || uploadedFile.filename);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        await safeUnlink(uploadedFile.path);
        return res.status(415).json({ error: 'Formato não suportado. Envie arquivos MP4/MOV.' });
    }

    let tempDir: string | null = null;
    try {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svdown-clean-'));
        const inputPath = path.join(tempDir, `input${extension}`);
        await fs.rename(uploadedFile.path, inputPath);
        const outputPath = path.join(tempDir, `output${extension}`);

        log.info(`[upload-cleaner] Cleansing uploaded file ${redactForLogs(uploadedFile.originalname)}`);
        await cleanupMetadata(inputPath, outputPath);
        await finalizeCleanMedia('video', outputPath);

        await streamCleanFile(res, outputPath, buildDownloadName(uploadedFile.originalname, extension));
        log.info('[upload-cleaner] Clean file delivered successfully.');
    } catch (error) {
        log.error('[upload-cleaner] Failed to clean uploaded file', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Falha ao remover os metadados. Tente novamente.' });
        }
        await safeUnlink(uploadedFile.path);
    } finally {
        if (tempDir) {
            fs.rm(tempDir, { recursive: true, force: true }).catch((err) => {
                log.error(`[upload-cleaner] Failed to remove temp dir ${tempDir}`, err);
            });
        }
    }
}

function normalizeExtension(value?: string | null): string {
    if (!value) {
        return '.mp4';
    }
    const ext = path.extname(value).toLowerCase();
    return ext || '.mp4';
}

function buildDownloadName(originalName: string | undefined, extension: string): string {
    const sanitized = sanitizeFileName(originalName);
    if (sanitized) {
        return ensureExtension(`${sanitized}-clean`, extension);
    }
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(
        now.getUTCHours()
    )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
    return `SVDown-clean-${timestamp}${extension}`;
}

function sanitizeFileName(value?: string | null): string {
    if (!value) {
        return '';
    }
    return value
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s{2,}/g, ' ')
        .replace(/\.\.+/g, '.')
        .replace(/^[-.]+|[-.]+$/g, '')
        .trim();
}

function ensureExtension(name: string, extension: string): string {
    const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`;
    return name.endsWith(normalizedExt) ? name : `${name}${normalizedExt}`;
}

async function streamCleanFile(res: Response, filePath: string, downloadName: string): Promise<void> {
    const stat = await fs.stat(filePath);
    res.setHeader('Content-Type', selectContentType(path.extname(downloadName).toLowerCase()));
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Metadata-Cleaned', 'true');

    const stream = (await fs.open(filePath, 'r')).createReadStream();
    await new Promise<void>((resolve, reject) => {
        stream.on('error', reject);
        res.on('error', reject);
        res.on('finish', resolve);
        stream.pipe(res);
    });
}

function selectContentType(extension: string): string {
    switch (extension) {
        case '.mov':
            return 'video/quicktime';
        case '.m4v':
            return 'video/x-m4v';
        default:
            return 'video/mp4';
    }
}

async function safeUnlink(filePath?: string | null): Promise<void> {
    if (!filePath) {
        return;
    }
    try {
        await fs.unlink(filePath);
    } catch {
        // ignore
    }
}
