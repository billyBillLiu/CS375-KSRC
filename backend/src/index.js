import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createMessageHandler } from './network/handlers.js';
import { createManager } from './rooms/manager.js';
import { serveStatic } from './static.js';

// Render sets RENDER=true; it needs 0.0.0.0 to reach the server.
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT || 3001);
const heartbeatMs = 30000;

const server = createServer(async (request, response) => {
    if (request.url === '/api/health' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
        return;
    }
    if (request.method === 'GET' && await serveStatic(request, response)) return;
    response.writeHead(404);
    response.end('Not found');
});

const manager = createManager();
const handleMessage = createMessageHandler(manager);

const sockets = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
sockets.on('connection', (socket) => {
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('error', console.error);
    socket.on('message', (raw) => handleMessage(socket, raw));
    socket.on('close', () => manager.disconnect(socket));
});

// Drop sockets that miss a ping; also keeps idle connections open behind Render's proxy.
const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
        if (!socket.isAlive) {
            socket.terminate();
            continue;
        }
        socket.isAlive = false;
        socket.ping();
    }
}, heartbeatMs);

server.listen(port, host, () => {
    console.log(`Mahjong backend: http://${host}:${port}`);
});

function shutdown() {
    clearInterval(heartbeat);
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
