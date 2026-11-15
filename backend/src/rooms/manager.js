import { randomUUID } from 'node:crypto';
import { claimRetainedChi, createRound, discard, drawBack, drawFront, submitClaim } from '../game/engine.js';
import { createGameView } from '../game/view.js';
import { MAX_NAME_LENGTH, SEAT_COUNT, SERVER_MESSAGES, createMessage } from '../../../shared/protocol.js';

// Thrown for requests the player cannot make; the message is sent back as an error.
export class RoomError extends Error {}

// In-memory rooms with four seats. The server binds each socket to its seat;
// clients never say which seat they are acting for.
export function createRoomManager({ createGame = createRound, now = Date.now } = {}) {
    const sockets = new Set();
    const rooms = new Map();
    const membershipBySocket = new Map(); // socket -> { room, seat }
    let nextRoomId = 1;

    function send(socket, type, payload) {
        socket.send(createMessage(type, payload));
    }

    function roomSummaries() {
        return [...rooms.values()].filter((room) => !room.round).map((room) => ({
            id: room.id,
            playerNames: room.seats.filter(Boolean).map((seat) => seat.name),
            isFull: !room.seats.includes(null),
        }));
    }

    function broadcastRoomList() {
        const payload = { rooms: roomSummaries() };
        for (const socket of sockets) {
            if (!membershipBySocket.has(socket)) send(socket, SERVER_MESSAGES.ROOM_LIST, payload);
        }
    }

    function broadcastRoomState(room) {
        const seats = room.seats.map((seat) => seat && { name: seat.name, ready: seat.ready });
        room.seats.forEach((seat, index) => {
            if (seat) send(seat.socket, SERVER_MESSAGES.ROOM_STATE, { roomId: room.id, you: index, seats, roundId: room.roundId ?? null });
        });
    }

    function broadcastSnapshots(room) {
        const serverNow = now();
        room.seats.forEach((seat, index) => {
            if (!seat) return;
            send(seat.socket, SERVER_MESSAGES.SNAPSHOT, {
                roomId: room.id,
                roundId: room.roundId,
                ...createGameView(room.round, index, serverNow),
            });
        });
    }

    function membershipOf(socket) {
        const membership = membershipBySocket.get(socket);
        if (!membership) throw new RoomError('not in a room');
        return membership;
    }

    function takeSeat(socket, room, name) {
        if (membershipBySocket.has(socket)) throw new RoomError('already in a room');
        if (room.round) throw new RoomError('round has already started');
        const seat = room.seats.indexOf(null);
        if (seat === -1) throw new RoomError('room is full');
        room.seats[seat] = { socket, name: cleanName(name, seat), ready: false };
        membershipBySocket.set(socket, { room, seat });
        broadcastRoomState(room);
        broadcastRoomList();
    }

    function addConnection(socket) {
        sockets.add(socket);
    }

    function listRooms(socket) {
        send(socket, SERVER_MESSAGES.ROOM_LIST, { rooms: roomSummaries() });
    }

    function createRoom(socket, name) {
        if (membershipBySocket.has(socket)) throw new RoomError('already in a room');
        const room = { id: String(nextRoomId++), seats: Array(SEAT_COUNT).fill(null) };
        rooms.set(room.id, room);
        takeSeat(socket, room, name);
    }

    function joinRoom(socket, roomId, name) {
        const room = rooms.get(String(roomId));
        if (!room) throw new RoomError('no such room');
        takeSeat(socket, room, name);
    }

    function setReady(socket, ready) {
        const { room, seat } = membershipOf(socket);
        if (room.round) throw new RoomError('round has already started');
        room.seats[seat].ready = ready === true;
        if (room.seats.every((player) => player?.ready && sockets.has(player.socket)
            && (player.socket.readyState === undefined || player.socket.readyState === 1))) {
            room.roundId = randomUUID();
            room.actionResults = new Map();
            room.round = createGame({ onChange: () => broadcastSnapshots(room) });
        }
        broadcastRoomState(room);
        if (room.round) {
            broadcastSnapshots(room);
            broadcastRoomList();
        }
    }

    function leaveRoom(socket) {
        const { room, seat } = membershipOf(socket);
        room.seats[seat] = null;
        membershipBySocket.delete(socket);
        if (room.seats.every((s) => s === null)) rooms.delete(room.id);
        else {
            broadcastRoomState(room);
            if (room.round) broadcastSnapshots(room);
        }
        broadcastRoomList();
    }

    // Always replies with ACTION_RESULT so the client can clear its pending request.
    function playerAction(socket, payload) {
        const { requestId } = payload;
        if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 64) {
            throw new RoomError('action needs a request ID');
        }
        let result;
        try {
            const { room, seat } = membershipOf(socket);
            if (!room.round) throw new RoomError('no round in progress');
            if (payload.roundId !== room.roundId) throw new RoomError('that action is for an earlier round');
            // ponytail: one map per round; it grows by one entry per action and is dropped with the round.
            const previous = room.actionResults.get(`${seat}:${requestId}`);
            if (previous) {
                send(socket, SERVER_MESSAGES.ACTION_RESULT, previous);
                return;
            }
            try {
                applyAction(room.round, seat, payload);
                result = { requestId, accepted: true };
            } catch (error) {
                if (error instanceof RoomError) throw error;
                // The engine validates before changing state, so a rejected action changes nothing.
                result = { requestId, accepted: false, reason: error.message };
            }
            room.actionResults.set(`${seat}:${requestId}`, result);
            send(socket, SERVER_MESSAGES.ACTION_RESULT, result);
            if (result.accepted) broadcastSnapshots(room);
        } catch (error) {
            if (!(error instanceof RoomError)) throw error;
            send(socket, SERVER_MESSAGES.ACTION_RESULT, { requestId, accepted: false, reason: error.message });
        }
    }

    // TODO(M24): Once rounds exist, end the active round and tell the others why.
    function removeConnection(socket) {
        if (membershipBySocket.has(socket)) leaveRoom(socket);
        sockets.delete(socket);
    }

    return { addConnection, removeConnection, listRooms, createRoom, joinRoom, setReady, leaveRoom, playerAction };
}

function applyAction(state, seat, { kind, tileId, windowId }) {
    switch (kind) {
        case 'drawFront':
            return drawFront(state, seat);
        case 'drawBack':
            return drawBack(state, seat);
        case 'discard':
            return discard(state, seat, tileId);
        case 'pass':
            return submitClaim(state, seat, windowId, 'pass');
        case 'claim':
            // Outside the claim window, the only claim is a retained Chi on this player's turn.
            if (state.phase === 'claims') return submitClaim(state, seat, windowId, 'claim');
            return claimRetainedChi(state, seat, windowId);
        default:
            throw new RoomError(`unknown action ${kind}`);
    }
}

function cleanName(name, seat) {
    const cleaned = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '';
    return cleaned || `Player ${seat + 1}`;
}
