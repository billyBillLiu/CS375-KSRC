import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreWinner } from '../src/game/scoring.js';
import { createRound, applyClaim, drawFront } from '../src/game/engine.js';
import { buildWall } from '../src/game/tiles.js';
import { createGameView } from '../src/game/view.js';

const mixedHand = '1WAN 2WAN 3WAN 4WAN 5WAN 6WAN 2TAO 2TAO 2TAO 4TAO 5TAO 6TAO 7BIN 8BIN 9BIN 5BIN 5BIN';
function winningState(hand = mixedHand, kinds = [], specials = []) {
    return {
        phase: 'over', winner: 0, endReason: 'discard_claim', gold: null,
        players: [{ concealed: buildWall(hand.split(' ')),
            melds: kinds.map((kind) => ({ kind })), specials: buildWall(specials) }],
    };
}

test('scoring counts every meld once and the pair earns no points', () => {
    const state = winningState();
    const before = structuredClone(state);
    assert.deepEqual(scoreWinner(state), {
        runs: 4, triplets: 1, kongs: 0, specials: 0, basePoints: 6,
        specialMultiplier: 1, winMultiplier: 1, total: 6,
    });
    assert.deepEqual(state, before);
});

test('four specials triple the score and self-draw doubles it again', () => {
    const state = winningState(mixedHand, [], ['WIND_EAST', 'DRGN_RED', 'FLO_1', 'SZN_SPR']);
    state.endReason = 'self_draw';
    state.skippedGoldSpecials = buildWall(['FLO_2', 'FLO_3']);
    assert.equal(scoreWinner(state).total, 36);
    assert.equal(scoreWinner(state).specialMultiplier, 3);
});

test('claimed Kongs earn four points without also counting as a triplet', () => {
    const state = winningState('1WAN 2WAN 3WAN 5BIN 5BIN', ['kong', 'peng', 'chi', 'kong'], ['FLO_1']);
    assert.deepEqual(scoreWinner(state), {
        runs: 2, triplets: 1, kongs: 2, specials: 1, basePoints: 12,
        specialMultiplier: 1.5, winMultiplier: 1, total: 18,
    });
});

test('fractional scores are preserved and four concealed matching tiles are not a Kong', () => {
    const state = winningState('1WAN 1WAN 1WAN 1WAN 2WAN 3WAN 5BIN 5BIN', ['chi', 'chi', 'chi'], ['FLO_1']);
    assert.equal(scoreWinner(state).kongs, 0);
    assert.equal(scoreWinner(state).triplets, 1);
    const allRuns = winningState('1WAN 2WAN 3WAN 5BIN 5BIN', ['chi', 'chi', 'chi', 'chi'], ['FLO_1']);
    assert.equal(scoreWinner(allRuns).total, 7.5);
});

test('ambiguous concealed hands use the highest-scoring valid arrangement', () => {
    const state = winningState('1WAN 1WAN 1WAN 2WAN 2WAN 2WAN 3WAN 3WAN 3WAN 4TAO 5TAO 6TAO 7BIN 8BIN 9BIN 5TAO 5TAO');
    assert.equal(scoreWinner(state).basePoints, 8);
    assert.equal(scoreWinner(state).triplets, 3);
});

for (const hand of ['9BIN 8WAN 9WAN 2TAO 2TAO', '7WAN 9BIN 9WAN 2TAO 2TAO', '1WAN 2WAN 9BIN 2TAO 2TAO']) {
    test(`Gold substitutes in scored sequences: ${hand}`, () => {
        const state = winningState(hand, ['chi', 'chi', 'chi', 'chi']);
        state.gold = buildWall(['9BIN'])[0];
        assert.equal(scoreWinner(state).runs, 5);
    });
}

