import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import log from '../log';
import { requestYtdownProxy } from './ytdownService';

export type DownloadStage = 'receiving' | 'resizing' | 'quality' | 'metadata' | 'delivering' | 'downloading';
export type DownloadStageStatus = 'pending' | 'active' | 'completed' | 'error';

let wss: WebSocketServer;

// Store polling intervals to manage them
const clientIntervals = new Map<WebSocket, NodeJS.Timeout>();

// Track download subscriptions per client
const downloadSubscriptions = new Map<string, { ws: WebSocket; timeout: NodeJS.Timeout }>();
const wsDownloadMap = new Map<WebSocket, Set<string>>();
const DOWNLOAD_ID_REGEX = /^[a-zA-Z0-9_-]{6,72}$/;
const DOWNLOAD_SUBSCRIPTION_TTL_MS = 5 * 60 * 1000;

function stopPolling(ws: WebSocket) {
    if (clientIntervals.has(ws)) {
        clearInterval(clientIntervals.get(ws)!);
        clientIntervals.delete(ws);
    }
}

function cleanupDownloadIds(ws: WebSocket) {
    const ids = wsDownloadMap.get(ws);
    if (!ids) {
        return;
    }
    for (const id of ids) {
        const record = downloadSubscriptions.get(id);
        if (record) {
            clearTimeout(record.timeout);
            downloadSubscriptions.delete(id);
        }
    }
    wsDownloadMap.delete(ws);
}

function registerDownloadSubscription(ws: WebSocket, downloadId: string) {
    if (!DOWNLOAD_ID_REGEX.test(downloadId)) {
        ws.send(JSON.stringify({ type: 'download_error', message: 'Identificador de download inválido.' }));
        return;
    }

    const existing = downloadSubscriptions.get(downloadId);
    if (existing) {
        clearTimeout(existing.timeout);
        const priorSet = wsDownloadMap.get(existing.ws);
        priorSet?.delete(downloadId);
        if (priorSet && priorSet.size === 0) {
            wsDownloadMap.delete(existing.ws);
        }
    }

    const timeout = setTimeout(() => {
        removeDownloadSubscription(downloadId);
    }, DOWNLOAD_SUBSCRIPTION_TTL_MS);
    if (typeof timeout.unref === 'function') {
        timeout.unref();
    }

    downloadSubscriptions.set(downloadId, { ws, timeout });

    const ids = wsDownloadMap.get(ws) ?? new Set<string>();
    ids.add(downloadId);
    wsDownloadMap.set(ws, ids);

    ws.send(JSON.stringify({ type: 'download_subscribed', downloadId }));
}

function removeDownloadSubscription(downloadId: string) {
    const record = downloadSubscriptions.get(downloadId);
    if (!record) {
        return;
    }
    clearTimeout(record.timeout);
    downloadSubscriptions.delete(downloadId);
    const ids = wsDownloadMap.get(record.ws);
    ids?.delete(downloadId);
    if (ids && ids.size === 0) {
        wsDownloadMap.delete(record.ws);
    }
}

function sendDownloadMessage(downloadId: string, payload: Record<string, unknown>) {
    const record = downloadSubscriptions.get(downloadId);
    if (!record) {
        return;
    }
    if (record.ws.readyState !== WebSocket.OPEN) {
        removeDownloadSubscription(downloadId);
        return;
    }
    try {
        record.ws.send(JSON.stringify(payload));
    } catch (error) {
        log.error('WebSocket: failed to send download message', { downloadId, error });
        removeDownloadSubscription(downloadId);
    }
}

export function notifyDownloadStage(
    downloadId: string | undefined,
    stage: DownloadStage,
    status: DownloadStageStatus,
    extra?: Record<string, unknown>
) {
    if (!downloadId || !DOWNLOAD_ID_REGEX.test(downloadId)) {
        return;
    }
    sendDownloadMessage(downloadId, {
        type: 'download_stage',
        downloadId,
        stage,
        status,
        ...(extra || {}),
    });

    if ((stage === 'delivering' && status === 'completed') || status === 'error') {
        removeDownloadSubscription(downloadId);
    }
}

async function handleGetInfo(ws: WebSocket, url: string) {
    try {
        ws.send(JSON.stringify({ type: 'info', message: 'Buscando informações do vídeo...' }));
        const response = await requestYtdownProxy(url);
        const formats = response?.api?.mediaItems || [];
        if (formats.length > 0) {
            ws.send(JSON.stringify({ type: 'ytdown_info', data: formats }));
        } else {
            ws.send(JSON.stringify({ type: 'ytdown_error', message: 'Nenhum formato de vídeo encontrado.' }));
        }
    } catch (error) {
        log.error('WebSocket: GetInfo failed', { error });
        ws.send(JSON.stringify({ type: 'ytdown_error', message: 'Falha ao buscar informações do vídeo.' }));
    }
}

async function pollDownloadProgress(ws: WebSocket, url: string) {
    try {
        const response = await requestYtdownProxy(url);
        const api = response?.api;

        if (api?.percent === 'Completed' && api?.fileUrl) {
            ws.send(JSON.stringify({
                type: 'ytdown_success',
                data: {
                    fileUrl: api.fileUrl,
                    fileName: api.fileName || 'download.mp4'
                }
            }));
            stopPolling(ws);
        } else if (api?.percent) {
            ws.send(JSON.stringify({
                type: 'ytdown_progress',
                data: {
                    percent: api.percent.replace('%', ''),
                    size: api.estimatedFileSize || '...'
                }
            }));
        } else if (api?.status === 'error') {
            ws.send(JSON.stringify({ type: 'ytdown_error', message: 'Ocorreu um erro no servidor de download.' }));
            stopPolling(ws);
        }
    } catch (error) {
        log.error('WebSocket: Poll progress failed', { error });
        ws.send(JSON.stringify({ type: 'ytdown_error', message: 'Falha ao consultar o progresso do download.' }));
        stopPolling(ws);
    }
}

function startDownloadPolling(ws: WebSocket, url: string) {
    // Stop any previous polling for this client
    stopPolling(ws);

    // Start new polling
    const interval = setInterval(() => pollDownloadProgress(ws, url), 2000);
    clientIntervals.set(ws, interval);

    // Initial check
    pollDownloadProgress(ws, url);
}


export function initializeWebSocket(server: Server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    log.info('WebSocket client connected');

    ws.on('message', (message: string) => {
        try {
            const parsedMessage = JSON.parse(message);
            log.info('Received WebSocket message:', parsedMessage);

            switch(parsedMessage.type) {
                case 'ytdown_getInfo':
                    handleGetInfo(ws, parsedMessage.url);
                    break;
                case 'ytdown_download':
                    startDownloadPolling(ws, parsedMessage.url);
                    break;
                case 'download_subscribe':
                    if (typeof parsedMessage.downloadId === 'string') {
                        registerDownloadSubscription(ws, parsedMessage.downloadId);
                    } else {
                        ws.send(JSON.stringify({ type: 'download_error', message: 'downloadId obrigatório.' }));
                    }
                    break;
                default:
                    ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
            }
        } catch (error) {
            log.error('WebSocket: Failed to handle message', { message, error });
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });

    ws.on('close', () => {
      log.info('WebSocket client disconnected');
      stopPolling(ws);
      cleanupDownloadIds(ws);
    });

    ws.on('error', (error: Error) => {
      log.error('WebSocket error:', error);
      stopPolling(ws);
      cleanupDownloadIds(ws);
    });
  });

  log.info('WebSocket server initialized');
}

export function getWss() {
  if (!wss) {
    throw new Error('WebSocket server has not been initialized.');
  }
  return wss;
}
