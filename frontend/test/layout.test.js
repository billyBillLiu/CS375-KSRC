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

test('revealing melds preserves continuous hand slots from every viewer seat', () => {
    for (const [concealedCount, meldSizes] of [[13, [3]], [10, [3, 4]], [2, [4, 4, 4, 4, 4]]]) {
        const melds = meldSizes.map(count => ({ tiles: Array(count).fill({ identity: '1WAN' }) }));
        const totalCount = concealedCount + meldSizes.reduce((total, count) => total + count, 0);
        for (let viewer = 0; viewer < 4; viewer += 1) {
            for (let seat = 0; seat < 4; seat += 1) {
                const geometry = positions => positions.map(({ x, y, scale, direction }) => ({ x, y, scale, direction }));
                const expected = geometry(layoutPlayerHand(seat, viewer, totalCount));
                for (const position of expected.slice(concealedCount)) {
                    if (position.direction === 'east') position.x -= 3 * position.scale;
                    if (position.direction === 'west') position.x += 3 * position.scale;
                }
                assert.deepEqual(
                    geometry(layoutPlayerHand(seat, viewer, concealedCount, melds)),
                    expected,
                );
            }
        }
    }
});

test('opponent melds read in rank order along their artwork', () => {
    const melds = [{ tiles: Array(3).fill({ identity: '1WAN' }) }];
    // Screen order (left-to-right, or top-to-bottom on side seats) of meld tile indexes.
    const north = layoutPlayerHand(2, 0, 3, melds).filter(item => item.meldIndex === 0)
        .sort((a, b) => a.x - b.x).map(item => item.tileIndex);
    assert.deepEqual(north, [0, 1, 2]);
    for (const [seat, expected] of [[1, [2, 1, 0]], [3, [0, 1, 2]]]) {
        const meld = layoutPlayerHand(seat, 0, 13, melds).filter(item => item.meldIndex === 0)
            .sort((a, b) => a.y - b.y);
        assert.deepEqual(meld.map(item => item.tileIndex), expected);
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
