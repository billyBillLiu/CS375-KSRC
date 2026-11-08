export const TABLE_WIDTH = 384;
export const TABLE_HEIGHT = 216;

const DIRECTIONS = ['south', 'east', 'north', 'west'];

export function getVisualSeat(absoluteSeat, viewerSeat) {
    return (absoluteSeat - viewerSeat + 4) % 4;
}

export function layoutHand(absoluteSeat, viewerSeat, count) {
    const visualSeat = getVisualSeat(absoluteSeat, viewerSeat);
    return Array.from({ length: count }, (_, index) => {
        const centeredIndex = index - (count - 1) / 2;
        let x;
        let y;
        if (visualSeat === 0) {
            x = 192 + centeredIndex * 20;
            y = 178.22;
        } else if (visualSeat === 2) {
            x = 192 - centeredIndex * 14;
            y = 41;
        } else {
            const direction = visualSeat === 1 ? 1 : -1;
            x = (visualSeat === 1 ? 314 : 70) + index * 3 * direction;
            y = 101 + centeredIndex * 6;
        }
        return { x, y, direction: DIRECTIONS[visualSeat] };
    });
}