test('all-Gold melds maximize as triplets and a Gold pair adds no points', () => {
    const state = winningState('9BIN 9BIN 9BIN 2TAO 2TAO', ['chi', 'chi', 'chi', 'chi']);
    state.gold = buildWall(['9BIN'])[0];
    assert.equal(scoreWinner(state).basePoints, 6);
    state.players[0].concealed = buildWall(['1WAN', '2WAN', '3WAN', '9BIN', '9BIN']);
    assert.equal(scoreWinner(state).basePoints, 5);
});

test('unfinished, exhausted and abandoned rounds have no score', () => {
    for (const reason of ['wall_exhausted', 'player_disconnected', 'player_left']) {
        const state = winningState();
        state.endReason = reason;
        assert.equal(scoreWinner(state), null);
    }
    const state = winningState();
    state.winner = null;
    assert.equal(scoreWinner(state), null);
    state.winner = 0;
    state.phase = 'discard';
    assert.equal(scoreWinner(state), null);
});

test('a self-draw stores a score and only reveals the winner to other seats', () => {
    const state = createRound({ wall: buildWall().map((tile) => tile.tileId) });
    state.players[0].concealed = buildWall(mixedHand.split(' ').slice(0, -1));
    state.gold = null;
    state.wall = buildWall(['5BIN']);
    state.phase = 'drawFront';
    drawFront(state, 0);
    assert.equal(state.score.total, 12);
    for (let seat = 0; seat < 4; seat++) {
        const view = createGameView(state, seat);
        assert.deepEqual(view.score, state.score);
        for (let hidden = 1; hidden < 4; hidden++) {
            if (hidden === seat) continue;
            for (const tile of state.players[hidden].concealed) assert.ok(!JSON.stringify(view).includes(tile.id));
        }
    }
});

test('a discard win stores the single multiplier and cannot score again', () => {
    const state = createRound({ wall: buildWall().map((tile) => tile.tileId) });
    state.players[1].concealed = buildWall(mixedHand.split(' ').slice(0, -1));
    state.gold = null;
    state.phase = 'claims';
    state.pendingDiscard = { tile: buildWall(['5BIN'])[0], fromSeat: 0 };
    applyClaim(state, 1);
    assert.equal(state.score.total, 6);
    assert.throws(() => applyClaim(state, 1));
    assert.equal(state.score.total, 6);
});

test('a dealer opening win publishes and records one score for the winning seat', async () => {
    const { createRoomManager } = await import('../src/rooms/manager.js');
    const hand = mixedHand.split(' ');
    const goldFace = '9TAO';
    const remaining = buildWall().map((tile) => tile.tileId);
    for (const face of [...hand, goldFace]) remaining.splice(remaining.indexOf(face), 1);
    const wall = [];
    for (let packet = 0; packet < 4; packet++) {
        wall.push(...hand.slice(packet * 4, packet * 4 + 4), ...remaining.splice(0, 12));
    }
    wall.push(hand[16], ...remaining, goldFace);
    const records = [];
    const rooms = createRoomManager({
        createGame: (options) => createRound({ ...options, wall }),
        sessionDatabase: { save: (record) => records.push(record) },
    });
    const sockets = Array.from({ length: 4 }, () => ({ messages: [],
        send(raw) { this.messages.push(JSON.parse(raw)); } }));
    sockets.forEach((socket) => rooms.addConnection(socket));
    rooms.createRoom(sockets[0], 'Winner');
    sockets.slice(1).forEach((socket) => rooms.joinRoom(socket, '1', 'Opponent'));
    sockets.forEach((socket) => rooms.setReady(socket, true));
    assert.equal(records.filter((record) => record.rounds.length > 0).length, 1);
    const round = records.at(-1).rounds[0];
    assert.equal(round.winnerSeat, 0);
    assert.equal(round.score.total, 12);
    for (const socket of sockets) {
        const view = socket.messages.findLast((message) => message.type === 'snapshot').payload;
        assert.deepEqual(view.score, round.score);
        assert.ok(view.players.every((player) => !('score' in player)));
    }
});
