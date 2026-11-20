// WebSocket messages shared by the browser and server. Every message is JSON: { type, payload }.

export const SEAT_COUNT = 4;
export const MAX_NAME_LENGTH = 20;

export const CLIENT_MESSAGES = Object.freeze({
    LIST_ROOMS: 'listRooms',    // {}
    CREATE_ROOM: 'createRoom',  // { name }
    JOIN_ROOM: 'joinRoom',      // { roomId, name }
    RESUME_SEAT: 'resumeSeat',  // { roomId, token }, reclaims a held seat after a dropped connection
    READY: 'ready',             // { ready: boolean }
    LEAVE_ROOM: 'leaveRoom',    // {}
    // { requestId, roundId, kind: ACTION_KINDS, tileId? (discard), windowId? (claim/pass) }
    ACTION: 'action',
});

export const ACTION_KINDS = Object.freeze(['drawFront', 'drawBack', 'discard', 'claim', 'pass']);

export const SERVER_MESSAGES = Object.freeze({
    // { rooms: [{ id, playerNames: string[], isFull }] }, sent to everyone not in a room
    ROOM_LIST: 'roomList',
    // { roomId, you: seat, roundId: string | null, seats: [{ name, ready } | null], token, notice: string | null },
    // sent to everyone in the room; token is private to its own seat
    ROOM_STATE: 'roomState',
    // Full personalized game view; never includes wall order or opponents' hands.
    // waitingFor: [{ seat, name, reconnectDeadline }] lists held seats while play is paused.
    SNAPSHOT: 'snapshot',
    // { requestId, accepted: boolean, reason? }, sent only to the player who acted
    ACTION_RESULT: 'actionResult',
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
