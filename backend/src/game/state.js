import { SEAT_COUNT } from '../../../shared/protocol.js';
import { buildWall } from './tiles.js';

// creates a new game state with 
// - empty hands for everyone,
// - a fresh wall
// - blank state for all critical tiles on the board
// - and a current playerr and dealer set to player 0
export function createRoundState({ wall } = {}) {
    return {
        players: Array.from({ length: SEAT_COUNT }, () => ({
            concealed: [],
            melds: [],
            specials: [],
            discards: [],
        })),
        wall: buildWall(wall),
        dealerSeat: 0,
        currentSeat: 0,
        phase: 'setup',
        pendingDiscard: null,
        gold: null,
        skippedGoldSpecials: [],
        nextMeldId: 0,
        winner: null,
        endReason: null,
    };
}
