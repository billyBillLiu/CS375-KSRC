import { createRoundState } from './state.js';
import { compareTiles, isSpecial } from './tiles.js';

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
    // M09 will check the dealer's opening win before leaving the setup phase.
    return state;
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
        state.phase = 'over';
        state.endReason = 'wall_exhausted';
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
