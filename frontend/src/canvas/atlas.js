function crop(sx, sy, sw, sh, image = 'tile_sheet') {
    return { image, sx, sy, sw, sh };
}

// The sheet orders winds E/W/N/S and dragons green/red/white.
const specialPositions = {
    WIND_EAST: [0, 0], WIND_SOUTH: [3, 0], WIND_WEST: [1, 0], WIND_NORTH: [2, 0],
    DRGN_RED: [5, 0], DRGN_GREEN: [4, 0], DRGN_WHITE: [6, 0],
    FLO_1: [0, 4], FLO_2: [1, 4], FLO_3: [2, 4], FLO_4: [3, 4],
    SZN_SPR: [4, 4], SZN_SUM: [5, 4], SZN_AUT: [6, 4], SZN_WNT: [7, 4],
};

export const tiles = {};

for (const [suitIndex, suit] of ['WAN', 'TAO', 'BIN'].entries()) {
    for (let rank = 1; rank <= 9; rank += 1) {
        const column = rank - 1;
        tiles[`${rank}${suit}`] = {
            hand: crop(column * 21, (suitIndex + 1) * 32, 20, 31),
            current: crop(column * 24, 262 + suitIndex * 38, 23, 37),
            // There is an extra pixel of spacing after the first Gold column.
            gold: crop(column === 0 ? 226 : 227 + column * 17, 262 + suitIndex * 28, 16, 27),
            discardLeft: crop(column * 21, 168 + suitIndex * 31, 20, 21),
            discardRight: crop(191 + (8 - column) * 21, 168 + suitIndex * 31, 20, 21),
            revealed: {
                south: crop(column * 21, (suitIndex + 1) * 32, 20, 31, 'south_revealed'),
                east: crop(column * 28, 377 + suitIndex * 17, 27, 16),
                north: crop(column * 15, 482 + suitIndex * 24, 14, 23),
                west: crop((8 - column) * 28, 429 + suitIndex * 17, 27, 16),
            },
        };
    }
}

// Specials have no authored directional/current/Gold variants. Transform their
// existing revealed artwork explicitly; never substitute a suited tile's face.
for (const [identity, [column, row]] of Object.entries(specialPositions)) {
    const hand = crop(column * 21, row * 32, 20, 31);
    const south = { ...hand, image: 'south_revealed' };
    tiles[identity] = {
        hand,
        current: { ...hand, width: 23, height: 37 },
        gold: { ...hand, width: 16, height: 27 },
        discardLeft: { ...south, width: 12, height: 16, rotation: -Math.PI / 4 },
        discardRight: { ...south, width: 12, height: 16, rotation: Math.PI / 4 },
        revealed: {
            south,
            east: { ...south, width: 16, height: 27, rotation: Math.PI / 2 },
            north: { ...south, width: 14, height: 23 },
            west: { ...south, width: 16, height: 27, rotation: -Math.PI / 2 },
        },
    };
}

export const backs = {
    south: crop(302, 105, 20, 31),
    east: crop(254, 429, 16, 31),
    north: crop(137, 482, 14, 25),
    west: crop(254, 377, 16, 31),
};

export function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Could not load ${source}`));
        image.src = source;
    });
}

let atlasPromise;

export function loadAtlas() {
    if (!atlasPromise) {
        atlasPromise = Promise.all([
            loadImage(`${import.meta.env.BASE_URL}assets/tile_sheet.png`),
            loadImage(`${import.meta.env.BASE_URL}assets/tile_sheet_south_revealed.png`),
        ]).then(([tileSheet, southRevealed]) => ({
            tile_sheet: tileSheet,
            south_revealed: southRevealed,
        }));
    }
    return atlasPromise;
}

// Positions and crop sizes use logical pixels, with the tile centered at x/y.
export function drawSprite(context, atlas, sprite, x, y) {
    const { sx, sy, sw, sh, width = sw, height = sh, rotation = 0 } = sprite;
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.drawImage(atlas[sprite.image], sx, sy, sw, sh,
        -width / 2, -height / 2, width, height);
    context.restore();
}
