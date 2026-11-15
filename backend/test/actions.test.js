import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../src/game/engine.js';
import { buildWall } from '../src/game/tiles.js';
import { createRoomManager } from '../src/rooms/manager.js';
import { SERVER_MESSAGES } from '../../shared/protocol.js';

const NEUTRAL = '1BIN 1BIN 1BIN 2BIN 2BIN 2BIN 4BIN 4BIN 4BIN 6BIN 6BIN 6BIN 8BIN 8BIN 8BIN 9BIN';
const CHI = '1WAN 2WAN 2WAN 4WAN 5WAN 7WAN 8WAN 1TAO 3TAO 5TAO 7TAO 1BIN 3BIN 5BIN 7BIN 9BIN';
const PENG = '3WAN 3WAN 1WAN 2WAN 4WAN 5WAN 7WAN 8WAN 1TAO 3TAO 5TAO 7TAO 1BIN 3BIN 5BIN 7BIN';

function fakeSocket() {
    const sent = [];
    return {
        sent,
        send: (data) => sent.push(JSON.parse(data)),
        last(type) { return sent.findLast((message) => message.type === type)?.payload; },
    };
}

// Seat 0 holds 3WAN to discard; seat 1 can Chi it and seat 2 can Peng it.
function startRound() {
    let time = 0;
    let expire = null;
    let state;
    const clock = { now: () => time, setTimeout(callback) { expire = callback; return 1; }, clearTimeout() {} };
    const rooms = createRoomManager({ now: () => time, createGame(options) {
        state = createRound({ ...options, wall: buildWall().map((tile) => tile.tileId), clock });
        const hands = [`${NEUTRAL} 3WAN`, CHI, PENG, NEUTRAL];
        hands.forEach((hand, seat) => { state.players[seat].concealed = buildWall(hand.split(' ')); });
        state.gold = buildWall(['9TAO'])[0];
        return state;
    } });
    const sockets = Array.from({ length: 4 }, () => {
        const socket = fakeSocket();
        rooms.addConnection(socket);
        return socket;
    });
    rooms.createRoom(sockets[0], 'A');
    for (const socket of sockets.slice(1)) rooms.joinRoom(socket, '1', 'B');
    for (const socket of sockets) rooms.setReady(socket, true);
    const roundId = sockets[0].last(SERVER_MESSAGES.SNAPSHOT).roundId;
    let nextRequest = 0;
    function act(seat, action) {
        const requestId = action.requestId ?? `r${nextRequest++}`;
        rooms.playerAction(sockets[seat], { roundId, ...action, requestId });
        return sockets[seat].last(SERVER_MESSAGES.ACTION_RESULT);
    }
    function expireWindow() {
        time += 3500;
        expire();
    }
    return { rooms, sockets, act, expireWindow, get state() { return state; }, roundId };
}

test('an accepted discard updates every player and a repeated request ID is not applied twice', () => {
    const round = startRound();
    const tileId = round.state.players[0].concealed.find((tile) => tile.tileId === '3WAN').id;
    const result = round.act(0, { kind: 'discard', tileId, requestId: 'same' });
    assert.deepEqual(result, { requestId: 'same', accepted: true });
    for (const socket of round.sockets) {
        assert.equal(socket.last(SERVER_MESSAGES.SNAPSHOT).pendingDiscard.tile.id, tileId);
    }
    const snapshotsBefore = round.sockets[0].sent.length;
    const handBefore = round.state.players[0].concealed.length;
    assert.deepEqual(round.act(0, { kind: 'discard', tileId, requestId: 'same' }), result);
    assert.equal(round.state.players[0].concealed.length, handBefore);
    // Only the replayed result is sent; no new snapshot goes out.
    assert.equal(round.sockets[0].sent.length, snapshotsBefore + 1);
});

