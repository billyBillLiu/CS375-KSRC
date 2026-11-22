import { CLIENT_MESSAGES, SERVER_MESSAGES, createMessage, parseMessage } from '../../../shared/protocol.js';
import { RoomError } from '../rooms/manager.js';

// Returns a handler that validates one raw WebSocket message and routes it to the room manager.
export function createMessageHandler(rooms) {
    return function handleMessage(socket, raw) {
        const message = parseMessage(String(raw));
        if (!message) {
            sendError(socket, 'malformed message');
            return;
        }
        try {
            route(rooms, socket, message);
        } catch (error) {
            if (!(error instanceof RoomError)) {
                console.error(error);
                sendError(socket, 'server error');
                return;
            }
            sendError(socket, error.message);
        }
    };
}

function route(rooms, socket, { type, payload }) {
    switch (type) {
        case CLIENT_MESSAGES.LIST_ROOMS:
            return rooms.listRooms(socket);
        case CLIENT_MESSAGES.CREATE_ROOM:
            return rooms.createRoom(socket, payload.name);
        case CLIENT_MESSAGES.JOIN_ROOM:
            return rooms.joinRoom(socket, payload.roomId, payload.name);
        case CLIENT_MESSAGES.RESUME_SEAT:
            return rooms.resumeSeat(socket, payload.roomId, payload.token);
        case CLIENT_MESSAGES.READY:
            return rooms.setReady(socket, payload.ready);
        case CLIENT_MESSAGES.LEAVE_ROOM:
            return rooms.leaveRoom(socket);
        case CLIENT_MESSAGES.ACTION:
            return rooms.playerAction(socket, payload);
        default:
            throw new RoomError(`unknown message type ${type}`);
    }
}

function sendError(socket, reason) {
    socket.send(createMessage(SERVER_MESSAGES.ERROR, { reason }));
}

// Identity is established before any room action; no client-provided player ID is trusted.
export function createIdentifiedHandler(rooms, database) {
    const handleMessage = createMessageHandler(rooms);
    const identifying = new WeakSet();
    const identified = new WeakSet();
    return async function handleIdentifiedMessage(socket, raw) {
        if (identified.has(socket)) return handleMessage(socket, raw);
        const message = parseMessage(String(raw));
        if (message?.type !== CLIENT_MESSAGES.IDENTIFY || identifying.has(socket)) {
            sendError(socket, 'Identify this tab before joining a game.');
            return;
        }
        identifying.add(socket);
        try {
            const player = await database.identifyPlayer(message.payload.token);
            if (socket.readyState !== 1) return;
            socket.playerId = player.id;
            rooms.addConnection(socket);
            identified.add(socket);
            socket.send(createMessage(SERVER_MESSAGES.PLAYER_SESSION, { token: player.token }));
        } catch (error) {
            console.error('Player identity could not be loaded:', error.message);
            if (socket.readyState === 1) socket.close(1011, 'Player session unavailable');
        } finally {
            identifying.delete(socket);
        }
    };
}
