import { randomUUID } from 'node:crypto';
import { S2C } from '../../../shared/protocol.js';
import { send } from '../network/send.js';
import { GameError, Room } from './room.js';
import * as stubEngine from './stubEngine.js';

const MAX_NAME_LENGTH = 20;

// Public lobby, anonymous players identified by a session token, and reconnect handling.
export function createManager({
    engine = stubEngine,
    turnMs = 30000,
    autoMs = 1000,
    reconnectMs = 60000,
    random = Math.random,
} = {}) {
    const players = new Map(); // token -> { token, name, socket, gameId, reconnectTimer }
    const rooms = new Map();
    let nextRoomId = 1;

    function lobby() {
        const games = [...rooms.values()].filter((room) => room.phase === 'waiting').map((room) => room.summary());
        return { games };
    }

    function broadcastLobby() {
        const payload = lobby();
        for (const player of players.values()) {
            if (player.socket && !player.gameId) send(player.socket, S2C.LOBBY, payload);
        }
    }

    function roomChanged(room) {
        if (!room.hasMembers()) {
            room.close();
            rooms.delete(room.id);
        }
        broadcastLobby();
    }

    function roomOf(player) {
        const room = rooms.get(player.gameId);
        if (!room) throw new GameError('not in a game');
        return room;
    }

    function hello(socket, payload) {
        if (socket.player) throw new GameError('already said hello');
        const { token, name } = payload && typeof payload === 'object' ? payload : {};

        let player = typeof token === 'string' ? players.get(token) : undefined;
        if (player) {
            clearTimeout(player.reconnectTimer);
            if (player.socket) {
                const old = player.socket;
                old.player = null;
                send(old, S2C.ERROR, { reason: 'opened in another tab' });
                old.close();
            }
        } else {
            // Unknown or missing token: issue a new one rather than trusting the client's.
            player = { token: randomUUID(), name: cleanName(name, random), socket: null, gameId: null, reconnectTimer: null };
            players.set(player.token, player);
        }

        player.socket = socket;
        socket.player = player;
        send(socket, S2C.WELCOME, { token: player.token, name: player.name });
        const room = rooms.get(player.gameId);
        if (room) room.broadcast();
        else send(socket, S2C.LOBBY, lobby());
    }

    function createGame(player) {
        if (player.gameId) throw new GameError('already in a game');
        const room = new Room(String(nextRoomId++), { engine, turnMs, autoMs, random });
        rooms.set(room.id, room);
        room.join(player);
        roomChanged(room);
    }

    function joinGame(player, gameId) {
        if (player.gameId) throw new GameError('already in a game');
        const room = rooms.get(String(gameId));
        if (!room) throw new GameError('no such game');
        room.join(player);
        roomChanged(room);
    }

    function leaveGame(player) {
        const room = roomOf(player);
        room.leave(player);
        roomChanged(room);
    }

    function discard(player, tile) {
        roomOf(player).discard(player, tile);
    }

    // Holds the seat for reconnectMs; after that the player leaves and the seat goes away.
    function disconnect(socket) {
        const player = socket.player;
        if (!player || player.socket !== socket) return;
        player.socket = null;
        rooms.get(player.gameId)?.broadcast();
        player.reconnectTimer = setTimeout(() => {
            if (rooms.has(player.gameId)) leaveGame(player);
            players.delete(player.token);
        }, reconnectMs);
    }

    return { hello, createGame, joinGame, leaveGame, discard, disconnect, lobby, rooms, players };
}

function cleanName(name, random) {
    const cleaned = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '';
    return cleaned || `Guest ${1000 + Math.floor(random() * 9000)}`;
}
