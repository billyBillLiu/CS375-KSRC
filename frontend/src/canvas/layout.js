export const TABLE_WIDTH = 384;
export const TABLE_HEIGHT = 216;

// Shared logical anchors for the center artwork and future draw hit targets.
export const CENTER_TABLE = {
    wall: { x: 209.85, y: 102.18 },
    wallFront: { x: 169.55, y: 119.88 },
    wallBack: { x: 256.8, y: 106 },
    gold: { x: 139.5, y: 97 },
    nestBack: { x: 140.5, y: 102 },
    nestFront: { x: 134.5, y: 109.5 },
    // Compensate for the expanded crop so the bird's body keeps its position.
    sparrow: { x: 119.5, y: 94 },
};

const DIRECTIONS = ['south', 'east', 'north', 'west'];

export function getVisualSeat(absoluteSeat, viewerSeat) {
    return (absoluteSeat - viewerSeat + 4) % 4;
}

export function layoutHand(absoluteSeat, viewerSeat, count) {
    return layoutPlayerHand(absoluteSeat, viewerSeat, count).map(({ x, y, direction }) => ({ x, y, direction }));
}

// Matches the hand crop in atlas.js; drawing and click hit tests both use it.
export const HAND_TILE_WIDTH = 20;
export const HAND_TILE_HEIGHT = 31;

export const DISCARD_CAPACITY = 8;
export const SPECIAL_CAPACITY = 24;

// Concealed and revealed tiles share the same slots in each visual seat's row.
// North and East meld art reads against the row direction, so their meld tiles are reversed.
const HAND_ROWS = [
    { length: 340, step: 20, reverseMelds: false },
    { length: 102, step: 6, reverseMelds: true },
    { length: 238, step: 14, reverseMelds: true },
    { length: 102, step: 6, reverseMelds: false },
];

// Keep melds flush with the concealed hand and shrink the entire row to fit.
export function layoutPlayerHand(seat, viewerSeat, concealedCount, melds = []) {
    const visualSeat = getVisualSeat(seat, viewerSeat);
    const row = HAND_ROWS[visualSeat];
    const slots = [];
    let offset = 0;
    function addSlot(tileIndex, meldIndex) {
        slots.push({ center: offset + row.step / 2, tileIndex, meldIndex });
        offset += row.step;
    }
    for (let index = 0; index < concealedCount; index += 1) addSlot(index, null);
    melds.forEach((meld, meldIndex) => {
        const count = meld.tiles.length;
        for (let index = 0; index < count; index += 1) {
            addSlot(row.reverseMelds ? count - 1 - index : index, meldIndex);
        }
    });

    const scale = Math.min(1, row.length / Math.max(row.step, offset));
    return slots.map(({ center, tileIndex, meldIndex }) => {
        const centered = (center - offset / 2) * scale;
        let x = 192 + (visualSeat === 0 ? centered : -centered);
        let y = visualSeat === 0 ? 178.22 : 41;
        if (visualSeat === 1 || visualSeat === 3) {
            // The side rows slant outward half a unit per unit of length, indexed from the first tile.
            const slant = (center - row.step / 2) / 2 * scale;
            x = visualSeat === 1 ? 314 + slant : 70 - slant;
            // Inset the wider revealed artwork while keeping its place along the row.
            if (meldIndex !== null) x += (visualSeat === 1 ? -3 : 3) * scale;
            y = 101 + centered;
        }
        return { x, y, scale, direction: DIRECTIONS[visualSeat], tileIndex, meldIndex };
    });
}

export function layoutDiscards(seat, viewerSeat, count) {
    const visualSeat = getVisualSeat(seat, viewerSeat);
    const [x, y, dx, dy] = [
        [313, 149, -1, -1], [280, 60, -1, 1],
        [104, 60, 1, 1], [71, 149, 1, -1],
    ][visualSeat];
    return Array.from({ length: Math.min(count, DISCARD_CAPACITY) }, (_, index) => ({
        x: x + (index % 4) * 16 * dx,
        y: y + Math.floor(index / 4) * 16 * dy,
    }));
}
