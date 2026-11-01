// Placeholder rules for the draw/discard loop until the engine in backend/src/game/ is ready.
// Room only calls these four functions, so the real engine should export the same ones.
// State: { wall: number[], hands: number[][], discards: number[][], dealer, currentTurn, lastDrawn }

const TILE_TYPES = 36;
const COPIES = 4;
const SEATS = 4;
const HAND_SIZE = 16;

export function newRound({ dealer, random = Math.random }) {
    const wall = [];
    for (let tile = 0; tile < TILE_TYPES; tile++) {
        for (let copy = 0; copy < COPIES; copy++) wall.push(tile);
    }
    for (let i = wall.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [wall[i], wall[j]] = [wall[j], wall[i]];
    }

    const hands = Array.from({ length: SEATS }, () => []);
    for (let i = 0; i < HAND_SIZE; i++) {
        for (let offset = 0; offset < SEATS; offset++) hands[(dealer + offset) % SEATS].push(wall.shift());
    }
    hands[dealer].push(wall.shift());

    return {
        wall,
        hands,
        discards: Array.from({ length: SEATS }, () => []),
        dealer,
        currentTurn: dealer,
        lastDrawn: null,
    };
}

// Draws for the current player. Returns null when the wall is empty.
export function draw(state) {
    if (state.wall.length === 0) return null;
    const tile = state.wall.shift();
    state.hands[state.currentTurn].push(tile);
    state.lastDrawn = tile;
    return tile;
}

export function canDiscard(state, seat, tile) {
    return seat === state.currentTurn && state.hands[seat].includes(tile);
}

export function discard(state, seat, tile) {
    const hand = state.hands[seat];
    hand.splice(hand.indexOf(tile), 1);
    state.discards[seat].push(tile);
    state.lastDrawn = null;
    state.currentTurn = (seat + 1) % SEATS;
}
