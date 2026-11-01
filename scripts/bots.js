// Fills seats with bots that discard whatever they just drew, for testing without four people.
// Usage: npm run bots -- [gameId] [count]   (no gameId: the first bot creates a game)
import WebSocket from 'ws';
import { C2S, S2C } from '../shared/protocol.js';

const url = process.env.WS_URL || `ws://127.0.0.1:${process.env.PORT || 3001}/ws`;
const [gameIdArg, countArg] = process.argv.slice(2);
const count = Number(countArg || 3);
const delayMs = Number(process.env.BOT_DELAY_MS || 500);

function runBot(index, gameId) {
    return new Promise((resolve) => {
        const ws = new WebSocket(url);
        const send = (type, payload = {}) => ws.send(JSON.stringify({ type, payload }));
        let joined = false;
        let lastSeen = null;

        ws.on('open', () => send(C2S.HELLO, { name: `Bot ${index + 1}` }));
        ws.on('message', (raw) => {
            const { type, payload } = JSON.parse(raw);
            if (type === S2C.LOBBY && !joined) {
                joined = true;
                if (gameId) send(C2S.JOIN_GAME, { gameId });
                else send(C2S.CREATE_GAME);
            } else if (type === S2C.GAME_STATE) {
                resolve(payload.gameId);
                const key = `${payload.currentTurn}:${payload.wallCount}`;
                if (payload.phase === 'playing' && payload.currentTurn === payload.seat && key !== lastSeen) {
                    lastSeen = key;
                    const tile = payload.lastDrawn ?? payload.hand[0];
                    setTimeout(() => send(C2S.DISCARD, { tile }), delayMs);
                }
            } else if (type === S2C.GAME_OVER) {
                console.log(`Bot ${index + 1}: game over`, payload);
                ws.close();
            } else if (type === S2C.ERROR) {
                console.log(`Bot ${index + 1}: error`, payload.reason);
            }
        });
        ws.on('close', () => resolve(null));
    });
}

let gameId = gameIdArg;
for (let i = 0; i < count; i++) {
    const joinedId = await runBot(i, gameId);
    gameId ??= joinedId;
}
console.log(`${count} bot(s) in game ${gameId}`);
