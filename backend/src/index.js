import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createIdentifiedHandler } from './network/handlers.js';
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
    let url;
    try {
        url = new URL(request.url, 'http://localhost');
    } catch {
        response.writeHead(400);
        response.end('Invalid URL');
        return;
    }
    if (request.method === 'GET' && url.pathname === '/api/leaderboard') {
        const period = url.searchParams.get('period') ?? 'daily';
        if (!['daily', 'weekly'].includes(period)) {
            response.writeHead(400, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Period must be daily or weekly.' }));
            return;
        }
        try {
            const leaderboard = await sessionDatabase.leaderboard(period);
            response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify(leaderboard));
        } catch {
            response.writeHead(503, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Leaderboard unavailable. Please try again.' }));
        }
        return;
    }
    if (request.method === 'GET' && url.pathname === '/api/score-status') {
        const roundId = url.searchParams.get('roundId');
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(roundId ?? '')) {
            response.writeHead(400);
            response.end('Invalid round ID');
            return;
        }
        try {
            const saved = await sessionDatabase.scoreSaved(roundId);
            response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ saved }));
        } catch {
            response.writeHead(503);
            response.end('Score status unavailable');
        }
        return;
    }
    if (request.method === 'GET' && await serveStatic(request, response)) return;
    response.writeHead(404);
    response.end('Not found');
});

const rooms = createRoomManager({ sessionDatabase });
const handleMessage = createIdentifiedHandler(rooms, sessionDatabase);

const sockets = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
sockets.on('connection', (socket) => {
    socket.isAlive = true;
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
