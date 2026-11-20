import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAIM_WINDOW_MS, createRound, discard, pauseRound, resumeRound } from '../src/game/engine.js';
import { buildWall } from '../src/game/tiles.js';
import { RECONNECT_HOLD_MS, createRoomManager } from '../src/rooms/manager.js';
import { SERVER_MESSAGES } from '../../shared/protocol.js';

function fakeSocket() {
    const sent = [];
    return {
        sent,
        send: (data) => sent.push(JSON.parse(data)),
        last(type) { return sent.findLast((message) => message.type === type)?.payload; },
    };
}

// One fake clock drives both the engine's claim timer and the room's hold timers.
function fakeClock() {
    let time = 0;
    let nextId = 0;
    const timers = new Map();
    return {
        now: () => time,
        setTimeout(callback, delay) {
            timers.set(++nextId, { callback, deadline: time + delay });
            return nextId;
        },
        clearTimeout(id) { timers.delete(id); },
        advance(milliseconds) {
            time += milliseconds;
            for (const [id, timer] of [...timers]) {
                if (timer.deadline <= time && timers.delete(id)) timer.callback();
            }
        },
    };
}

function startRound() {
    const clock = fakeClock();
    let state;
    const rooms = createRoomManager({
        now: clock.now, setTimer: clock.setTimeout, clearTimer: clock.clearTimeout,
        createGame(options) {
            state = createRound({ ...options, wall: buildWall().map((tile) => tile.tileId), clock });
            return state;
        },
    });
    const sockets = Array.from({ length: 4 }, () => {
        const socket = fakeSocket();
        rooms.addConnection(socket);
        return socket;
    });
    rooms.createRoom(sockets[0], 'A');
    ['B', 'C', 'D'].forEach((name, index) => rooms.joinRoom(sockets[index + 1], '1', name));
    for (const socket of sockets) rooms.setReady(socket, true);
    const tokens = sockets.map((socket) => socket.last(SERVER_MESSAGES.ROOM_STATE).token);
    const roundId = sockets[0].last(SERVER_MESSAGES.SNAPSHOT).roundId;
    return { rooms, sockets, clock, tokens, roundId, get state() { return state; } };
}

function reconnect(rooms) {
    const socket = fakeSocket();
    rooms.addConnection(socket);
    return socket;
}

test('each seat token is sent only to its own player', () => {
    const { sockets, tokens } = startRound();
    assert.equal(new Set(tokens).size, 4);
    sockets.forEach((socket, seat) => {
        const others = tokens.filter((_, index) => index !== seat);
        for (const token of others) assert.ok(!JSON.stringify(socket.sent).includes(token));
    });
});

test('a disconnect mid-round holds the seat and pauses play for everyone', () => {
    const { rooms, sockets, clock, roundId } = startRound();
    clock.advance(1000);
    rooms.removeConnection(sockets[2]);

    const snapshot = sockets[0].last(SERVER_MESSAGES.SNAPSHOT);
    assert.deepEqual(snapshot.waitingFor, [{ seat: 2, name: 'C', reconnectDeadline: 1000 + RECONNECT_HOLD_MS }]);
    assert.equal(snapshot.legalActions.discard, false);
    rooms.playerAction(sockets[0], { requestId: 'r1', roundId, kind: 'discard', tileId: snapshot.ownHand[0].id });
    assert.match(sockets[0].last(SERVER_MESSAGES.ACTION_RESULT).reason, /waiting for a player to reconnect/);
});

test('reconnecting with the seat token within the hold restores the seat and resumes play', () => {
    const { rooms, sockets, clock, tokens, roundId, state } = startRound();
    rooms.removeConnection(sockets[2]);
    clock.advance(RECONNECT_HOLD_MS - 1);

    const returning = reconnect(rooms);
    rooms.resumeSeat(returning, '1', tokens[2]);
    const snapshot = returning.last(SERVER_MESSAGES.SNAPSHOT);
    assert.equal(snapshot.you, 2);
    assert.deepEqual(snapshot.ownHand, state.players[2].concealed);
    assert.deepEqual(snapshot.waitingFor, []);

    clock.advance(10);
    assert.equal(sockets[0].last(SERVER_MESSAGES.ROOM_STATE).roundId, roundId);
    const tileId = state.players[0].concealed[0].id;
    rooms.playerAction(sockets[0], { requestId: 'r1', roundId, kind: 'discard', tileId });
    assert.equal(sockets[0].last(SERVER_MESSAGES.ACTION_RESULT).accepted, true);
});

test('wrong tokens cannot take a held seat', () => {
    const { rooms, sockets, tokens } = startRound();
    rooms.removeConnection(sockets[2]);
    const intruder = reconnect(rooms);
    assert.throws(() => rooms.resumeSeat(intruder, '1', 'guess'), /no longer held/);
    assert.throws(() => rooms.resumeSeat(intruder, '1', undefined), /no longer held/);
    assert.throws(() => rooms.resumeSeat(intruder, '2', tokens[2]), /no longer held/);
});

test('a newer tab with the same token replaces the older connection', () => {
    const { rooms, sockets, tokens } = startRound();
    const newTab = reconnect(rooms);
    rooms.resumeSeat(newTab, '1', tokens[1]);
    assert.equal(newTab.last(SERVER_MESSAGES.SNAPSHOT).you, 1);
    assert.match(sockets[1].last(SERVER_MESSAGES.ERROR).reason, /another tab/);
    assert.deepEqual(newTab.last(SERVER_MESSAGES.SNAPSHOT).waitingFor, []);
});

test('an expired hold ends the round, removes the absent player and returns the rest to the room', () => {
    const { rooms, sockets, clock, tokens } = startRound();
    rooms.removeConnection(sockets[2]);
    clock.advance(RECONNECT_HOLD_MS);

    const roomState = sockets[0].last(SERVER_MESSAGES.ROOM_STATE);
    assert.equal(roomState.roundId, null);
    assert.equal(roomState.seats[2], null);
    assert.ok(roomState.seats.filter(Boolean).every((seat) => seat.ready === false));
    assert.match(roomState.notice, /C did not reconnect/);
    assert.throws(() => rooms.resumeSeat(reconnect(rooms), '1', tokens[2]), /no longer held/);
});

test('the room is deleted when every held seat expires', () => {
    const { rooms, sockets, clock } = startRound();
    for (const socket of sockets) rooms.removeConnection(socket);
    clock.advance(RECONNECT_HOLD_MS);
    const watcher = reconnect(rooms);
    assert.throws(() => rooms.joinRoom(watcher, '1', 'W'), /no such room/);
});

test('pausing a claim window keeps its remaining time until play resumes', () => {
    const clock = fakeClock();
    const state = createRound({ wall: buildWall().map((tile) => tile.tileId), clock });
    discard(state, state.currentSeat, state.players[state.currentSeat].concealed[0].id);
    clock.advance(1000);
    pauseRound(state);
    clock.advance(60000);
    assert.equal(state.phase, 'claims');
    resumeRound(state);
    clock.advance(CLAIM_WINDOW_MS - 1001);
    assert.equal(state.phase, 'claims');
    clock.advance(1);
    assert.notEqual(state.phase, 'claims');
});
