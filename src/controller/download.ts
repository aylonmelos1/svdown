import axios from 'axios';
import { Request, Response } from 'express';
import log from '../log';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';

// Helper function to download a file from a URL
async function downloadFile(url: URL, filePath: string): Promise<void> {
    const writer = (await fs.open(filePath, 'w')).createWriteStream();
    const response = await axios.get(url.toString(), { responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Helper function to run ffmpeg
async function cleanupMetadata(inputPath: string, outputPath: string): Promise<void> {
    const ffmpeg = spawn(ffmpegPath!, [
        '-i', inputPath,
        '-map_metadata', '-1',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-map', '0',
        outputPath
    ]);

    return new Promise<void>((resolve, reject) => {
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                log.info('ffmpeg processed video successfully.');
                resolve();
            } else {
                log.error(`ffmpeg exited with code ${code}`);
                reject(new Error('Failed to process video with ffmpeg.'));
            }
        });
        ffmpeg.stderr.on('data', (data) => {
            log.info(`ffmpeg stderr: ${data}`);
        });
        ffmpeg.on('error', (err) => {
            log.error('Failed to start ffmpeg process.', err);
            reject(err);
        });
    });
}

// Helper function to send the file to the user
async function sendFile(res: Response, filePath: string, fileName: string) {
    const stat = await fs.stat(filePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const readStream = (await fs.open(filePath, 'r')).createReadStream();
    readStream.pipe(res);
}

export const downloadVideoHandler = async (req: Request, res: Response) => {
    const { url, fallback } = req.query as { url?: string; fallback?: string };

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    let tempDir: string | undefined;
    try {
        const targetUrl = new URL(url);
        const fileName = buildFileName(targetUrl);

        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svdown-'));
        const tempInputPath = path.join(tempDir, 'input.mp4');
        const tempOutputPath = path.join(tempDir, 'output.mp4');

        log.info(`Starting raw download from: ${targetUrl.toString()}`);
        await downloadFile(targetUrl, tempInputPath);
        log.info('Download to temporary file complete. Starting ffmpeg.');

        try {
            await cleanupMetadata(tempInputPath, tempOutputPath);
            await sendFile(res, tempOutputPath, fileName);
        } catch (error) {
            log.error('Failed to cleanup metadata, sending original file.', error);
            res.setHeader('X-Metadata-Cleaned', 'false');
            await sendFile(res, tempInputPath, fileName);
        }

    } catch (error) {
        log.error(error);
        if (!res.headersSent) {
            res.status(502).json({ error: 'Failed to download or process the video.' });
        }
    } finally {
        if (tempDir) {
            fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
                log.error(`Failed to cleanup temporary directory: ${tempDir}`, err);
            });
        }
    }
};

function buildFileName(url: URL) {
    const lastSegment = url.pathname.split('/').filter(Boolean).pop() || 'video';
    return lastSegment.endsWith('.mp4') ? lastSegment : `${lastSegment}.mp4`;
}