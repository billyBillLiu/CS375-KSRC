import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3001);

const server = createServer((request, response) => {
    if (request.url === '/api/health' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
        return;
    }
    response.writeHead(404);
    response.end('Not found');
});

const sockets = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
sockets.on('connection', (socket) => {
    socket.on('error', console.error);
    // TODO: Register message handlers from network/ once the protocol is defined.
});

server.listen(port, host, () => {
    console.log(`Mahjong backend: http://${host}:${port}`);
});

function shutdown() {
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
