import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canWinWithTile, findChiTiles, getBestClaim, isWinningHand } from '../src/game/rules.js';
import { buildWall } from '../src/game/tiles.js';
import { createRoundState } from '../src/game/state.js';
import { createRound, discard } from '../src/game/engine.js';

function lockedMelds(count) {
    const melds = [];
    for (let id = 0; id < count; id++) {
        melds.push({ id, kind: 'peng', tiles: buildWall(Array(3).fill(`${id + 1}BIN`)), fromSeat: 1 });
    }
    return melds;
}

function playerWith(hand, melds = []) {
    return {
        concealed: buildWall(hand ? hand.split(' ') : []),
        melds,
        specials: [],
        discards: [],
    };
}

const fullHand = '1WAN 2WAN 3WAN 4WAN 5WAN 6WAN 2TAO 2TAO 2TAO 4TAO 5TAO 6TAO 7BIN 8BIN 9BIN 5BIN 5BIN';
const gold = buildWall(['9BIN'])[0];

test('five melds and a pair win, while an incomplete sequence does not', () => {
    assert.equal(isWinningHand(playerWith(fullHand)), true);
    assert.equal(isWinningHand(playerWith(fullHand.replace('9BIN', '1BIN'))), false);
});

test('the concealed tile count must match the remaining melds plus a pair', () => {
    assert.equal(isWinningHand(playerWith('')), false);
    assert.equal(isWinningHand(playerWith(fullHand.split(' ').slice(1).join(' '))), false);
    assert.equal(isWinningHand(playerWith(`${fullHand} 5WAN`)), false);
    const fourteenTiles = fullHand.split(' ').slice(3).join(' ');
    assert.equal(isWinningHand(playerWith(fourteenTiles)), false);
    assert.equal(isWinningHand(playerWith(fourteenTiles, lockedMelds(1))), true);
    assert.equal(isWinningHand(playerWith('1WAN 1WAN', lockedMelds(6))), false);
});

for (const scenario of [
    { position: 'start', sequence: '9BIN 8WAN 9WAN' },
    { position: 'middle', sequence: '7WAN 9BIN 9WAN' },
    { position: 'end', sequence: '1WAN 2WAN 9BIN' },
]) {
    test(`Gold can fill the ${scenario.position} of a sequence`, () => {
        const player = playerWith(`${scenario.sequence} 2TAO 2TAO`, lockedMelds(4));
        assert.equal(isWinningHand(player, gold), true);
        assert.equal(isWinningHand(player), false);
    });
}

test('Gold can complete triplets and a pair, including groups made entirely of Gold', () => {
    for (const hand of [
        '4WAN 4WAN 9BIN 2TAO 2TAO',
        '4WAN 9BIN 9BIN 2TAO 2TAO',
        '1WAN 2WAN 3WAN 2TAO 9BIN',
        '9BIN 9BIN 9BIN 2TAO 2TAO',
        '1WAN 2WAN 3WAN 9BIN 9BIN',
    ]) {
        assert.equal(isWinningHand(playerWith(hand, lockedMelds(4)), gold), true, hand);
    }
    assert.equal(isWinningHand(playerWith('9BIN 9BIN', lockedMelds(5)), gold), true);
});

test('Gold may represent its own face and matches copies by face rather than instance ID', () => {
    const player = playerWith('2WAN 3WAN 4WAN 2TAO 2TAO', lockedMelds(4));
    const indicator = buildWall(['3WAN'])[0];
    assert.notEqual(player.concealed[1].id, indicator.id);
    assert.equal(isWinningHand(player, indicator), true);
});

test('sequences cannot cross suits or wrap between ranks nine and one', () => {
    for (const hand of [
        '1WAN 2WAN 3TAO 5BIN 5BIN',
        '8WAN 9WAN 1TAO 5BIN 5BIN',
        '1WAN 9WAN 9BIN 5BIN 5BIN',
        '1WAN 5WAN 9BIN 5BIN 5BIN',
    ]) {
        assert.equal(isWinningHand(playerWith(hand, lockedMelds(4)), gold), false, hand);
    }
});

