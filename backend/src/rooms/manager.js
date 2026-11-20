import { randomUUID } from 'node:crypto';
import {
    abandonRound, claimRetainedChi, createRound, discard, drawBack, drawFront, pauseRound, resumeRound, submitClaim,
} from '../game/engine.js';
import { createGameView } from '../game/view.js';
import { MAX_NAME_LENGTH, SEAT_COUNT, SERVER_MESSAGES, createMessage } from '../../../shared/protocol.js';

// How long a disconnected player's seat is held during a round before it ends.
export const RECONNECT_HOLD_MS = 30000;
const NO_ACTIONS = Object.freeze({ drawFront: false, drawBack: false, discard: false, claim: null, pass: false });

// Thrown for requests the player cannot make; the message is sent back as an error.
export class RoomError extends Error {}

// In-memory rooms with four seats. The server binds each socket to its seat;
// clients never say which seat they are acting for. Each seat also has a private
// token so its player can reclaim it after a dropped connection.
export function createRoomManager({
    createGame = createRound, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
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

    // The token goes only to its own seat; notice explains why a round ended.
    function broadcastRoomState(room, notice = null) {
        const seats = room.seats.map((seat) => seat && { name: seat.name, ready: seat.ready });
        room.seats.forEach((seat, index) => {
            if (!seat?.socket) return;
            send(seat.socket, SERVER_MESSAGES.ROOM_STATE, {
                roomId: room.id, you: index, seats, roundId: room.roundId ?? null, token: seat.token, notice,
            });
        });
    }

    function disconnectedSeats(room) {
        return room.seats.flatMap((seat, index) => (seat && !seat.socket
            ? [{ seat: index, name: seat.name, reconnectDeadline: seat.reconnectDeadline }] : []));
    }

    function isPaused(room) {
        return Boolean(room.round) && disconnectedSeats(room).length > 0;
    }

    function broadcastSnapshots(room) {
        const serverNow = now();
        const waitingFor = disconnectedSeats(room);
        room.seats.forEach((seat, index) => {
            if (!seat?.socket) return;
            const view = createGameView(room.round, index, serverNow);
            if (waitingFor.length > 0) view.legalActions = NO_ACTIONS;
            send(seat.socket, SERVER_MESSAGES.SNAPSHOT, { roomId: room.id, roundId: room.roundId, ...view, waitingFor });
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
        room.seats[seat] = {
            socket, name: cleanName(name, seat), ready: false, token: randomUUID(), reconnectDeadline: null, holdTimer: null,
        };
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
        // Held seats keep the room alive until they reconnect or expire.
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
            if (isPaused(room)) throw new RoomError('waiting for a player to reconnect');
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

    // During a live round the seat is held and play pauses; elsewhere the seat is freed.
    function removeConnection(socket) {
        const membership = membershipBySocket.get(socket);
        if (membership && membership.room.round && membership.room.round.phase !== 'over') holdSeat(membership);
        else if (membership) leaveRoom(socket);
        sockets.delete(socket);
    }

    function holdSeat({ room, seat }) {
        const player = room.seats[seat];
        membershipBySocket.delete(player.socket);
        player.socket = null;
        player.reconnectDeadline = now() + RECONNECT_HOLD_MS;
        player.holdTimer = setTimer(() => expireHold(room, player), RECONNECT_HOLD_MS);
        player.holdTimer?.unref?.();
        pauseRound(room.round);
        broadcastSnapshots(room);
    }

    // Ends the round, removes everyone still disconnected and returns the rest to the room.
    function expireHold(room, player) {
        if (!room.seats.includes(player) || player.socket) return;
        const departed = room.seats.filter((seat) => seat && !seat.socket);
        for (const seat of departed) clearTimer(seat.holdTimer);
        room.seats = room.seats.map((seat) => (departed.includes(seat) ? null : seat));
        if (room.round) abandonRound(room.round, 'player_disconnected');
        room.round = null;
        room.roundId = null;
        room.actionResults = null;
        for (const seat of room.seats) if (seat) seat.ready = false;
        if (room.seats.every((seat) => seat === null)) rooms.delete(room.id);
        else {
            const names = departed.map((seat) => seat.name).join(', ');
            broadcastRoomState(room, `${names} did not reconnect, so the round ended.`);
        }
        broadcastRoomList();
    }

    // Reattaches a socket to the seat its token belongs to. A newer tab replaces an older one.
    function resumeSeat(socket, roomId, token) {
        if (membershipBySocket.has(socket)) throw new RoomError('already in a room');
        const room = rooms.get(String(roomId));
        const seat = typeof token === 'string' && room ? room.seats.findIndex((player) => player?.token === token) : -1;
        if (seat === -1) throw new RoomError('that seat is no longer held');
        const player = room.seats[seat];
        if (player.socket) {
            membershipBySocket.delete(player.socket);
            listRooms(player.socket);
            send(player.socket, SERVER_MESSAGES.ERROR, { reason: 'this seat was opened in another tab' });
        }
        clearTimer(player.holdTimer);
        player.holdTimer = null;
        player.reconnectDeadline = null;
        player.socket = socket;
        membershipBySocket.set(socket, { room, seat });
        if (room.round && !isPaused(room)) resumeRound(room.round);
        broadcastRoomState(room);
        if (room.round) broadcastSnapshots(room);
    }

    return {
        addConnection, removeConnection, listRooms, createRoom, joinRoom, resumeSeat, setReady, leaveRoom, playerAction,
    };
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
