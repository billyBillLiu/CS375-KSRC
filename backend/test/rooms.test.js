import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManager } from '../src/rooms/manager.js';
import { GameError } from '../src/rooms/room.js';
import { S2C } from '../../shared/protocol.js';

const TURN_MS = 1000;
const AUTO_MS = 10;
const RECONNECT_MS = 5000;

function fakeSocket() {
    const sent = [];
    return {
        sent,
        closed: false,
        send: (data) => sent.push(JSON.parse(data)),
        close() { this.closed = true; },
        last(type) { return sent.findLast((m) => m.type === type)?.payload; },
    };
}

// Deterministic random so deals and dealers are repeatable.
function seeded(seed) {
    return () => {
        seed = (seed * 1664525 + 1013904223) % 2 ** 32;
        return seed / 2 ** 32;
    };
}

function setup(t) {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const manager = createManager({ turnMs: TURN_MS, autoMs: AUTO_MS, reconnectMs: RECONNECT_MS, random: seeded(1) });
    const sockets = [0, 1, 2, 3].map(() => fakeSocket());
    sockets.forEach((socket, i) => manager.hello(socket, { name: `P${i}` }));
    const players = sockets.map((socket) => socket.player);
    return { manager, sockets, players };
}

function startGame(t) {
    const ctx = setup(t);
    ctx.manager.createGame(ctx.players[0]);
    const gameId = ctx.players[0].gameId;
    for (const player of ctx.players.slice(1)) ctx.manager.joinGame(player, gameId);
    ctx.room = ctx.manager.rooms.get(gameId);
    return ctx;
}

test('lobby lists open games until four players join', (t) => {
    const { manager, sockets, players } = setup(t);
    manager.createGame(players[0]);
    const gameId = players[0].gameId;
    assert.deepEqual(sockets[1].last(S2C.LOBBY).games, [{ id: gameId, players: ['P0'], seatsOpen: 3 }]);

    for (const player of players.slice(1)) manager.joinGame(player, gameId);
    assert.equal(manager.rooms.get(gameId).phase, 'playing');

    const latecomer = fakeSocket();
    manager.hello(latecomer, {});
    assert.deepEqual(latecomer.last(S2C.LOBBY).games, []);
    assert.throws(() => manager.joinGame(latecomer.player, gameId), GameError);
});

test('each player sees only their own hand', (t) => {
    const { sockets, room } = startGame(t);
    const dealer = room.state.dealer;
    sockets.forEach((socket, seat) => {
        const view = socket.last(S2C.GAME_STATE);
        assert.equal(view.seat, seat);
        assert.equal(view.hand.length, seat === dealer ? 17 : 16);
        assert.deepEqual(view.hand, [...room.state.hands[seat]].sort((a, b) => a - b));
        for (const other of view.players) assert.equal(other.hand, undefined);
        assert.equal(view.wall, undefined);
    });
});

test('only the current player can discard a tile they hold', (t) => {
    const { manager, players, room } = startGame(t);
    const dealer = room.state.dealer;
    const other = (dealer + 1) % 4;
    const missing = [...Array(36).keys()].find((tile) => !room.state.hands[dealer].includes(tile));

    assert.throws(() => manager.discard(players[other], room.state.hands[other][0]), /illegal discard/);
    assert.throws(() => manager.discard(players[dealer], missing), /illegal discard/);
    assert.throws(() => manager.discard(players[dealer], '3'), /illegal discard/);

    manager.discard(players[dealer], room.state.hands[dealer][0]);
    assert.equal(room.state.currentTurn, other);
    assert.equal(room.state.hands[dealer].length, 16);
    assert.equal(room.state.hands[other].length, 17);
});

test('turn timer auto-discards the drawn tile', (t) => {
    const { manager, players, room } = startGame(t);
    manager.discard(players[room.state.dealer], room.state.hands[room.state.dealer][0]);
    const seat = room.state.currentTurn;
    const drawn = room.state.lastDrawn;

    t.mock.timers.tick(TURN_MS - 1);
    assert.equal(room.state.currentTurn, seat);
    t.mock.timers.tick(1);
    assert.equal(room.state.discards[seat].at(-1), drawn);
    assert.equal(room.state.currentTurn, (seat + 1) % 4);
});

test('reconnecting with the token within the window keeps the seat', (t) => {
    const { manager, sockets, players, room } = startGame(t);
    const token = players[2].token;
    manager.disconnect(sockets[2]);
    assert.equal(sockets[0].last(S2C.GAME_STATE).players[2].connected, false);

    t.mock.timers.tick(RECONNECT_MS - 1);
    const fresh = fakeSocket();
    manager.hello(fresh, { token });
    assert.equal(fresh.player, players[2]);
    assert.equal(fresh.last(S2C.WELCOME).token, token);
    assert.deepEqual(fresh.last(S2C.GAME_STATE).hand, [...room.state.hands[2]].sort((a, b) => a - b));

    t.mock.timers.tick(RECONNECT_MS);
    assert.equal(room.away[2], false);
});

test('missing the reconnect window makes the seat play itself', (t) => {
    const { manager, sockets, players, room } = startGame(t);
    manager.disconnect(sockets[2]);
    t.mock.timers.tick(RECONNECT_MS);
    assert.equal(room.away[2], true);
    assert.equal(players[2].gameId, null);
    assert.equal(manager.players.has(players[2].token), false);

    const fresh = fakeSocket();
    manager.hello(fresh, { token: players[2].token });
    assert.notEqual(fresh.last(S2C.WELCOME).token, players[2].token);
});

test('a second tab with the same token replaces the first', (t) => {
    const { manager, sockets, players } = setup(t);
    const second = fakeSocket();
    manager.hello(second, { token: players[0].token });
    assert.equal(sockets[0].closed, true);
    assert.equal(sockets[0].last(S2C.ERROR).reason, 'opened in another tab');
    manager.disconnect(sockets[0]);
    assert.equal(players[0].socket, second);
});

test('a full game runs until the wall is empty without losing tiles', (t) => {
    const { manager, sockets, players, room } = startGame(t);
    for (let i = 0; i < 200 && room.phase === 'playing'; i++) {
        const seat = room.state.currentTurn;
        manager.discard(players[seat], room.state.hands[seat][0]);
        const { wall, hands, discards } = room.state;
        assert.equal(wall.length + hands.flat().length + discards.flat().length, 144);
    }
    assert.equal(room.phase, 'over');
    assert.deepEqual(sockets[0].last(S2C.GAME_OVER), { winner: null, reason: 'wall empty' });
    assert.equal(sockets[0].last(S2C.GAME_STATE).currentTurn, null);
});

test('the room is deleted once everyone leaves', (t) => {
    const { manager, players, room } = startGame(t);
    for (const player of players) manager.leaveGame(player);
    assert.equal(manager.rooms.size, 0);
    assert.equal(room.timer, null);
});

test('leaving mid-game hands the seat to auto-discard', (t) => {
    const { manager, players, room } = startGame(t);
    const dealer = room.state.dealer;
    manager.leaveGame(players[dealer]);
    assert.equal(room.away[dealer], true);
    t.mock.timers.tick(AUTO_MS);
    assert.equal(room.state.currentTurn, (dealer + 1) % 4);
});
