// WebSocket messages shared by the browser and server. Every message is JSON: { type, payload }.

export const SEAT_COUNT = 4;
export const MAX_NAME_LENGTH = 20;

export const CLIENT_MESSAGES = Object.freeze({
    LIST_ROOMS: 'listRooms',    // {}
    CREATE_ROOM: 'createRoom',  // { name }
    JOIN_ROOM: 'joinRoom',      // { roomId, name }
    READY: 'ready',             // { ready: boolean }
    LEAVE_ROOM: 'leaveRoom',    // {}
});

export const SERVER_MESSAGES = Object.freeze({
    // { rooms: [{ id, playerNames: string[], isFull }] }, sent to everyone not in a room
    ROOM_LIST: 'roomList',
    // { roomId, you: seat, seats: [{ name, ready } | null] }, sent to everyone in the room
    ROOM_STATE: 'roomState',
    ERROR: 'error',             // { reason }
});

export function createMessage(type, payload = {}) {
    return JSON.stringify({ type, payload });
}

// Returns { type, payload } or null for malformed input.
export function parseMessage(text) {
    let message;
    try {
        message = JSON.parse(text);
    } catch {
        return null;
    }
    if (!message || typeof message.type !== 'string') return null;
    const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    return { type: message.type, payload };
}
