// Gold-aware winning-hand check, ported from python_state_machine/rules.py.
// Hands are arrays of face strings ('1WAN', '7BIN', ...); map tile objects to
// their faces before calling. `gold` is the Gold face, or null before it is revealed.

export const MELDS_PER_HAND = 5;

const SOLVER_SUIT_BASE = { BIN: 0, TAO: 10, WAN: 20 };

export function parseTile(face) {
    const match = /^([1-9])(WAN|TAO|BIN)$/.exec(face);
    return match ? { rank: Number(match[1]), suit: match[2] } : null;
}

function solverSortKey(face) {
    const parsed = parseTile(face);
    return parsed ? SOLVER_SUIT_BASE[parsed.suit] + parsed.rank : 999;
}

// lockedMeldCount counts claimed melds; a Kong counts as one meld.
export function isWinningHand(hand, lockedMeldCount, gold) {
    const neededMelds = MELDS_PER_HAND - lockedMeldCount;
    if (neededMelds < 0) return false;
    const counts = new Map();
    let wilds = 0;
    for (const face of hand) {
        if (gold !== null && face === gold) wilds += 1;
        else counts.set(face, (counts.get(face) ?? 0) + 1);
    }
    return solve(counts, wilds, neededMelds, false);
}

export function canWinWithTile(hand, lockedMeldCount, gold, candidate) {
    return isWinningHand([...hand, candidate], lockedMeldCount, gold);
}

// Backtracking search: always place the lowest remaining natural tile into a
// pair, triplet or sequence, trying Gold in the other slots.
function solve(counts, wilds, melds, pairFound) {
    let remaining = 0;
    for (const count of counts.values()) remaining += count;
    const tilesNeeded = melds * 3 + (pairFound ? 0 : 2);
    if (remaining + wilds !== tilesNeeded) return false;
    if (remaining === 0) return true;

    let first = null;
    for (const [face, count] of counts) {
        if (count > 0 && (first === null || solverSortKey(face) < solverSortKey(first))) first = face;
    }

    function tryIdentical(size, wildsUsed, nextMelds, nextPairFound) {
        const naturals = size - wildsUsed;
        if (counts.get(first) < naturals || wilds < wildsUsed) return false;
        counts.set(first, counts.get(first) - naturals);
        const result = solve(counts, wilds - wildsUsed, nextMelds, nextPairFound);
        counts.set(first, counts.get(first) + naturals);
        return result;
    }

    if (!pairFound) {
        for (const wildsUsed of [0, 1]) {
            if (tryIdentical(2, wildsUsed, melds, true)) return true;
        }
    }
    if (melds === 0) return false;

    for (const wildsUsed of [0, 1, 2]) {
        if (tryIdentical(3, wildsUsed, melds - 1, pairFound)) return true;
    }

    const parsed = parseTile(first);
    if (!parsed) return false;
    const { rank, suit } = parsed;
    for (let start = Math.max(1, rank - 2); start <= Math.min(7, rank); start++) {
        const sequence = [0, 1, 2].map((offset) => `${start + offset}${suit}`);
        const anchor = sequence.indexOf(first);
        // Always use the first natural tile, but try Gold in either of the
        // other slots, even when that natural tile is available.
        for (let mask = 7; mask >= 0; mask--) {
            if (!(mask & (1 << anchor))) continue;
            const natural = sequence.filter((_, index) => mask & (1 << index));
            const missing = 3 - natural.length;
            if (missing > wilds || natural.some((face) => !counts.get(face))) continue;
            for (const face of natural) counts.set(face, counts.get(face) - 1);
            const result = solve(counts, wilds - missing, melds - 1, pairFound);
            for (const face of natural) counts.set(face, counts.get(face) + 1);
            if (result) return true;
        }
    }
    return false;
}
