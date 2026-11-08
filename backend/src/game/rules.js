import { compareTiles, parseTile } from './tiles.js';

const MELDS_PER_HAND = 5;

// Gold is the physical indicator tile (or null), as stored in round state.
export function isWinningHand(player, gold = null) {
    return checkHand(player.concealed, player.melds.length, gold);
}

export function canWinWithTile(player, candidate, gold = null) {
    return checkHand([...player.concealed, candidate], player.melds.length, gold);
}

function checkHand(hand, lockedMelds, gold) {
    // Each meld entry is one locked group, even a four-tile Kong.
    const meldsNeeded = MELDS_PER_HAND - lockedMelds;
    if (meldsNeeded < 0 || hand.length !== meldsNeeded * 3 + 2) return false;

    const counts = new Map();
    let wilds = 0;
    for (const tile of [...hand].sort(compareTiles)) {
        if (tile.tileId === gold?.tileId) {
            wilds++;
        } else {
            counts.set(tile.tileId, (counts.get(tile.tileId) ?? 0) + 1);
        }
    }
    return solve(counts, wilds, meldsNeeded, false);
}

function solve(counts, wilds, melds, pairFound) {
    let remaining = 0;
    let first = null;
    for (const [tileId, count] of counts) {
        remaining += count;
        if (count > 0 && first === null) first = tileId;
    }
    if (remaining + wilds !== melds * 3 + (pairFound ? 0 : 2)) return false;
    if (remaining === 0) return true;

    if (!pairFound) {
        for (let goldUsed = 0; goldUsed <= 1; goldUsed++) {
            const naturalTiles = Array(2 - goldUsed).fill(first);
            if (tryGroup(counts, wilds, naturalTiles, goldUsed, melds, true)) return true;
        }
    }
    if (melds === 0) return false;

    for (let goldUsed = 0; goldUsed <= 2; goldUsed++) {
        const naturalTiles = Array(3 - goldUsed).fill(first);
        if (tryGroup(counts, wilds, naturalTiles, goldUsed, melds - 1, pairFound)) return true;
    }

    const parsed = parseTile(first);
    if (!parsed) return false;
    const { rank, suit } = parsed;
    for (let start = Math.max(1, rank - 2); start <= Math.min(7, rank); start++) {
        const sequence = [`${start}${suit}`, `${start + 1}${suit}`, `${start + 2}${suit}`];
        const others = sequence.filter((tileId) => tileId !== first);
        // Always consume the first natural tile. Try Gold in either other slot,
        // even when that natural face is available and could be saved for a pair.
        const naturalChoices = [sequence, [first, others[0]], [first, others[1]], [first]];
        for (const naturalTiles of naturalChoices) {
            const goldUsed = 3 - naturalTiles.length;
            if (tryGroup(counts, wilds, naturalTiles, goldUsed, melds - 1, pairFound)) return true;
        }
    }
    return false;
}

function tryGroup(counts, wilds, naturalTiles, goldUsed, melds, pairFound) {
    if (goldUsed > wilds) return false;
    const nextCounts = new Map(counts);
    for (const tileId of naturalTiles) {
        const count = nextCounts.get(tileId) ?? 0;
        if (count === 0) return false;
        nextCounts.set(tileId, count - 1);
    }
    return solve(nextCounts, wilds - goldUsed, melds, pairFound);
}
