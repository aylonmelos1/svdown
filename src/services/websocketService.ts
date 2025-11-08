import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import log from '../log';
import { requestYtdownProxy } from './ytdownService';

let wss: WebSocketServer;

// Store polling intervals to manage them
const clientIntervals = new Map<WebSocket, NodeJS.Timeout>();

function stopPolling(ws: WebSocket) {
    if (clientIntervals.has(ws)) {
        clearInterval(clientIntervals.get(ws)!);
        clientIntervals.delete(ws);
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
    });

    ws.on('error', (error: Error) => {
      log.error('WebSocket error:', error);
      stopPolling(ws);
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
