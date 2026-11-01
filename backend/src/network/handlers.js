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
        case CLIENT_MESSAGES.READY:
            return rooms.setReady(socket, payload.ready);
        case CLIENT_MESSAGES.LEAVE_ROOM:
            return rooms.leaveRoom(socket);
        default:
            throw new RoomError(`unknown message type ${type}`);
    }
}

function sendError(socket, reason) {
    socket.send(createMessage(SERVER_MESSAGES.ERROR, { reason }));
}
