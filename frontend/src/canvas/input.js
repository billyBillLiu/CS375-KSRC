import { HAND_TILE_HEIGHT, HAND_TILE_WIDTH, TABLE_HEIGHT, TABLE_WIDTH, layoutPlayerHand } from './layout.js';

// Converts a pointer event to the 384×216 logical table, whatever the CSS size.
export function toLogicalPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * TABLE_WIDTH / rect.width,
        y: (event.clientY - rect.top) * TABLE_HEIGHT / rect.height,
    };
}

// Returns the instance ID of the local concealed tile under the point, or null.
// Only the viewer's concealed tiles are selectable; melds and opponents are ignored.
export function findHandTileAt(view, x, y) {
    const local = view.players.find((player) => player.seat === view.viewerSeat);
    if (!local) return null;
    const positions = layoutPlayerHand(local.seat, view.viewerSeat, view.ownHand.length, local.melds);
    // Later tiles are drawn on top, so check them first.
    for (let index = positions.length - 1; index >= 0; index--) {
        const { x: tileX, y: tileY, scale, tileIndex, meldIndex } = positions[index];
        if (meldIndex !== null) continue;
        if (Math.abs(x - tileX) <= HAND_TILE_WIDTH * scale / 2
            && Math.abs(y - tileY) <= HAND_TILE_HEIGHT * scale / 2) {
            return view.ownHand[tileIndex].id;
        }
    }
    return null;
}
