export const TABLE_WIDTH = 384;
export const TABLE_HEIGHT = 216;

const DIRECTIONS = ['south', 'east', 'north', 'west'];

export function getVisualSeat(absoluteSeat, viewerSeat) {
    return (absoluteSeat - viewerSeat + 4) % 4;
}

export function layoutHand(absoluteSeat, viewerSeat, count) {
    return layoutPlayerHand(absoluteSeat, viewerSeat, count).map(({ x, y, direction }) => ({ x, y, direction }));
}

export const DISCARD_CAPACITY = 8;
export const SPECIAL_CAPACITY = 24;

// Include a small gap before each locked meld and shrink the entire row to fit.
export function layoutPlayerHand(seat, viewerSeat, concealedCount, melds = []) {
    const count = concealedCount + melds.reduce((sum, meld) => sum + meld.tiles.length, 0);
    const slots = count + melds.length * 0.5;
    const scale = Math.min(1, 17 / Math.max(1, slots));
    const visualSeat = getVisualSeat(seat, viewerSeat);
    const items = [];
    let slot = 0;
    function append(tileIndex, meldIndex) {
        const centered = slot - (slots - 1) / 2;
        const direction = visualSeat === 1 ? 1 : -1;
        let x = 192;
        let y = visualSeat === 0 ? 178.22 : 41;
        if (visualSeat === 0 || visualSeat === 2) {
            x += centered * (visualSeat === 0 ? 20 : -14) * scale;
        } else {
            x = (visualSeat === 1 ? 314 : 70) + slot * 3 * direction * scale;
            y = 101 + centered * 6 * scale;
        }
        items.push({ x, y, scale, direction: DIRECTIONS[visualSeat], tileIndex, meldIndex });
        slot += 1;
    }
    for (let index = 0; index < concealedCount; index += 1) append(index, null);
    melds.forEach((meld, meldIndex) => {
        slot += 0.5;
        meld.tiles.forEach((tile, index) => append(index, meldIndex));
    });
    return items;
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