test('the solver backtracks when taking the first available pair cannot complete the hand', () => {
    assert.equal(isWinningHand(playerWith('1WAN 1WAN 1WAN 2WAN 2WAN', lockedMelds(4))), true);
});

test('a locked Kong counts as one meld despite containing four physical tiles', () => {
    const meld = { id: 0, kind: 'kong', tiles: buildWall(Array(4).fill('8TAO')), fromSeat: 1 };
    const hand = fullHand.split(' ').slice(3).join(' ');
    const player = playerWith(hand, [meld]);
    assert.equal(player.concealed.length + meld.tiles.length, 18);
    assert.equal(isWinningHand(player), true);
    player.concealed.pop();
    assert.equal(isWinningHand(player), false);
});

test('five locked melds leave only a pair to complete, and exposed tiles stay locked', () => {
    const melds = lockedMelds(5);
    melds[0] = { id: 0, kind: 'kong', tiles: buildWall(Array(4).fill('8TAO')), fromSeat: 1 };
    assert.equal(isWinningHand(playerWith('1WAN 1WAN', melds)), true);
    assert.equal(isWinningHand(playerWith('1WAN 2WAN', melds)), false);

    // Exposed Gold is not available to repair the mismatched concealed pair.
    melds[1] = { id: 1, kind: 'peng', tiles: buildWall(Array(3).fill('9BIN')), fromSeat: 1 };
    assert.equal(isWinningHand(playerWith('1WAN 2WAN', melds), gold), false);
});

test('a candidate tile can complete a win without entering or reordering the actual hand', () => {
    const player = playerWith('5BIN 5BIN 7BIN 8BIN 6TAO 5TAO 4TAO 2TAO 2TAO 2TAO 6WAN 5WAN 4WAN 3WAN 2WAN 1WAN');
    const before = structuredClone(player);
    Object.freeze(player.concealed);
    Object.freeze(player.melds);
    Object.freeze(player);
    const winningTile = buildWall(['9BIN'])[0];
    const losingTile = buildWall(['1BIN'])[0];
    assert.equal(isWinningHand(player), false);
    assert.equal(canWinWithTile(player, winningTile), true);
    assert.equal(canWinWithTile(player, losingTile), false);
    assert.deepEqual(player, before);
});

test('candidate Gold can complete a hand with locked melds', () => {
    const player = playerWith('4WAN', lockedMelds(5));
    const candidate = buildWall(['9BIN'])[0];
    assert.equal(canWinWithTile(player, candidate), false);
    assert.equal(canWinWithTile(player, candidate, gold), true);
    assert.equal(player.concealed.length, 1);
});

test('winning-hand checks preserve concealed order, melds, specials and discards', () => {
    const player = playerWith('2TAO 9BIN 9WAN 2TAO 8WAN', lockedMelds(4));
    player.specials = buildWall(['WIND_EAST', 'DRGN_RED', 'FLO_1', 'SZN_SPR']);
    player.discards = buildWall(['3WAN']);
    const before = structuredClone(player);
    Object.freeze(player.concealed);
    assert.equal(isWinningHand(player, gold), true);
    assert.equal(isWinningHand(player), false);
    assert.deepEqual(player, before);
});

function claimState(hand, discardFace, { seat = 1, fromSeat = 0, melds = [], goldFace = null } = {}) {
    const state = createRoundState({ wall: [] });
    state.players[seat] = playerWith(hand, melds);
    state.pendingDiscard = { tile: buildWall([discardFace])[0], fromSeat };
    state.gold = goldFace === null ? null : buildWall([goldFace])[0];
    state.currentSeat = fromSeat;
    state.phase = 'claims';
    return state;
}

test('a winning claim takes priority over Kong, Peng and Chi', () => {
    const hand = '1WAN 1WAN 1WAN 2WAN 3WAN 4WAN 5WAN 6WAN 2TAO 2TAO 2TAO 4TAO 5TAO 6TAO 5BIN 5BIN';
    const state = claimState(hand, '1WAN');
    assert.deepEqual(getBestClaim(state, 1), { kind: 'win', tiles: [] });
});

