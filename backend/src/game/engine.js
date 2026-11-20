import { randomUUID } from 'node:crypto';
import { createRoundState } from './state.js';
import { compareTiles, isSpecial } from './tiles.js';
import { findChiTiles, getBestClaim, isWinningHand, MELDS_PER_HAND } from './rules.js';

export const CLAIM_WINDOW_MS = 3500;
const CLAIM_PRIORITY = ['win', 'kong', 'peng', 'chi'];
const SYSTEM_CLOCK = { now: () => Date.now(), setTimeout, clearTimeout };
// Timer handles and callbacks stay out of serializable game state.
const roundRuntime = new WeakMap();

// Explicit walls contain face strings in front-to-back order and are never shuffled.
export function createRound({ wall, random = Math.random, clock = SYSTEM_CLOCK, onChange = () => {} } = {}) {
    const state = createRoundState({ wall });
    roundRuntime.set(state, { clock, onChange, timer: null });
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
    state.openingTileId = extraTile.id;

    if (!replaceSetupSpecials(state)) return state;
    if (!revealGold(state)) return state;

    for (const player of state.players) player.concealed.sort(compareTiles);
    beginTurn(state);
    return state;
}

export function drawFront(state, seat) {
    return drawTile(state, seat, false);
}

export function drawBack(state, seat) {
    return drawTile(state, seat, true);
}

export function discard(state, seat, tileInstanceId) {
    validateTurn(state, seat, 'discard');
    if (typeof tileInstanceId !== 'string' || tileInstanceId.length === 0) {
        throw new Error('Tile instance ID must be a non-empty string');
    }
    const player = state.players[seat];
    const index = player.concealed.findIndex((tile) => tile.id === tileInstanceId);
    if (index === -1) throw new Error('Tile is not in this player\'s concealed hand');

    const [tile] = player.concealed.splice(index, 1);
    state.openingTileId = null;
    settlePendingDiscard(state);
    state.pendingDiscard = { tile, fromSeat: seat };
    state.phase = 'claims';
    openClaimWindow(state);
    return state;
}

export function submitClaim(state, seat, windowId, choice) {
    validateSeat(state, seat);
    const window = requireClaimWindow(state, windowId);
    if (getRuntime(state).clock.now() >= window.deadline) throw new Error('Claim window has closed');
    if (seat === state.pendingDiscard.fromSeat) throw new Error('Discarder cannot respond to their own discard');
    if (choice !== 'claim' && choice !== 'pass') throw new Error('Choice must be claim or pass');
    if (window.choices[seat] !== null) throw new Error('This seat has already responded');
    if (choice === 'claim' && getBestClaim(state, seat) === null) throw new Error('No claim available for this player');
    window.choices[seat] = choice;
    return state;
}

export function resolveClaims(state, windowId) {
    const window = requireClaimWindow(state, windowId);
    const runtime = getRuntime(state);
    if (runtime.clock.now() < window.deadline) throw new Error('Claim window is still open');

    const pending = state.pendingDiscard;
    let winningSeat = null;
    let bestPriority = CLAIM_PRIORITY.length;
    // Visit seats after the discarder, so equal-priority claims keep the earlier seat.
    for (let offset = 1; offset < state.players.length; offset++) {
        const seat = (pending.fromSeat + offset) % state.players.length;
        if (window.choices[seat] !== 'claim') continue;
        const claim = getBestClaim(state, seat);
        if (claim === null) continue;
        const priority = CLAIM_PRIORITY.indexOf(claim.kind);
        if (priority < bestPriority) {
            bestPriority = priority;
            winningSeat = seat;
        }
    }

    if (winningSeat !== null) {
        applyClaim(state, winningSeat);
    } else {
        clearClaimWindow(state);
        const nextSeat = (pending.fromSeat + 1) % state.players.length;
        if (findChiTiles(state.players[nextSeat], pending.tile) !== null) {
            state.retainedChi = { seat: nextSeat, windowId, tileInstanceId: pending.tile.id };
        } else {
            settlePendingDiscard(state);
        }
        state.currentSeat = nextSeat;
        beginTurn(state);
    }
    runtime.onChange(state);
    return state;
}

export function claimRetainedChi(state, seat, windowId) {
    validateSeat(state, seat);
    const retained = state.retainedChi;
    if (!retained || retained.windowId !== windowId || retained.seat !== seat
        || getBestClaim(state, seat)?.kind !== 'chi') throw new Error('No retained Chi available for this turn');
    return applyClaim(state, seat);
}

