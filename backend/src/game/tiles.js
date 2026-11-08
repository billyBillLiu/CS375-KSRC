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
export function buildWall(tileIds) {
    if (tileIds === undefined) {
        tileIds = [];
        for (const tileId of TILE_IDS) {
            const count = tileId.startsWith('FLO_') || tileId.startsWith('SZN_') ? 1 : 4;
            for (let copy = 0; copy < count; copy++) {
                tileIds.push(tileId);
            }
        }
    }

    if (!Array.isArray(tileIds)) throw new Error('Wall must be an array of tile identities');
    const wall = [];
    for (const tileId of tileIds) {
        if (!TILE_IDS.includes(tileId)) throw new Error('Wall contains an unknown tile identity');
        // IDs must not encode a face or its position in the unshuffled inventory.
        wall.push(Object.freeze({ id: randomUUID(), tileId }));
    }
    return wall;
}

// if a tile is a special tile, return true. 
export function isSpecial(tileId) {
    return tileId.startsWith('WIND_') || tileId.startsWith('DRGN_')
        || tileId.startsWith('FLO_') || tileId.startsWith('SZN_');
}

// checks order of tiles. This is for rendering player hand in auto-sorted order
export function compareTiles(first, second) {
    return TILE_IDS.indexOf(first.tileId) - TILE_IDS.indexOf(second.tileId);
}

export function parseTile(tileId) {
    const match = /^([1-9])(WAN|TAO|BIN)$/.exec(tileId);
    if (!match) return null;
    return { rank: Number(match[1]), suit: match[2] };
}
