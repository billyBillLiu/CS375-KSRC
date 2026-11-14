import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableView } from '../src/game/view.js';
import { createGameView } from '../../backend/src/game/view.js';
import { createRound } from '../../backend/src/game/engine.js';
import { buildWall } from '../../backend/src/game/tiles.js';
import { layoutHand } from '../src/canvas/layout.js';

test('real snapshots preserve private hands, absolute ownership and shared public tiles for every viewer', () => {
    const state = createRound({ wall: buildWall().map(tile => tile.tileId) });
    const views = [];
    for (let seat = 0; seat < 4; seat += 1) {
        const snapshot = createGameView(state, seat, 0);
        const original = structuredClone(snapshot);
        const view = createTableView(snapshot);
        views.push(view);
        assert.deepEqual(snapshot, original);
        assert.equal(view.viewerSeat, seat);
        assert.deepEqual(new Set(view.ownHand.map(tile => tile.id)),
            new Set(state.players[seat].concealed.map(tile => tile.id)));
        assert.ok(layoutHand(seat, view.viewerSeat, view.ownHand.length)
            .every(position => position.direction === 'south'));
        assert.ok(view.players.every(player => !('hand' in player)));
        assert.equal(view.wallCount, state.wall.length);
        assert.equal(view.currentSeat, state.currentSeat);
    }
    for (const view of views) {
        assert.deepEqual(view.players, views[0].players);
        assert.deepEqual(view.goldIndicator, views[0].goldIndicator);
    }
});

test('maps melds and pending discards and sorts only the local hand without losing physical IDs', () => {
    const tile = (id, tileId) => ({ id, tileId });
    const snapshot = {
        you: 3, currentSeat: 1, phase: 'claims', wallCount: 0, gold: null,
        ownHand: [tile('a', '9BIN'), tile('b', '2WAN'), tile('c', '1TAO'), tile('d', '2WAN')],
        pendingDiscard: { fromSeat: 1, tile: tile('e', '3WAN') },
        players: [{ seat: 1, concealedCount: 13,
            melds: [{ id: 'meld', kind: 'peng', fromSeat: 2, tiles: [tile('f', '4BIN')] }],
            specials: [tile('g', 'WIND_EAST')], discards: [tile('h', '1BIN')] }],
    };
    const view = createTableView(snapshot);
    assert.deepEqual(view.ownHand.map(tile => tile.id), ['b', 'd', 'c', 'a']);
    assert.equal(view.pendingDiscard.seat, 1);
    assert.equal(view.pendingDiscard.tile.identity, '3WAN');
    assert.equal(view.players[0].melds[0].type, 'peng');
    assert.equal(view.players[0].melds[0].tiles[0].identity, '4BIN');
    assert.equal(view.players[0].specials[0].identity, 'WIND_EAST');
    assert.equal(view.players[0].discards[0].identity, '1BIN');
    assert.equal(view.wallCount, 0);
    assert.equal(view.goldIndicator, null);
});
