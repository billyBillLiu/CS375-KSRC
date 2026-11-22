import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createMessageHandler } from './network/handlers.js';
import { createRoomManager } from './rooms/manager.js';
import { openSessionDatabase } from './database/sessions.js';
import { serveStatic } from './static.js';

// Render sets RENDER=true; it needs 0.0.0.0 to reach the server.
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT || 3001);
// A silently dropped socket is noticed within two beats, well inside the 30-second seat hold.
const heartbeatMs = 10000;

const sessionDatabase = await openSessionDatabase(process.env.DATABASE_URL);

const server = createServer(async (request, response) => {
    if (request.url === '/api/health' && request.method === 'GET') {
        response.writeHead(sessionDatabase.healthy ? 200 : 503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: sessionDatabase.healthy ? 'ok' : 'database_unavailable' }));
        return;
    }
    if (request.method === 'GET' && await serveStatic(request, response)) return;
    response.writeHead(404);
    response.end('Not found');
});

const rooms = createRoomManager({ sessionDatabase });
const handleMessage = createMessageHandler(rooms);

const sockets = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
sockets.on('connection', (socket) => {
    socket.isAlive = true;
    rooms.addConnection(socket);
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('error', console.error);
    socket.on('message', (raw) => handleMessage(socket, raw));
    socket.on('close', () => rooms.removeConnection(socket));
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

let shuttingDown = false;
async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(heartbeat);
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    await new Promise((resolve) => server.close(resolve));
    try {
        await sessionDatabase.close();
    } catch (error) {
        console.error('Could not finish saving sessions:', error.message);
        process.exitCode = 1;
    }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
