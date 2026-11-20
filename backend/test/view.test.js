import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameView } from '../src/game/view.js';
import { createRound, discard, submitClaim } from '../src/game/engine.js';
import { buildWall } from '../src/game/tiles.js';

function round() {
    return createRound({ wall: buildWall().map((tile) => tile.tileId),
        clock: { now: () => 0, setTimeout: () => null, clearTimeout() {} } });
}

test('each snapshot includes only its own concealed tiles and public tiles', () => {
    const state = round();
    state.players[2].melds.push({ id: 0, kind: 'peng', fromSeat: 1, tiles: buildWall(['1WAN', '1WAN', '1WAN']) });
    state.players[3].specials.push(...buildWall(['FLO_1']));
    state.players[1].discards.push(...buildWall(['2BIN']));
    for (let seat = 0; seat < 4; seat++) {
        const view = createGameView(state, seat, 0);
        assert.deepEqual(view.ownHand, state.players[seat].concealed);
        assert.deepEqual(view.players.map((player) => player.concealedCount), [17, 16, 16, 16]);
        assert.deepEqual(view.players[2].melds, state.players[2].melds);
        assert.deepEqual(view.players[3].specials, state.players[3].specials);
        assert.deepEqual(view.players[1].discards, state.players[1].discards);
        assert.deepEqual(view.gold, state.gold);
        assert.equal(view.wallCount, state.wall.length);
        const serialized = JSON.stringify(view);
        const hidden = [...state.wall, ...state.skippedGoldSpecials,
            ...state.players.flatMap((player, index) => index === seat ? [] : player.concealed)];
        for (const tile of hidden) assert.ok(!serialized.includes(tile.id));
        assert.equal('wall' in view, false);
        assert.equal('skippedGoldSpecials' in view, false);
        assert.ok(view.players.every((player) => !('concealed' in player)));
        assert.equal(view.legalActions.discard, seat === 0);
    }
});

test('actions reflect phase, seat, deadline and private claim responses', () => {
    const state = round();
    discard(state, 0, state.players[0].concealed[0].id);
    assert.deepEqual(createGameView(state, 1, 0).pendingDiscard, state.pendingDiscard);
    assert.equal(createGameView(state, 0, 0).legalActions.pass, false);
    assert.equal(createGameView(state, 1, 0).legalActions.pass, true);
    submitClaim(state, 1, state.claimWindow.id, 'pass');
    assert.equal(createGameView(state, 1, 0).legalActions.pass, false);
    assert.equal(createGameView(state, 2, 0).legalActions.pass, true);
    assert.equal(createGameView(state, 2, 3500).legalActions.pass, false);
    assert.equal('claimWindow' in createGameView(state, 2, 0), false);
    state.phase = 'drawBack';
    state.currentSeat = 2;
    assert.equal(createGameView(state, 2, 0).legalActions.drawBack, true);
    assert.equal(createGameView(state, 1, 0).legalActions.drawBack, false);
    state.phase = 'drawFront';
    assert.equal(createGameView(state, 2, 0).legalActions.drawFront, true);
});

test('only the winner is revealed at round end, and exhaustion reveals nobody', () => {
    const state = round();
    state.phase = 'over';
    state.winner = 2;
    for (let seat = 0; seat < 4; seat++) {
        const view = createGameView(state, seat, 0);
        assert.deepEqual(view.revealedWinnerHand, state.players[2].concealed);
        assert.deepEqual(view.legalActions, { drawFront: false, drawBack: false, discard: false, claim: null, pass: false });
        for (let opponent = 0; opponent < 4; opponent++) {
            if (opponent === seat || opponent === 2) continue;
            for (const tile of state.players[opponent].concealed) assert.ok(!JSON.stringify(view).includes(tile.id));
        }
    }
    state.winner = null;
    assert.equal('revealedWinnerHand' in createGameView(state, 0, 0), false);
    assert.throws(() => createGameView(state, 4), /seat/);
});

test('best claim and retained Chi are offered only to the eligible recipient', () => {
    const state = round();
    state.players[1].concealed = buildWall(['1WAN', '2WAN']);
    state.players[2].concealed = buildWall(['3WAN', '3WAN', '3WAN']);
    state.pendingDiscard = { fromSeat: 0, tile: buildWall(['3WAN'])[0] };
    state.phase = 'claims';
    state.claimWindow = { id: 'window', deadline: 3500, choices: [null, null, null, null] };
    assert.equal(createGameView(state, 1, 0).legalActions.claim, 'chi');
    assert.equal(createGameView(state, 2, 0).legalActions.claim, 'kong');
    state.claimWindow = null;
    state.phase = 'drawFront';
    state.currentSeat = 1;
    state.retainedChi = { seat: 1, windowId: 'window', tileInstanceId: state.pendingDiscard.tile.id };
    assert.equal(createGameView(state, 1, 3500).legalActions.claim, 'chi');
    assert.deepEqual(createGameView(state, 1, 3500).retainedChi, state.retainedChi);
    for (const seat of [0, 2, 3]) {
        assert.equal(createGameView(state, seat, 3500).legalActions.claim, null);
        assert.equal(createGameView(state, seat, 3500).retainedChi, null);
    }
});

test('only the dealer is told which tile is their extra opening tile, until they discard', () => {
    const state = round();
    const dealerView = createGameView(state, state.dealerSeat);
    assert.ok(dealerView.ownHand.some((tile) => tile.id === dealerView.openingTileId));
    for (const seat of [1, 2, 3]) {
        const view = createGameView(state, seat);
        assert.equal(view.openingTileId, null);
        assert.ok(!JSON.stringify(view).includes(state.openingTileId));
    }
    discard(state, state.dealerSeat, state.players[state.dealerSeat].concealed[0].id);
    assert.equal(createGameView(state, state.dealerSeat).openingTileId, null);
});
