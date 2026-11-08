import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisualSeat, layoutHand, layoutPlayerHand, layoutDiscards, DISCARD_CAPACITY } from '../src/canvas/layout.js';

test('every viewer sees their own hand at the bottom and preserves cyclic seat order', () => {
    for (let viewer = 0; viewer < 4; viewer += 1) {
        for (let offset = 0; offset < 4; offset += 1) {
            const seat = (viewer + offset) % 4;
            assert.equal(getVisualSeat(seat, viewer), offset);
            const positions = layoutHand(seat, viewer, seat === 0 ? 17 : 16);
            assert.equal(positions.length, seat === 0 ? 17 : 16);
            assert.ok(positions.every(position => position.direction === ['south', 'east', 'north', 'west'][offset]));
            if (offset === 0) {
                assert.ok(positions.every(position => position.y === 178.22));
                assert.equal((positions[0].x + positions.at(-1).x) / 2, 192);
            }
        }
    }
});

test('hands use the planned reversed north row and outward overlapping side rows', () => {
    const north = layoutHand(2, 0, 16);
    assert.equal(north[0].x, 297);
    assert.equal(north.at(-1).x, 87);
    assert.equal(north[0].y, 41);
    for (const [seat, startX, endX] of [[1, 314, 362], [3, 70, 22]]) {
        const hand = layoutHand(seat, 0, 17);
        assert.equal(hand[0].x, startX);
        assert.equal(hand.at(-1).x, endX);
        assert.equal(hand[0].y, 53);
        assert.equal(hand.at(-1).y, 149);
    }
    assert.deepEqual(layoutHand(0, 0, 0), []);
});

test('five Kongs and a pair retain all 22 tiles within the table from every seat', () => {
    const melds = Array.from({ length: 5 }, () => ({ tiles: Array(4).fill({ identity: '1WAN' }) }));
    for (let viewer = 0; viewer < 4; viewer += 1) {
        const positions = layoutPlayerHand(0, viewer, 2, melds);
        assert.equal(positions.length, 22);
        assert.equal(positions.filter(item => item.meldIndex === null).length, 2);
        for (let index = 0; index < 5; index += 1) {
            assert.equal(positions.filter(item => item.meldIndex === index).length, 4);
        }
        for (const { x, y, scale } of positions) {
            assert.ok(x - 14 * scale >= 0 && x + 14 * scale <= 384);
            assert.ok(y - 16 * scale >= 0 && y + 16 * scale <= 216);
        }
    }
});

test('discard rows cap the visible pile and preserve existing positions as it grows', () => {
    for (let viewer = 0; viewer < 4; viewer += 1) {
        const full = layoutDiscards(0, viewer, 25);
        assert.equal(full.length, DISCARD_CAPACITY);
        assert.deepEqual(full.slice(0, 3), layoutDiscards(0, viewer, 3));
        assert.equal(new Set(full.map(({ x, y }) => `${x},${y}`)).size, DISCARD_CAPACITY);
    }
    assert.deepEqual(layoutDiscards(0, 0, 0), []);
});