test('Kong takes priority over Peng and Chi and selects three owned matching instances', () => {
    const state = claimState('3WAN 1WAN 3WAN 2WAN 3WAN', '3WAN');
    const claim = getBestClaim(state, 1);
    assert.equal(claim.kind, 'kong');
    assert.deepEqual(claim.tiles, [state.players[1].concealed[0], state.players[1].concealed[2],
        state.players[1].concealed[4]]);
    assert.equal(new Set(claim.tiles.map((tile) => tile.id)).size, 3);
    assert.ok(!claim.tiles.includes(state.pendingDiscard.tile));
});

test('Peng takes priority over Chi and selects two owned matching instances', () => {
    const state = claimState('3WAN 1WAN 2WAN 3WAN 4WAN 5WAN', '3WAN');
    assert.deepEqual(getBestClaim(state, 1), {
        kind: 'peng', tiles: [state.players[1].concealed[0], state.players[1].concealed[3]],
    });
});

test('each seat gets its own best claim, even while currentSeat still names the discarder', () => {
    const state = claimState('4WAN 4WAN 4WAN', '4WAN', { seat: 0 });
    state.players[1] = playerWith('2WAN 3WAN');
    state.players[2] = playerWith('4WAN 4WAN 4WAN');
    state.players[3] = playerWith('4WAN 4WAN');
    assert.deepEqual(state.players.map((_, seat) => getBestClaim(state, seat)?.kind ?? null),
        [null, 'chi', 'kong', 'peng']);
});

test('only the next seat can Chi, including seat zero after seat three', () => {
    for (let fromSeat = 0; fromSeat < 4; fromSeat++) {
        const state = claimState('', '3WAN', { fromSeat });
        state.players = Array.from({ length: 4 }, () => playerWith('1WAN 2WAN'));
        for (let seat = 0; seat < 4; seat++) {
            const expected = seat === (fromSeat + 1) % 4 ? 'chi' : null;
            assert.equal(getBestClaim(state, seat)?.kind ?? null, expected);
        }
    }
});

test('Chi selects the first valid combination in Python order, regardless of hand order', () => {
    const state = claimState('5WAN 2WAN 4WAN 1WAN 2WAN 4WAN', '3WAN');
    assert.deepEqual(getBestClaim(state, 1), {
        kind: 'chi', tiles: [state.players[1].concealed[3], state.players[1].concealed[1]],
    });
});

test('Chi finds lower, split and upper pairs within each suit and rank boundary', () => {
    for (const suit of ['WAN', 'TAO', 'BIN']) {
        for (const [rank, pair] of [[3, [1, 2]], [3, [2, 4]], [3, [4, 5]], [1, [2, 3]], [9, [7, 8]]]) {
            const hand = pair.map((value) => `${value}${suit}`).join(' ');
            const state = claimState(hand, `${rank}${suit}`);
            const claim = getBestClaim(state, 1);
            assert.equal(claim.kind, 'chi');
            assert.deepEqual(claim.tiles.map((tile) => tile.tileId), hand.split(' '));
        }
    }
});

test('Chi cannot mix suits, wrap ranks or form sequences from specials', () => {
    for (const [hand, candidate] of [
        ['1WAN 2TAO', '3WAN'], ['8WAN 1WAN', '9WAN'], ['9WAN 2WAN', '1WAN'],
        ['WIND_EAST WIND_SOUTH', 'WIND_WEST'], ['DRGN_RED DRGN_GREEN', 'DRGN_WHITE'],
        ['FLO_1 FLO_2', 'FLO_3'], ['SZN_SPR SZN_SUM', 'SZN_AUT'],
    ]) {
        const state = claimState(hand, candidate);
        assert.equal(findChiTiles(state.players[1], state.pendingDiscard.tile), null);
        assert.equal(getBestClaim(state, 1), null);
    }
});

test('Gold cannot substitute for natural tiles in meld claims', () => {
    for (const [hand, expected] of [
        ['3WAN 9BIN', null], ['3WAN 3WAN 9BIN', 'peng'], ['1WAN 9BIN', null],
    ]) {
        const state = claimState(hand, '3WAN', { goldFace: '9BIN' });
        assert.equal(getBestClaim(state, 1)?.kind ?? null, expected);
    }
});

