import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canWinWithTile, isWinningHand } from '../src/game/rules.js';

// Five melds plus a pair: 111WAN 234WAN 567TAO 345BIN 999BIN + 77TAO.
const WINNING_HAND = [
    '1WAN', '1WAN', '1WAN', '2WAN', '3WAN', '4WAN', '5TAO', '6TAO', '7TAO',
    '3BIN', '4BIN', '5BIN', '9BIN', '9BIN', '9BIN', '7TAO', '7TAO',
];
const GOLD = '8BIN';

// Replaces one copy of `face` with the Gold tile.
function withGoldFor(hand, face) {
    const copy = [...hand];
    copy[copy.indexOf(face)] = GOLD;
    return copy;
}

test('five melds plus a pair wins', () => {
    assert.equal(isWinningHand(WINNING_HAND, 0, null), true);
});

test('a hand with one stray tile does not win', () => {
    const hand = [...WINNING_HAND];
    hand[hand.indexOf('4WAN')] = '6WAN';
    assert.equal(isWinningHand(hand, 0, null), false);
});

test('a hand with the wrong tile count does not win', () => {
    assert.equal(isWinningHand(WINNING_HAND.slice(1), 0, null), false);
});

test('Gold substitutes at the start, middle and end of a sequence', () => {
    for (const face of ['2WAN', '3WAN', '4WAN']) {
        assert.equal(isWinningHand(withGoldFor(WINNING_HAND, face), 0, GOLD), true, `Gold for ${face}`);
    }
});

test('Gold completes the pair and triplets', () => {
    assert.equal(isWinningHand(withGoldFor(WINNING_HAND, '7TAO'), 0, GOLD), true);
    const twoGolds = withGoldFor(withGoldFor(WINNING_HAND, '9BIN'), '9BIN');
    assert.equal(isWinningHand(twoGolds, 0, GOLD), true);
});

test('a Gold face is a normal tile before Gold is revealed', () => {
    assert.equal(isWinningHand(withGoldFor(WINNING_HAND, '3WAN'), 0, null), false);
});

test('a locked Kong counts as one meld', () => {
    // 111WAN is claimed as a Kong; the concealed hand needs four melds plus a pair.
    const concealed = WINNING_HAND.slice(3);
    assert.equal(isWinningHand(concealed, 1, null), true);
    assert.equal(isWinningHand(concealed, 0, null), false);
});

test('more locked melds than a hand allows never wins', () => {
    assert.equal(isWinningHand([], 6, null), false);
});

test('canWinWithTile checks the hand plus a candidate discard', () => {
    const waiting = WINNING_HAND.slice(0, -1);
    assert.equal(canWinWithTile(waiting, 0, null, '7TAO'), true);
    assert.equal(canWinWithTile(waiting, 0, null, '1BIN'), false);
});
