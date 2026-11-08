import { randomUUID } from 'node:crypto';

// suited tiles
const suitedTileIds = [];
for (const suit of ['WAN', 'TAO', 'BIN']) {
    for (let rank = 1; rank <= 9; rank++) {
        suitedTileIds.push(`${rank}${suit}`);
    }
}

// append suited tiles with special tiles to get all 42 in a list
export const TILE_IDS = Object.freeze([
    ...suitedTileIds,
    'WIND_EAST', 'WIND_SOUTH', 'WIND_WEST', 'WIND_NORTH',
    'DRGN_RED', 'DRGN_GREEN', 'DRGN_WHITE',
    'FLO_1', 'FLO_2', 'FLO_3', 'FLO_4',
    'SZN_SPR', 'SZN_SUM', 'SZN_AUT', 'SZN_WNT',
]);

// Matches the Python inventory order; the engine will shuffle before dealing.
export function buildWall() {
    const wall = [];
    for (const tileId of TILE_IDS) {
        const count = tileId.startsWith('FLO_') || tileId.startsWith('SZN_') ? 1 : 4;
        for (let copy = 0; copy < count; copy++) {
            // IDs must not encode a face or its position in the unshuffled inventory.
            wall.push(Object.freeze({ id: randomUUID(), tileId }));
        }
    }
    return wall;
}
