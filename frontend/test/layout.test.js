import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisualSeat, layoutHand } from '../src/canvas/layout.js';

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
