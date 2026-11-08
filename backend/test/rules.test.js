import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canWinWithTile, isWinningHand } from '../src/game/rules.js';
import { buildWall } from '../src/game/tiles.js';

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