// Trusted transition for the resolver; player Claim/Pass intents use submitClaim instead.
export function applyClaim(state, seat) {
    const claim = getBestClaim(state, seat);
    if (claim === null) throw new Error('No claim available for this player');

    const pending = state.pendingDiscard;
    const player = state.players[seat];
    clearClaimWindow(state);
    state.retainedChi = null;
    state.pendingDiscard = null;
    if (claim.kind === 'win') {
        player.concealed.push(pending.tile);
        player.concealed.sort(compareTiles);
        endRound(state, 'discard_claim', seat);
        return state;
    }

    for (const tile of claim.tiles) {
        const index = player.concealed.indexOf(tile);
        player.concealed.splice(index, 1);
    }
    player.melds.push({
        id: state.nextMeldId,
        kind: claim.kind,
        tiles: [pending.tile, ...claim.tiles],
        fromSeat: pending.fromSeat,
    });
    state.nextMeldId++;
    state.currentSeat = seat;
    player.concealed.sort(compareTiles);

    if (claim.kind === 'kong') {
        state.phase = 'drawFront';
        return drawFront(state, seat);
    }
    state.phase = 'discard';
    return state;
}

function validateSeat(state, seat) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
        throw new Error('Player seat must be 0, 1, 2 or 3');
    }
}

function validateTurn(state, seat, expectedPhase) {
    validateSeat(state, seat);
    if (seat !== state.currentSeat) throw new Error('It is not this player\'s turn');
    if (state.phase !== expectedPhase) throw new Error(`Cannot ${expectedPhase} during ${state.phase}`);
}

function settlePendingDiscard(state) {
    state.retainedChi = null;
    if (state.pendingDiscard) {
        const { tile, fromSeat } = state.pendingDiscard;
        state.players[fromSeat].discards.push(tile);
        state.pendingDiscard = null;
    }
}

function getRuntime(state) {
    if (!roundRuntime.has(state)) {
        roundRuntime.set(state, { clock: SYSTEM_CLOCK, onChange: () => {}, timer: null });
    }
    return roundRuntime.get(state);
}

function requireClaimWindow(state, windowId) {
    const window = state.claimWindow;
    if (state.phase !== 'claims' || !state.pendingDiscard || !window || window.id !== windowId) {
        throw new Error('No matching claim window');
    }
    return window;
}

function openClaimWindow(state) {
    clearClaimWindow(state);
    const runtime = getRuntime(state);
    state.claimWindow = {
        id: randomUUID(),
        deadline: runtime.clock.now() + CLAIM_WINDOW_MS,
        choices: Array(state.players.length).fill(null),
    };
    scheduleClaimExpiry(state, CLAIM_WINDOW_MS);
}

function scheduleClaimExpiry(state, delay) {
    const runtime = getRuntime(state);
    const window = state.claimWindow;
    function expire() {
        if (state.phase !== 'claims' || state.claimWindow?.id !== window.id) return;
        const remaining = window.deadline - runtime.clock.now();
        if (remaining > 0) {
            scheduleClaimExpiry(state, remaining);
            return;
        }
        resolveClaims(state, window.id);
    }
    runtime.timer = runtime.clock.setTimeout(expire, delay);
    runtime.timer?.unref?.();
}

// Stops the claim timer while a player reconnects; the window keeps its remaining time.
export function pauseRound(state) {
    const window = state.claimWindow;
    if (!window || window.pausedRemainingMs !== undefined) return state;
    const runtime = getRuntime(state);
    if (runtime.timer !== null) runtime.clock.clearTimeout(runtime.timer);
    runtime.timer = null;
    window.pausedRemainingMs = Math.max(0, window.deadline - runtime.clock.now());
    return state;
}

export function resumeRound(state) {
    const window = state.claimWindow;
    if (!window || window.pausedRemainingMs === undefined) return state;
    window.deadline = getRuntime(state).clock.now() + window.pausedRemainingMs;
    delete window.pausedRemainingMs;
    scheduleClaimExpiry(state, window.deadline - getRuntime(state).clock.now());
    return state;
}

// Ends a round that cannot continue, such as when a player never reconnects.
export function abandonRound(state, reason) {
    if (state.phase === 'over') return state;
    settlePendingDiscard(state);
    endRound(state, reason);
    return state;
}

function clearClaimWindow(state) {
    const runtime = roundRuntime.get(state);
    if (runtime && runtime.timer !== null) {
        runtime.clock.clearTimeout(runtime.timer);
        runtime.timer = null;
    }
    state.claimWindow = null;
}

function beginTurn(state) {
    const player = state.players[state.currentSeat];
    const targetSize = (MELDS_PER_HAND - player.melds.length) * 3 + 2;
    if (player.concealed.length < targetSize) state.phase = 'drawFront';
    else checkForWinOrDiscard(state);
}

function drawTile(state, seat, fromBack) {
    validateTurn(state, seat, fromBack ? 'drawBack' : 'drawFront');
    // Drawing gives up any claim on the previous discard.
    settlePendingDiscard(state);

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
    clearClaimWindow(state);
    state.retainedChi = null;
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
                if (special.id === state.openingTileId) state.openingTileId = replacement.id;
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
