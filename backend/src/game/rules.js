import { compareTiles, parseTile } from './tiles.js';

export const MELDS_PER_HAND = 5;

// Gold is the physical indicator tile (or null), as stored in round state.
export function isWinningHand(player, gold = null) {
    return checkHand(player.concealed, player.melds.length, gold) >= 0;
}

export function canWinWithTile(player, candidate, gold = null) {
    return checkHand([...player.concealed, candidate], player.melds.length, gold) >= 0;
}

// Returned tiles are the concealed instances needed for the meld, excluding the discard.
export function getBestClaim(state, seat) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
        throw new Error('Player seat must be 0, 1, 2 or 3');
    }
    const pending = state.pendingDiscard;
    if (pending === null || pending.fromSeat === seat) return null;

    const player = state.players[seat];
    if (state.phase !== 'claims') {
        const retained = state.retainedChi;
        if (!retained || retained.seat !== seat || state.currentSeat !== seat
            || retained.tileInstanceId !== pending.tile.id
            || seat !== (pending.fromSeat + 1) % state.players.length
            || !['drawFront', 'discard'].includes(state.phase)) return null;
        const tiles = findChiTiles(player, pending.tile);
        return tiles === null ? null : { kind: 'chi', tiles };
    }
    if (canWinWithTile(player, pending.tile, state.gold)) return { kind: 'win', tiles: [] };

    // Gold matches only its printed face when forming a claimed meld.
    const matchingTiles = player.concealed.filter((tile) => tile.tileId === pending.tile.tileId);
    if (matchingTiles.length >= 3) return { kind: 'kong', tiles: matchingTiles.slice(0, 3) };
    if (matchingTiles.length >= 2) return { kind: 'peng', tiles: matchingTiles.slice(0, 2) };

    if (seat === (pending.fromSeat + 1) % state.players.length) {
        const tiles = findChiTiles(player, pending.tile);
        if (tiles !== null) return { kind: 'chi', tiles };
    }
    return null;
}

export function findChiTiles(player, candidate) {
    const parsed = parseTile(candidate.tileId);
    if (parsed === null) return null;
    const { rank, suit } = parsed;
    const pairs = [[rank - 2, rank - 1], [rank - 1, rank + 1], [rank + 1, rank + 2]];
    for (const [firstRank, secondRank] of pairs) {
        if (firstRank < 1 || secondRank > 9) continue;
        const first = player.concealed.find((tile) => tile.tileId === `${firstRank}${suit}`);
        const second = player.concealed.find((tile) => tile.tileId === `${secondRank}${suit}`);
        if (first && second) return [first, second];
    }
    return null;
}

// Maximum concealed meld points; -1 means no valid five-meld-plus-pair hand.
export function winningGroupPoints(player, gold = null) {
    return checkHand(player.concealed, player.melds.length, gold, true);
}

function checkHand(hand, lockedMelds, gold, maximize = false) {
    // Each meld entry is one locked group, even a four-tile Kong.
    const meldsNeeded = MELDS_PER_HAND - lockedMelds;
    if (meldsNeeded < 0 || hand.length !== meldsNeeded * 3 + 2) return -1;

    const counts = new Map();
    let wilds = 0;
    for (const tile of [...hand].sort(compareTiles)) {
        if (tile.tileId === gold?.tileId) {
            wilds++;
        } else {
            counts.set(tile.tileId, (counts.get(tile.tileId) ?? 0) + 1);
        }
    }
    return solve(counts, wilds, meldsNeeded, false, maximize, new Map());
}

function solve(counts, wilds, melds, pairFound, maximize, memo) {
    const key = `${[...counts.values()]}:${wilds}:${melds}:${pairFound}`;
    if (memo.has(key)) return memo.get(key);
    let remaining = 0;
    let first = null;
    for (const [tileId, count] of counts) {
        remaining += count;
        if (count > 0 && first === null) first = tileId;
    }
    if (remaining + wilds !== melds * 3 + (pairFound ? 0 : 2)) return -1;
    // All-Gold groups may be triplets, the highest-valued concealed group.
    if (remaining === 0) return melds * 2;
    let best = -1;

    function tryGroup(naturalTiles, goldUsed, nextMelds, nextPair, points) {
        if (goldUsed > wilds) return;
        const nextCounts = new Map(counts);
        for (const tileId of naturalTiles) {
            const count = nextCounts.get(tileId) ?? 0;
            if (count === 0) return;
            nextCounts.set(tileId, count - 1);
        }
        const result = solve(nextCounts, wilds - goldUsed, nextMelds, nextPair, maximize, memo);
        if (result >= 0) best = Math.max(best, result + points);
    }

    if (!pairFound) {
        for (let goldUsed = 0; goldUsed <= 1; goldUsed++) {
            tryGroup(Array(2 - goldUsed).fill(first), goldUsed, melds, true, 0);
            if (!maximize && best >= 0) return best;
        }
    }
    if (melds > 0) {
        for (let goldUsed = 0; goldUsed <= 2; goldUsed++) {
            tryGroup(Array(3 - goldUsed).fill(first), goldUsed, melds - 1, pairFound, 2);
            if (!maximize && best >= 0) return best;
        }
        const parsed = parseTile(first);
        if (parsed) {
            const { rank, suit } = parsed;
            for (let start = Math.max(1, rank - 2); start <= Math.min(7, rank); start++) {
                const sequence = [`${start}${suit}`, `${start + 1}${suit}`, `${start + 2}${suit}`];
                const others = sequence.filter((tileId) => tileId !== first);
                // Gold may replace a face that is present but needed in another group.
                for (const naturalTiles of [sequence, [first, others[0]], [first, others[1]], [first]]) {
                    tryGroup(naturalTiles, 3 - naturalTiles.length, melds - 1, pairFound, 1);
                    if (!maximize && best >= 0) return best;
                }
            }
        }
    }
    memo.set(key, best);
    return best;
}
