import { createRoundState } from './state.js';
import { compareTiles, isSpecial } from './tiles.js';
import { isWinningHand } from './rules.js';

// Explicit walls contain face strings in front-to-back order and are never shuffled.
export function createRound({ wall, random = Math.random } = {}) {
    const state = createRoundState({ wall });
    if (wall === undefined) shuffleWall(state.wall, random);

    for (let packet = 0; packet < 4; packet++) {
        for (const player of state.players) {
            for (let count = 0; count < 4; count++) {
                const tile = takeTile(state);
                if (tile === null) return state;
                player.concealed.push(tile);
            }
        }
    }
    const extraTile = takeTile(state);
    if (extraTile === null) return state;
    state.players[state.dealerSeat].concealed.push(extraTile);

    if (!replaceSetupSpecials(state)) return state;
    if (!revealGold(state)) return state;

    for (const player of state.players) player.concealed.sort(compareTiles);
    checkForWinOrDiscard(state);
    return state;
}

export function drawFront(state, seat) {
    return drawTile(state, seat, false);
}

export function drawBack(state, seat) {
    return drawTile(state, seat, true);
}

function drawTile(state, seat, fromBack) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
        throw new Error('Player seat must be 0, 1, 2 or 3');
    }
    if (seat !== state.currentSeat) throw new Error('It is not this player\'s turn');
    const expectedPhase = fromBack ? 'drawBack' : 'drawFront';
    if (state.phase !== expectedPhase) throw new Error(`Cannot ${expectedPhase} during ${state.phase}`);

    // Drawing gives up any claim on the previous discard.
    if (state.pendingDiscard) {
        const { tile, fromSeat } = state.pendingDiscard;
        state.players[fromSeat].discards.push(tile);
        state.pendingDiscard = null;
    }

    const tile = takeTile(state, fromBack);
    if (tile === null) return state;
    const player = state.players[seat];
    if (isSpecial(tile.tileId)) {
        player.specials.push(tile);
        if (state.wall.length === 0) endRound(state, 'wall_exhausted');
        else state.phase = 'drawBack';
    } else {
        player.concealed.push(tile);
        player.concealed.sort(compareTiles);
        checkForWinOrDiscard(state);
    }
    return state;
}

function checkForWinOrDiscard(state) {
    if (isWinningHand(state.players[state.currentSeat], state.gold)) {
        endRound(state, 'self_draw', state.currentSeat);
    } else {
        state.phase = 'discard';
    }
}

function endRound(state, reason, winner = null) {
    state.phase = 'over';
    state.winner = winner;
    state.endReason = reason;
}

function shuffleWall(wall, random) {
    for (let index = wall.length - 1; index > 0; index--) {
        const otherIndex = Math.floor(random() * (index + 1));
        const tile = wall[index];
        wall[index] = wall[otherIndex];
        wall[otherIndex] = tile;
    }
}

function takeTile(state, fromBack = false) {
    if (state.wall.length === 0) {
        endRound(state, 'wall_exhausted');
        return null;
    }
    return fromBack ? state.wall.pop() : state.wall.shift();
}

function replaceSetupSpecials(state) {
    let foundSpecial = true;
    while (foundSpecial) {
        foundSpecial = false;
        for (const player of state.players) {
            // Appended special replacements wait for the next pass through all seats.
            for (let index = player.concealed.length - 1; index >= 0; index--) {
                if (!isSpecial(player.concealed[index].tileId)) continue;
                foundSpecial = true;
                const [special] = player.concealed.splice(index, 1);
                player.specials.push(special);
                const replacement = takeTile(state, true);
                if (replacement === null) return false;
                player.concealed.push(replacement);
            }
        }
    }
    return true;
}

function revealGold(state) {
    while (true) {
        const tile = takeTile(state, true);
        if (tile === null) return false;
        if (!isSpecial(tile.tileId)) {
            state.gold = tile;
            return true;
        }
        state.skippedGoldSpecials.push(tile);
    }
}
