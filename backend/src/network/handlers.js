import { C2S, S2C } from '../../../shared/protocol.js';
import { GameError } from '../rooms/room.js';
import { send } from './send.js';

// Returns a handler that parses one raw WebSocket message and routes it to the manager.
export function createMessageHandler(manager) {
    return function handleMessage(socket, raw) {
        let message;
        try {
            message = JSON.parse(raw);
        } catch {
            return send(socket, S2C.ERROR, { reason: 'bad json' });
        }
        if (!message || typeof message.type !== 'string') {
            return send(socket, S2C.ERROR, { reason: 'missing type' });
        }

        try {
            route(manager, socket, message.type, message.payload ?? {});
        } catch (error) {
            if (error instanceof GameError) return send(socket, S2C.ERROR, { reason: error.message });
            console.error(error);
            send(socket, S2C.ERROR, { reason: 'server error' });
        }
    };
}

function route(manager, socket, type, payload) {
    if (type === C2S.HELLO) return manager.hello(socket, payload);
    const player = socket.player;
    if (!player) throw new GameError('send hello first');

    switch (type) {
        case C2S.CREATE_GAME:
            return manager.createGame(player);
        case C2S.JOIN_GAME:
            return manager.joinGame(player, payload.gameId);
        case C2S.LEAVE_GAME:
            return manager.leaveGame(player);
        case C2S.DISCARD:
            return manager.discard(player, payload.tile);
        case C2S.CLAIM:
        case C2S.PASS:
        case C2S.DECLARE_KONG:
        case C2S.DECLARE_WIN:
            throw new GameError(`${type} is not implemented yet`);
        default:
            throw new GameError(`unknown type ${type}`);
    }
}
