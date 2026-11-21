import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableView, getDiscardDisplay } from '../src/game/view.js';
import { createGameView } from '../../backend/src/game/view.js';
import { createRound } from '../../backend/src/game/engine.js';
import { buildWall } from '../../backend/src/game/tiles.js';
import { layoutHand } from '../src/canvas/layout.js';

test('only viewers with a legal Chi, Peng, Kong or win see the pending discard in the center', () => {
    const pendingDiscard = { seat: 2, tile: { id: 'pending', identity: '3WAN' } };
    const players = Array.from({ length: 4 }, (_, seat) => ({
        seat, discards: [{ id: `discard-${seat}`, identity: '1BIN' }],
    }));
    for (const claim of ['chi', 'peng', 'kong', 'win']) {
        for (let viewerSeat = 0; viewerSeat < 4; viewerSeat += 1) {
            const eligible = viewerSeat === 3;
            const view = { viewerSeat, players, pendingDiscard, legalActions: { claim: eligible ? claim : null } };
            const original = structuredClone(view);
            const { centerDiscard, piles } = getDiscardDisplay(view);
            assert.deepEqual(centerDiscard, eligible ? pendingDiscard : null);
            for (const pile of piles) {
                const expectedIds = [`discard-${pile.seat}`];
                if (!eligible && pile.seat === 2) expectedIds.push('pending');
                assert.deepEqual(pile.tiles.map(tile => tile.id), expectedIds);
            }
            assert.deepEqual(view, original);
        }
    }
});

test('passing puts the discard in its corner and retained Chi makes it available in the center again', () => {
    const view = {
        viewerSeat: 1, phase: 'claims', legalActions: { claim: 'chi' },
        pendingDiscard: { seat: 0, tile: { id: 'pending', identity: '3WAN' } },
        players: [{ seat: 0, discards: [] }],
    };
    assert.equal(getDiscardDisplay(view).centerDiscard.tile.id, 'pending');
    const passed = getDiscardDisplay({ ...view, legalActions: { claim: null } });
    assert.equal(passed.centerDiscard, null);
    assert.deepEqual(passed.piles[0].tiles.map(tile => tile.id), ['pending']);
    const retained = getDiscardDisplay({ ...view, phase: 'drawFront', retainedChi: { seat: 1 } });
    assert.equal(retained.centerDiscard.tile.id, 'pending');
    assert.deepEqual(retained.piles[0].tiles, []);
});

test('a provisional corner discard disappears when claimed and appears only once when settled', () => {
    const tile = { id: 'pending', identity: '3WAN' };
    const view = {
        viewerSeat: 0, legalActions: { claim: null }, pendingDiscard: { seat: 0, tile },
        players: [{ seat: 0, discards: [] }],
    };
    assert.deepEqual(getDiscardDisplay(view).piles[0].tiles, [tile]);
    const claimed = getDiscardDisplay({ ...view, pendingDiscard: null });
    assert.equal(claimed.centerDiscard, null);
    assert.deepEqual(claimed.piles[0].tiles, []);
    const settled = getDiscardDisplay({ ...view, pendingDiscard: null, players: [{ seat: 0, discards: [tile] }] });
    assert.equal(settled.centerDiscard, null);
    assert.deepEqual(settled.piles[0].tiles, [tile]);
    assert.deepEqual(view.players[0].discards, []);
});

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

test('the drawn tile is the one new local tile and stays marked until discarded or the turn ends', async () => {
    const { findDrawnTileId } = await import('../src/game/view.js');
    const tile = (id) => ({ id, identity: '1WAN' });
    const view = (ids, extra = {}) => ({ roundId: 'r', viewerSeat: 1, currentSeat: 1, phase: 'discard',
        ownHand: ids.map(tile), ...extra });
    const before = view(['a', 'b'], { phase: 'drawFront' });
    const drawn = view(['a', 'b', 'c']);
    drawn.drawnTileId = findDrawnTileId(before, drawn);
    assert.equal(drawn.drawnTileId, 'c');
    assert.equal(findDrawnTileId(drawn, view(['a', 'b', 'c'])), 'c');
    assert.equal(findDrawnTileId(drawn, view(['a', 'b'], { phase: 'claims' })), null);
    assert.equal(findDrawnTileId(drawn, view(['a', 'b', 'c'], { currentSeat: 2 })), null);
    assert.equal(findDrawnTileId(null, drawn), null);
    assert.equal(findDrawnTileId(before, view(['a', 'b', 'c'], { roundId: 'new' })), null);
    assert.equal(findDrawnTileId(view(['a', 'b', 'x', 'y']), view(['a', 'b', 'c'])), 'c');
});

test('specials drawn this turn are all marked until the turn ends', async () => {
    const { findDrawnSpecialIds } = await import('../src/game/view.js');
    const view = (specials, extra = {}) => ({ roundId: 'r', viewerSeat: 0, currentSeat: 0, phase: 'drawBack',
        players: [{ specials: specials.map((id) => ({ id, identity: 'FLO_1' })) }], ...extra });
    const start = view(['s0'], { phase: 'drawFront' });
    const first = view(['s0', 's1']);
    first.drawnSpecialIds = findDrawnSpecialIds(start, first);
    assert.deepEqual(first.drawnSpecialIds, ['s1']);
    const second = view(['s0', 's1', 's2'], { phase: 'discard' });
    second.drawnSpecialIds = findDrawnSpecialIds(first, second);
    assert.deepEqual(second.drawnSpecialIds, ['s1', 's2']);
    assert.deepEqual(findDrawnSpecialIds(second, view(['s0', 's1', 's2'], { phase: 'claims' })), []);
    assert.deepEqual(findDrawnSpecialIds(null, first), []);
});

test('meld tiles are shown in rank order, not claim order', () => {
    const snapshot = {
        you: 0, currentSeat: 0, phase: 'discard', wallCount: 0, ownHand: [], gold: null, pendingDiscard: null,
        players: [{ seat: 0, concealedCount: 0, specials: [], discards: [], melds: [{ id: 1, kind: 'chi', fromSeat: 3,
            tiles: ['8WAN', '7WAN', '9WAN'].map((tileId, index) => ({ id: `t${index}`, tileId })) }] }],
    };
    const identities = createTableView(snapshot).players[0].melds[0].tiles.map(tile => tile.identity);
    assert.deepEqual(identities, ['7WAN', '8WAN', '9WAN']);
});

test('the dealer\'s extra opening tile is marked on the first snapshot and dropped after the turn', async () => {
    const { findDrawnTileId } = await import('../src/game/view.js');
    const tile = (id) => ({ id, identity: '1WAN' });
    const opening = { roundId: 'r', viewerSeat: 0, currentSeat: 0, phase: 'discard', openingTileId: 'q',
        ownHand: ['a', 'q', 'z'].map(tile) };
    assert.equal(findDrawnTileId(null, opening), 'q');
    assert.equal(findDrawnTileId(null, { ...opening, viewerSeat: 1 }), null);
    assert.equal(findDrawnTileId(opening, { ...opening, phase: 'claims', openingTileId: null }), null);
});
