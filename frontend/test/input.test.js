import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findHandTileAt, toLogicalPoint } from '../src/canvas/input.js';
import { layoutPlayerHand } from '../src/canvas/layout.js';

const tile = (id, identity) => ({ id, identity });
const view = {
    viewerSeat: 2,
    ownHand: [tile('a', '1WAN'), tile('b', '2WAN'), tile('c', '3WAN')],
    players: [0, 1, 2, 3].map((seat) => ({
        seat,
        concealedCount: 3,
        melds: seat === 2 ? [{ tiles: [tile('m1', '5TAO'), tile('m2', '5TAO'), tile('m3', '5TAO')] }] : [],
    })),
};

test('clicking a local concealed tile selects it; melds, opponents and empty table do not', () => {
    const positions = layoutPlayerHand(2, 2, 3, view.players[2].melds);
    positions.slice(0, 3).forEach(({ x, y }, index) => {
        assert.equal(findHandTileAt(view, x, y), view.ownHand[index].id);
    });
    const meld = positions[3];
    assert.equal(findHandTileAt(view, meld.x, meld.y), null);
    const opponent = layoutPlayerHand(0, 2, 3)[0];
    assert.equal(findHandTileAt(view, opponent.x, opponent.y), null);
    assert.equal(findHandTileAt(view, 5, 5), null);
});

test('pointer positions map to logical table coordinates at any CSS size', () => {
    const canvas = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 768, height: 432 }) };
    assert.deepEqual(toLogicalPoint(canvas, { clientX: 100 + 384, clientY: 50 + 216 }), { x: 192, y: 108 });
});