test('Gold in the hand or discard can participate in a meld using its printed face', () => {
    for (const [hand, candidate, goldFace, expected] of [
        ['1WAN 2WAN', '3WAN', '2WAN', 'chi'],
        ['1WAN 3WAN', '2WAN', '2WAN', 'chi'],
        ['3WAN 3WAN', '3WAN', '3WAN', 'peng'],
    ]) {
        const state = claimState(hand, candidate, { goldFace });
        assert.equal(getBestClaim(state, 1).kind, expected);
    }
});

test('any other seat can claim a Gold-assisted win with a locked Kong', () => {
    for (let seat = 0; seat < 4; seat++) {
        const melds = lockedMelds(4);
        melds[0] = { id: 0, kind: 'kong', tiles: buildWall(Array(4).fill('8TAO')), fromSeat: 2 };
        for (const [hand, candidate] of [['8WAN 9WAN 9BIN 2TAO', '2TAO'], ['7WAN 8WAN 2TAO 2TAO', '9BIN']]) {
            const state = claimState(hand, candidate,
                { seat, fromSeat: (seat + 1) % 4, melds, goldFace: '9BIN' });
            assert.deepEqual(getBestClaim(state, seat), { kind: 'win', tiles: [] });
        }
    }
});

test('claims are unavailable for the discarder, outside claims phase or without a pending tile', () => {
    const state = claimState(fullHand.split(' ').slice(0, -1).join(' '), '5BIN');
    state.pendingDiscard.fromSeat = 1;
    assert.equal(getBestClaim(state, 1), null);
    state.pendingDiscard.fromSeat = 0;
    for (const phase of ['setup', 'drawFront', 'drawBack', 'discard', 'over']) {
        state.phase = phase;
        assert.equal(getBestClaim(state, 1), null);
    }
    state.phase = 'claims';
    state.pendingDiscard = null;
    assert.equal(getBestClaim(state, 1), null);
});

test('claim queries reject invalid seats without changing state', () => {
    const state = claimState('3WAN 3WAN', '3WAN');
    const before = structuredClone(state);
    for (const seat of [-1, 4, 1.5, '1', NaN, null, undefined]) {
        assert.throws(() => getBestClaim(state, seat), /Player seat/);
        assert.deepEqual(state, before);
    }
});

test('claimed melds and public piles cannot supply tiles for another meld claim', () => {
    for (const hand of ['3WAN', '1WAN']) {
        const state = claimState(hand, '3WAN');
        const player = state.players[1];
        player.melds = [{ id: 0, kind: 'peng', tiles: buildWall(Array(3).fill('2WAN')), fromSeat: 0 }];
        player.discards = buildWall(['2WAN', '3WAN', '3WAN']);
        player.specials = buildWall(['WIND_EAST']);
        state.players[2] = playerWith('2WAN 3WAN 3WAN');
        assert.equal(getBestClaim(state, 1), null);
    }
});

test('a real discard exposes claims without changing hands or transferring any tiles', () => {
    const wall = buildWall().map((tile) => tile.tileId);
    [wall[4], wall[8]] = [wall[8], wall[4]];
    const state = createRound({ wall });
    discard(state, 0, state.players[0].concealed[0].id);
    const before = structuredClone(state);
    Object.freeze(state.players[1].concealed);
    const claim = getBestClaim(state, 1);
    assert.equal(claim.kind, 'chi');
    assert.deepEqual(claim.tiles.map((tile) => tile.tileId), ['2WAN', '3WAN']);
    assert.ok(claim.tiles.every((tile) => state.players[1].concealed.includes(tile)));
    assert.equal(getBestClaim(state, 0), null);
    assert.equal(getBestClaim(state, 2), null);
    assert.equal(getBestClaim(state, 3), null);
    assert.deepEqual(state, before);
    claim.tiles.pop();
    assert.deepEqual(state, before);
    assert.equal(getBestClaim(state, 1).tiles.length, 2);
});