test('illegal, unowned and earlier-round actions are rejected without changing state', () => {
    const round = startRound();
    const opponentTile = round.state.players[1].concealed[0].id;
    const before = structuredClone(round.state);
    const rejections = [
        [1, { kind: 'discard', tileId: opponentTile }, /not this player's turn/],
        [0, { kind: 'discard', tileId: opponentTile }, /not in this player's concealed hand/],
        [0, { kind: 'drawFront' }, /Cannot drawFront during discard/],
        [0, { kind: 'discard', tileId: round.state.players[0].concealed[0].id, roundId: 'old' }, /earlier round/],
        [0, { kind: 'fly' }, /unknown action/],
    ];
    for (const [seat, action, reason] of rejections) {
        const result = round.act(seat, action);
        assert.equal(result.accepted, false);
        assert.match(result.reason, reason);
    }
    assert.deepEqual(round.state, before);
});

test('concurrent valid claims stay valid after another claim updates the snapshot', () => {
    const round = startRound();
    const tileId = round.state.players[0].concealed.find((tile) => tile.tileId === '3WAN').id;
    round.act(0, { kind: 'discard', tileId });
    const windowId = round.sockets[1].last(SERVER_MESSAGES.SNAPSHOT).claimWindowId;
    assert.equal(round.sockets[1].last(SERVER_MESSAGES.SNAPSHOT).legalActions.claim, 'chi');
    assert.equal(round.sockets[2].last(SERVER_MESSAGES.SNAPSHOT).legalActions.claim, 'peng');

    assert.equal(round.act(1, { kind: 'claim', windowId }).accepted, true);
    assert.equal(round.act(2, { kind: 'claim', windowId }).accepted, true);
    assert.equal(round.act(3, { kind: 'pass', windowId }).accepted, true);
    assert.equal(round.act(3, { kind: 'pass', windowId }).reason, 'This seat has already responded');
    assert.equal(round.act(0, { kind: 'pass', windowId }).accepted, false);

    round.expireWindow();
    const snapshot = round.sockets[0].last(SERVER_MESSAGES.SNAPSHOT);
    assert.equal(snapshot.currentSeat, 2);
    assert.equal(snapshot.players[2].melds[0].kind, 'peng');
    assert.equal(round.act(1, { kind: 'claim', windowId }).accepted, false);
});

test('a timed-out Chi can still be claimed on the next seat\'s turn, then they discard', () => {
    const round = startRound();
    round.state.players[2].concealed = buildWall(NEUTRAL.split(' '));
    const tileId = round.state.players[0].concealed.find((tile) => tile.tileId === '3WAN').id;
    round.act(0, { kind: 'discard', tileId });
    round.expireWindow();
    const snapshot = round.sockets[1].last(SERVER_MESSAGES.SNAPSHOT);
    assert.equal(snapshot.phase, 'drawFront');
    assert.equal(snapshot.legalActions.claim, 'chi');
    assert.equal(round.act(1, { kind: 'claim', windowId: snapshot.retainedChi.windowId }).accepted, true);
    assert.equal(round.state.players[1].melds[0].kind, 'chi');
    assert.equal(round.sockets[1].last(SERVER_MESSAGES.SNAPSHOT).legalActions.discard, true);
});

test('actions outside a round or without a request ID are rejected', () => {
    const rooms = createRoomManager();
    const socket = fakeSocket();
    rooms.addConnection(socket);
    assert.throws(() => rooms.playerAction(socket, { kind: 'drawFront' }), /request ID/);
    rooms.playerAction(socket, { requestId: 'x', kind: 'drawFront' });
    assert.deepEqual(socket.last(SERVER_MESSAGES.ACTION_RESULT), { requestId: 'x', accepted: false, reason: 'not in a room' });
    rooms.createRoom(socket, 'A');
    rooms.playerAction(socket, { requestId: 'y', kind: 'drawFront' });
    assert.equal(socket.last(SERVER_MESSAGES.ACTION_RESULT).reason, 'no round in progress');
});
