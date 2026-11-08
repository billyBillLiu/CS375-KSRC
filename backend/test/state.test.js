import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWall } from '../src/game/tiles.js';
import { createRoundState } from '../src/game/state.js';

test('a new wall has the Python inventory of 144 tiles and 42 faces', () => {
    const wall = buildWall();
    const counts = new Map();
    for (const tile of wall) {
        counts.set(tile.tileId, (counts.get(tile.tileId) ?? 0) + 1);
    }

    const expected = new Map();
    for (const suit of ['WAN', 'TAO', 'BIN']) {
        for (let rank = 1; rank <= 9; rank++) expected.set(`${rank}${suit}`, 4);
    }
    for (const face of [
        'WIND_EAST', 'WIND_SOUTH', 'WIND_WEST', 'WIND_NORTH',
        'DRGN_RED', 'DRGN_GREEN', 'DRGN_WHITE',
    ]) {
        expected.set(face, 4);
    }
    for (const face of [
        'FLO_1', 'FLO_2', 'FLO_3', 'FLO_4',
        'SZN_SPR', 'SZN_SUM', 'SZN_AUT', 'SZN_WNT',
    ]) {
        expected.set(face, 1);
    }

    assert.equal(wall.length, 144);
    assert.equal(counts.size, 42);
    assert.deepEqual(counts, expected);
});

test('physical tiles have unique opaque IDs, including copies of the same face', () => {
    const wall = buildWall();
    const ids = wall.map((tile) => tile.id);
    assert.equal(new Set(ids).size, 144);
    for (const id of ids) {
        assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }

    const anotherWall = buildWall();
    assert.deepEqual(anotherWall.map((tile) => tile.tileId), wall.map((tile) => tile.tileId));
    assert.equal(new Set([...ids, ...anotherWall.map((tile) => tile.id)]).size, 288);
});

test('a new round owns all 144 tiles in its wall before setup', () => {
    const state = createRoundState();
    assert.equal(state.wall.length, 144);
    assert.equal(new Set(state.wall.map((tile) => tile.id)).size, 144);
    assert.equal(state.players.length, 4);
    for (const player of state.players) {
        assert.deepEqual(player, { concealed: [], melds: [], specials: [], discards: [] });
    }
    assert.equal(state.dealerSeat, 0);
    assert.equal(state.currentSeat, 0);
    assert.equal(state.phase, 'setup');
    assert.equal(state.pendingDiscard, null);
    assert.equal(state.gold, null);
    assert.deepEqual(state.skippedGoldSpecials, []);
    assert.equal(state.nextMeldId, 0);
    assert.equal(state.winner, null);
    assert.equal(state.endReason, null);
});

test('players and rounds never share mutable ownership containers', () => {
    const first = createRoundState();
    const second = createRoundState();
    const containers = [first, second].flatMap((state) => [
        state.wall,
        state.skippedGoldSpecials,
        ...state.players.flatMap((player) => [
            player.concealed, player.melds, player.specials, player.discards,
        ]),
    ]);
    assert.equal(new Set(containers).size, containers.length);
    assert.equal(new Set([...first.players, ...second.players]).size, 8);

    first.players[0].concealed.push(first.wall.shift());
    assert.equal(first.players[0].concealed.length, 1);
    for (const player of first.players.slice(1)) assert.equal(player.concealed.length, 0);
    assert.equal(second.players[0].concealed.length, 0);
    assert.equal(second.wall.length, 144);
});
