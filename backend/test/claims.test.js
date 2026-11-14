import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyClaim, claimRetainedChi, CLAIM_WINDOW_MS, createRound, discard,
    drawBack, drawFront, resolveClaims, submitClaim,
} from '../src/game/engine.js';
import { getBestClaim, isWinningHand } from '../src/game/rules.js';
import { buildWall, isSpecial } from '../src/game/tiles.js';

function fakeClock() {
    let time = 1000;
    let nextId = 0;
    const timers = new Map();
    const callbacks = [];
    return {
        now: () => time,
        setTimeout(callback, delay) {
            const id = ++nextId;
            timers.set(id, { callback, deadline: time + delay });
            callbacks.push(callback);
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        advance(milliseconds) {
            const target = time + milliseconds;
            while (true) {
                const next = [...timers.entries()]
                    .filter(([, timer]) => timer.deadline <= target)
                    .sort((first, second) => first[1].deadline - second[1].deadline)[0];
                if (!next) break;
                const [id, timer] = next;
                time = Math.max(time, timer.deadline);
                timers.delete(id);
                timer.callback();
            }
            time = target;
        },
        elapse(milliseconds) { time += milliseconds; },
        fireEarly() {
            const [id, timer] = timers.entries().next().value;
            timers.delete(id);
            timer.callback();
        },
        callbacks,
        get pendingCount() { return timers.size; },
    };
}

const NEUTRAL = '1BIN 1BIN 1BIN 2BIN 2BIN 2BIN 4BIN 4BIN 4BIN 6BIN 6BIN 6BIN 8BIN 8BIN 8BIN 9BIN';
const CHI = '1WAN 2WAN 2WAN 4WAN 5WAN 7WAN 8WAN 1TAO 3TAO 5TAO 7TAO 1BIN 3BIN 5BIN 7BIN 9BIN';
const PENG = '3WAN 3WAN 1WAN 2WAN 4WAN 5WAN 7WAN 8WAN 1TAO 3TAO 5TAO 7TAO 1BIN 3BIN 5BIN 7BIN';
const KONG = '3WAN 3WAN 3WAN 1WAN 2WAN 4WAN 5WAN 7WAN 8WAN 1TAO 3TAO 5TAO 7TAO 1BIN 3BIN 5BIN';
const WIN = '1WAN 2WAN 4WAN 5WAN 6WAN 2TAO 2TAO 2TAO 4TAO 5TAO 6TAO 7BIN 8BIN 9BIN 5BIN 5BIN';

function ownedIds(state) {
    const tiles = [...state.wall, ...state.skippedGoldSpecials];
    if (state.gold) tiles.push(state.gold);
    if (state.pendingDiscard) tiles.push(state.pendingDiscard.tile);
    for (const player of state.players) {
        tiles.push(...player.concealed, ...player.specials, ...player.discards);
        for (const meld of player.melds) tiles.push(...meld.tiles);
    }
    return tiles.map((tile) => tile.id).sort();
}

function assertOwnership(state, originalIds) {
    const ids = ownedIds(state);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, originalIds);
}

function makeWindow({ hands = {}, fromSeat = 0, wall = ['1BIN', '4BIN'] } = {}) {
    const clock = fakeClock();
    const notifications = [];
    const state = createRound({
        wall: buildWall().map((tile) => tile.tileId), clock,
        onChange: (round) => notifications.push(structuredClone(round)),
    });
    // Prepared claim scenarios isolate priority and timing from the initial deal.
    for (let seat = 0; seat < 4; seat++) state.players[seat].concealed = buildWall((hands[seat] ?? NEUTRAL).split(' '));
    state.wall = buildWall(wall);
    state.gold = buildWall(['9TAO'])[0];
    state.skippedGoldSpecials = [];
    state.currentSeat = fromSeat;
    const tile = buildWall(['3WAN'])[0];
    state.players[fromSeat].concealed.push(tile);
    const ids = ownedIds(state);
    discard(state, fromSeat, tile.id);
    return { state, clock, notifications, ids, id: state.claimWindow.id, tile };
}

function assertRejected(state, action, pattern = /window|respond|Choice|seat|claim|Chi|discard|hand/i) {
    const before = structuredClone(state);
    assert.throws(action, pattern);
    assert.deepEqual(state, before);
}

test('Claim choices wait the full 3.5 seconds and the timer resolves without another action', () => {
    const { state, clock, notifications, id, tile, ids } = makeWindow({ hands: { 1: CHI } });
    assert.equal(state.claimWindow.deadline, 1000 + CLAIM_WINDOW_MS);
    assert.equal(CLAIM_WINDOW_MS, 3500);
    assert.deepEqual(state.claimWindow.choices, [null, null, null, null]);
    submitClaim(state, 1, id, 'claim');
    clock.advance(3499);
    assert.equal(state.phase, 'claims');
    assert.equal(state.pendingDiscard.tile, tile);
    assert.equal(state.players[1].melds.length, 0);
    assert.equal(notifications.length, 0);
    clock.advance(1);
    assert.equal(state.phase, 'discard');
    assert.equal(state.currentSeat, 1);
    assert.equal(state.players[1].melds[0].kind, 'chi');
    assert.equal(state.claimWindow, null);
    assert.equal(clock.pendingCount, 0);
    assert.equal(notifications.length, 1);
    assertOwnership(state, ids);
});

test('claim priority overrides submission order for Win, Kong, Peng and Chi', () => {
    for (const hands of [{ 1: CHI, 2: PENG, 3: KONG }, { 1: CHI, 2: KONG, 3: WIN }, { 1: CHI, 2: PENG }]) {
        for (const order of [[1, 2, 3], [3, 2, 1], [2, 1, 3]]) {
            const { state, clock, id, ids } = makeWindow({ hands });
            for (const seat of order) {
                if (hands[seat]) submitClaim(state, seat, id, 'claim');
            }
            clock.advance(CLAIM_WINDOW_MS);
            const winner = hands[3] ? 3 : 2;
            if (hands[3] === WIN) {
                assert.equal(state.winner, winner);
                assert.equal(state.endReason, 'discard_claim');
            } else {
                assert.equal(state.currentSeat, winner);
                assert.equal(state.players[winner].melds[0].kind, hands[3] === KONG ? 'kong' : 'peng');
            }
            assert.equal(state.players[1].melds.length, 0);
            assert.equal(state.retainedChi, null);
            assertOwnership(state, ids);
        }
    }
});

test('equal-priority wins go to the first seat after the discarder, including wraparound', () => {
    for (let fromSeat = 0; fromSeat < 4; fromSeat++) {
        const { state, clock, id, ids } = makeWindow({ fromSeat, hands: { 0: WIN, 1: WIN, 2: WIN, 3: WIN } });
        for (const offset of [3, 2, 1]) submitClaim(state, (fromSeat + offset) % 4, id, 'claim');
        clock.advance(CLAIM_WINDOW_MS);
        assert.equal(state.winner, (fromSeat + 1) % 4);
        assert.equal(state.currentSeat, fromSeat);
        assert.equal(state.players.flatMap((player) => player.melds).length, 0);
        assertOwnership(state, ids);
    }
});

test('a silent or passing higher-priority seat never auto-claims', () => {
    for (const choice of [null, 'pass']) {
        const { state, clock, id } = makeWindow({ hands: { 1: CHI, 2: WIN } });
        submitClaim(state, 1, id, 'claim');
        if (choice) submitClaim(state, 2, id, choice);
        clock.advance(CLAIM_WINDOW_MS);
        assert.equal(state.currentSeat, 1);
        assert.equal(state.winner, null);
        assert.equal(state.players[1].melds[0].kind, 'chi');
    }
});

test('all passes wait until the deadline, settle the discard once and advance without drawing', () => {
    for (let fromSeat = 0; fromSeat < 4; fromSeat++) {
        const { state, clock, id, tile, ids } = makeWindow({ fromSeat });
        const wall = [...state.wall];
        for (let seat = 0; seat < 4; seat++) {
            if (seat !== fromSeat) submitClaim(state, seat, id, 'pass');
        }
        assert.equal(state.phase, 'claims');
        clock.advance(CLAIM_WINDOW_MS);
        assert.equal(state.phase, 'drawFront');
        assert.equal(state.currentSeat, (fromSeat + 1) % 4);
        assert.equal(state.retainedChi, null);
        assert.equal(state.pendingDiscard, null);
        assert.deepEqual(state.players[fromSeat].discards, [tile]);
        assert.deepEqual(state.wall, wall);
        clock.advance(10000);
        assert.deepEqual(state.players[fromSeat].discards, [tile]);
        assertOwnership(state, ids);
    }
});

test('invalid, duplicate and stale decisions leave both tiles and choices unchanged', () => {
    const { state, clock, id } = makeWindow({ hands: { 1: CHI, 2: PENG } });
    for (const seat of [-1, 4, 1.5, '1', null, undefined, NaN]) {
        assertRejected(state, () => submitClaim(state, seat, id, 'pass'));
    }
    for (const wrongId of [undefined, null, 'old-window']) {
        assertRejected(state, () => submitClaim(state, 1, wrongId, 'claim'));
    }
    assertRejected(state, () => submitClaim(state, 0, id, 'pass'));
    assertRejected(state, () => submitClaim(state, 0, id, 'claim'));
    assertRejected(state, () => submitClaim(state, 3, id, 'claim'));
    for (const choice of ['chi', 'win', true, null, {}]) {
        assertRejected(state, () => submitClaim(state, 1, id, choice));
    }
    assertRejected(state, () => resolveClaims(state, id));
    submitClaim(state, 1, id, 'claim');
    assertRejected(state, () => submitClaim(state, 1, id, 'claim'));
    assertRejected(state, () => submitClaim(state, 1, id, 'pass'));
    submitClaim(state, 2, id, 'claim');
    assert.deepEqual(state.claimWindow.choices, [null, 'claim', 'claim', null]);
    clock.advance(CLAIM_WINDOW_MS);
    assert.equal(state.currentSeat, 2);
});

test('turn advancement counts a locked Kong as one meld and requires only one normal draw', () => {
    const hand = NEUTRAL.split(' ').slice(3).join(' ');
    const { state, clock } = makeWindow({ hands: { 1: hand } });
    state.players[1].melds.push({ id: 0, kind: 'kong', tiles: buildWall(Array(4).fill('8TAO')), fromSeat: 2 });
    state.nextMeldId = 1;
    const ids = ownedIds(state);
    clock.advance(CLAIM_WINDOW_MS);
    assert.equal(state.currentSeat, 1);
    assert.equal(state.phase, 'drawFront');
    assert.equal(state.players[1].concealed.length, 13);
    drawFront(state, 1);
    assert.equal(state.phase, 'discard');
    assert.equal(state.players[1].concealed.length, 14);
    assertRejected(state, () => drawFront(state, 1), /Cannot/);
    assertOwnership(state, ids);
});

test('decisions at or after the deadline are rejected even if the timer callback is delayed', () => {
    const { state, clock, id } = makeWindow({ hands: { 1: CHI } });
    clock.elapse(CLAIM_WINDOW_MS);
    assertRejected(state, () => submitClaim(state, 1, id, 'claim'));
    clock.elapse(50);
    assertRejected(state, () => submitClaim(state, 1, id, 'pass'));
    clock.advance(0);
    assert.equal(state.phase, 'drawFront');
    assert.equal(state.retainedChi.seat, 1);
    assertRejected(state, () => submitClaim(state, 1, id, 'claim'));
});

test('an early timer wakeup waits the remaining time instead of resolving early', () => {
    const { state, clock, notifications } = makeWindow();
    clock.elapse(1000);
    clock.fireEarly();
    assert.equal(state.phase, 'claims');
    assert.equal(clock.pendingCount, 1);
    clock.advance(2499);
    assert.equal(notifications.length, 0);
    clock.advance(1);
    assert.equal(notifications.length, 1);
    assert.equal(state.phase, 'drawFront');
});

test('old decisions and canceled timer callbacks cannot resolve a newer discard', () => {
    const { state, clock, id, notifications, ids } = makeWindow({ hands: { 1: CHI } });
    const oldCallback = clock.callbacks[0];
    submitClaim(state, 1, id, 'claim');
    clock.advance(CLAIM_WINDOW_MS);
    discard(state, 1, state.players[1].concealed[0].id);
    const newId = state.claimWindow.id;
    assert.notEqual(newId, id);
    assert.equal(state.claimWindow.deadline, clock.now() + CLAIM_WINDOW_MS);
    assertRejected(state, () => submitClaim(state, 2, id, 'pass'));
    assertRejected(state, () => resolveClaims(state, id));
    const before = structuredClone(state);
    oldCallback();
    assert.deepEqual(state, before);
    assert.equal(clock.pendingCount, 1);
    assert.equal(notifications.length, 1);
    submitClaim(state, 2, newId, 'pass');
    clock.advance(CLAIM_WINDOW_MS);
    assert.equal(notifications.length, 2);
    assertOwnership(state, ids);
});

test('silence and explicit Pass retain Chi for the next seat in every seat rotation', () => {
    for (let fromSeat = 0; fromSeat < 4; fromSeat++) {
        const next = (fromSeat + 1) % 4;
        for (const choice of [null, 'pass']) {
            const { state, clock, id, tile, ids } = makeWindow({ fromSeat, hands: { [next]: CHI } });
            if (choice) submitClaim(state, next, id, choice);
            clock.advance(CLAIM_WINDOW_MS);
            assert.equal(state.phase, 'drawFront');
            assert.equal(state.currentSeat, next);
            assert.equal(state.claimWindow, null);
            assert.equal(state.pendingDiscard.tile, tile);
            assert.deepEqual(state.retainedChi, { seat: next, windowId: id, tileInstanceId: tile.id });
            assert.equal(getBestClaim(state, next).kind, 'chi');
            assertRejected(state, () => submitClaim(state, next, id, 'claim'));
            assertRejected(state, () => claimRetainedChi(state, fromSeat, id));
            assertRejected(state, () => claimRetainedChi(state, next, 'old-window'));
            claimRetainedChi(state, next, id);
            assert.equal(state.phase, 'discard');
            assert.equal(state.players[next].melds[0].kind, 'chi');
            assert.equal(state.retainedChi, null);
            assert.equal(state.pendingDiscard, null);
            assert.equal(clock.pendingCount, 0);
            assertRejected(state, () => claimRetainedChi(state, next, id));
            assertOwnership(state, ids);
        }
    }
});

test('retention offers only Chi after passing a higher-priority Win or Peng', () => {
    for (const hand of [WIN, PENG]) {
        const { state, clock, id } = makeWindow({ hands: { 1: hand } });
        assert.equal(getBestClaim(state, 1).kind, hand === WIN ? 'win' : 'peng');
        submitClaim(state, 1, id, 'pass');
        clock.advance(CLAIM_WINDOW_MS);
        assert.equal(getBestClaim(state, 1).kind, 'chi');
        claimRetainedChi(state, 1, id);
        assert.equal(state.players[1].melds[0].kind, 'chi');
        assert.equal(state.winner, null);
    }
});

test('a normal, special or exhausted draw expires retained Chi and settles its tile once', () => {
    for (const wall of [['1BIN', '4BIN'], ['WIND_EAST', '1BIN'], []]) {
        const { state, clock, id, tile, ids } = makeWindow({ wall, hands: { 1: CHI } });
        clock.advance(CLAIM_WINDOW_MS);
        assertRejected(state, () => drawFront(state, 2), /turn/);
        drawFront(state, 1);
        assert.equal(state.retainedChi, null);
        assert.equal(state.pendingDiscard, null);
        assert.deepEqual(state.players[0].discards, [tile]);
        assertRejected(state, () => claimRetainedChi(state, 1, id));
        if (state.phase === 'drawBack') drawBack(state, 1);
        assert.deepEqual(state.players[0].discards, [tile]);
        if (wall.length === 0) assert.equal(state.endReason, 'wall_exhausted');
        assertOwnership(state, ids);
    }
});

test('discard expires retained Chi, while a rejected discard preserves it', () => {
    const { state, clock, id, tile, ids } = makeWindow({ hands: { 1: `${CHI} 9BIN` } });
    clock.advance(CLAIM_WINDOW_MS);
    assert.equal(state.phase, 'discard');
    assert.equal(getBestClaim(state, 1).kind, 'chi');
    assertRejected(state, () => discard(state, 1, 'missing-tile'));
    discard(state, 1, state.players[1].concealed[0].id);
    assert.equal(state.retainedChi, null);
    assert.notEqual(state.claimWindow.id, id);
    assert.deepEqual(state.players[0].discards, [tile]);
    assertRejected(state, () => claimRetainedChi(state, 1, id));
    assertOwnership(state, ids);
});

test('a retained Chi is tied to its current seat, phase and pending physical tile', () => {
    const { state, clock, id } = makeWindow({ hands: { 1: CHI } });
    clock.advance(CLAIM_WINDOW_MS);
    state.currentSeat = 2;
    assert.equal(getBestClaim(state, 1), null);
    assertRejected(state, () => claimRetainedChi(state, 1, id));
    state.currentSeat = 1;
    state.phase = 'over';
    assertRejected(state, () => claimRetainedChi(state, 1, id));
    state.phase = 'drawFront';
    state.pendingDiscard = { tile: buildWall(['3WAN'])[0], fromSeat: 0 };
    assert.equal(getBestClaim(state, 1), null);
    assertRejected(state, () => claimRetainedChi(state, 1, id));
});

test('resolving Kong cancels the window before a manual replacement chain', () => {
    const { state, clock, id, ids, notifications } = makeWindow({ hands: { 2: KONG }, wall: ['WIND_EAST', '1BIN', 'FLO_1'] });
    submitClaim(state, 2, id, 'claim');
    clock.advance(CLAIM_WINDOW_MS);
    assert.equal(state.phase, 'drawBack');
    assert.equal(state.currentSeat, 2);
    assert.equal(state.claimWindow, null);
    assert.equal(clock.pendingCount, 0);
    const before = structuredClone(state);
    clock.advance(10000);
    assert.deepEqual(state, before);
    assert.equal(notifications.length, 1);
    drawBack(state, 2);
    drawBack(state, 2);
    assert.equal(state.phase, 'discard');
    assert.equal(state.players[2].melds.length, 1);
    assertOwnership(state, ids);
});

test('ending a round cancels a queued deadline and stale callbacks cannot revive it', () => {
    for (const hand of [WIN, KONG]) {
        const { state, clock, ids } = makeWindow({ hands: { 1: hand }, wall: [] });
        const oldCallback = clock.callbacks[0];
        applyClaim(state, 1);
        assert.equal(state.phase, 'over');
        assert.equal(state.endReason, hand === WIN ? 'discard_claim' : 'wall_exhausted');
        assert.equal(state.claimWindow, null);
        assert.equal(state.retainedChi, null);
        assert.equal(clock.pendingCount, 0);
        const before = structuredClone(state);
        oldCallback();
        clock.advance(10000);
        assert.deepEqual(state, before);
        assertOwnership(state, ids);
    }
});

test('independent rounds have different window IDs and independent deadlines', () => {
    const first = makeWindow();
    const second = makeWindow();
    assert.notEqual(first.id, second.id);
    assertRejected(second.state, () => submitClaim(second.state, 1, first.id, 'pass'));
    first.clock.advance(CLAIM_WINDOW_MS);
    assert.equal(first.state.phase, 'drawFront');
    assert.equal(second.state.phase, 'claims');
    assert.equal(second.clock.pendingCount, 1);
});

test('full-wall rounds can advance through draws, discards and claim windows to completion', () => {
    const inventory = buildWall().map((tile) => tile.tileId);
    const scenarios = [
        { wall: inventory, endReason: 'wall_exhausted', winner: null, wallCount: 0 },
        { wall: [...inventory].reverse(), endReason: 'self_draw', winner: 3, wallCount: 1 },
        { wall: inventory.map((_, index) => inventory[(index * 37) % 144]),
            endReason: 'self_draw', winner: 2, wallCount: 14 },
    ];
    for (const { wall, endReason, winner, wallCount } of scenarios) {
        const clock = fakeClock();
        const state = createRound({ wall, clock });
        const ids = ownedIds(state);
        assert.equal(ids.length, 144);
        let windows = 0;
        for (let actions = 0; state.phase !== 'over' && actions < 500; actions++) {
            if (state.phase === 'claims') {
                windows++;
                const id = state.claimWindow.id;
                if (windows % 2 === 0) {
                    for (let seat = 0; seat < 4; seat++) {
                        if (getBestClaim(state, seat)) submitClaim(state, seat, id, 'claim');
                    }
                }
                clock.advance(CLAIM_WINDOW_MS);
            } else if (state.retainedChi && windows % 3 === 0) {
                claimRetainedChi(state, state.currentSeat, state.retainedChi.windowId);
            } else if (state.phase === 'drawFront') {
                drawFront(state, state.currentSeat);
            } else if (state.phase === 'drawBack') {
                drawBack(state, state.currentSeat);
            } else if (state.phase === 'discard') {
                discard(state, state.currentSeat, state.players[state.currentSeat].concealed[0].id);
            } else {
                assert.fail(`Unexpected phase ${state.phase}`);
            }
            assertOwnership(state, ids);
        }
        assert.equal(state.phase, 'over');
        assert.equal(state.endReason, endReason);
        assert.equal(state.winner, winner);
        assert.equal(state.wall.length, wallCount);
        assert.equal(state.claimWindow, null);
        assert.equal(state.retainedChi, null);
        assert.equal(clock.pendingCount, 0);
    }
});

// Reserve exact setup hands and draw endpoints from one real inventory.
function fullWallWithHands(handFaces, front = [], back = []) {
    const inventory = buildWall().map((tile) => tile.tileId);
    const remaining = [...inventory];
    const hands = handFaces.map((hand) => hand === null ? null : hand.split(' '));
    for (const face of [...hands.flat().filter(Boolean), ...front, ...back, '9TAO']) {
        const index = remaining.indexOf(face);
        assert.notEqual(index, -1, `Fixture exceeds inventory for ${face}`);
        remaining.splice(index, 1);
    }
    for (let seat = 0; seat < 4; seat++) {
        const count = seat === 0 ? 17 : 16;
        if (hands[seat] === null) {
            hands[seat] = [];
            for (let tile = 0; tile < count; tile++) {
                const index = remaining.findIndex((face) => !isSpecial(face));
                assert.notEqual(index, -1);
                hands[seat].push(remaining.splice(index, 1)[0]);
            }
        }
        assert.equal(hands[seat].length, count);
    }
    const wall = [];
    for (let packet = 0; packet < 4; packet++) {
        for (const hand of hands) wall.push(...hand.slice(packet * 4, packet * 4 + 4));
    }
    wall.push(hands[0][16], ...front, ...remaining, ...back, '9TAO');
    assert.equal(wall.length, 144);
    assert.deepEqual([...wall].sort(), inventory.sort());
    return wall;
}

test('a full-wall Gold win beats an earlier Peng or a later-seat Win without losing any tile', () => {
    const goldHand = '1WAN 2WAN 4WAN 5WAN 6WAN 1TAO 2TAO 3TAO 4TAO 5TAO 6TAO 7BIN 8BIN 9BIN 5BIN 9TAO';
    const otherWin = '3WAN 3WAN 7WAN 8WAN 9WAN 7TAO 8TAO 9TAO 1BIN 2BIN 3BIN 4BIN 5BIN 6BIN 6WAN 6WAN';
    for (const [otherHand, otherClaim] of [[PENG, 'peng'], [otherWin, 'win']]) {
        const clock = fakeClock();
        const wall = fullWallWithHands([`${NEUTRAL} 3WAN`, goldHand, otherHand, null]);
        const state = createRound({ wall, clock });
        const ids = ownedIds(state);
        assert.equal(ids.length, 144);
        assert.equal(state.phase, 'discard');
        const tile = state.players[0].concealed.find((tile) => tile.tileId === '3WAN');
        discard(state, 0, tile.id);
        assertOwnership(state, ids);
        const id = state.claimWindow.id;
        assert.equal(getBestClaim(state, 1).kind, 'win');
        assert.equal(getBestClaim(state, 2).kind, otherClaim);
        assertRejected(state, () => discard(state, 0, tile.id));
        submitClaim(state, 2, id, 'claim');
        assertOwnership(state, ids);
        submitClaim(state, 1, id, 'claim');
        assertOwnership(state, ids);
        clock.advance(CLAIM_WINDOW_MS);
        assert.equal(state.phase, 'over');
        assert.equal(state.winner, 1);
        assert.equal(state.endReason, 'discard_claim');
        assert.equal(state.wall.length, 78);
        assert.ok(state.players[1].concealed.includes(tile));
        assert.equal(isWinningHand(state.players[1], state.gold), true);
        assert.equal(isWinningHand(state.players[1]), false);
        assert.equal(state.players[2].melds.length, 0);
        assert.equal(clock.pendingCount, 0);
        assertOwnership(state, ids);
        assertRejected(state, () => submitClaim(state, 2, id, 'claim'));
    }
});

test('a full-wall timed Kong and special chain end in a Gold replacement win with 144 tiles', () => {
    const kongHand = '3WAN 3WAN 3WAN 1TAO 2TAO 3TAO 4TAO 5TAO 6TAO 6TAO 7TAO 8TAO 1BIN 2BIN 3BIN 5BIN';
    const wall = fullWallWithHands([`${NEUTRAL} 3WAN`, kongHand, null, null],
        ['WIND_EAST'], ['9TAO', 'FLO_1', 'DRGN_RED']);
    const clock = fakeClock();
    const state = createRound({ wall, clock });
    const ids = ownedIds(state);
    assert.equal(ids.length, 144);
    const indicator = state.gold;
    const tile = state.players[0].concealed.find((tile) => tile.tileId === '3WAN');
    discard(state, 0, tile.id);
    assertOwnership(state, ids);
    const id = state.claimWindow.id;
    assert.equal(getBestClaim(state, 1).kind, 'kong');
    submitClaim(state, 1, id, 'claim');
    assertOwnership(state, ids);
    clock.advance(CLAIM_WINDOW_MS);
    assert.equal(state.phase, 'drawBack');
    assert.equal(state.players[1].melds[0].tiles.length, 4);
    assert.equal(state.players[1].melds[0].tiles[0], tile);
    assert.equal(state.players[1].concealed.length, 13);
    assert.deepEqual(state.players[1].specials.map((tile) => tile.tileId), ['WIND_EAST']);
    assert.equal(state.wall.length, 77);
    assertOwnership(state, ids);
    assertRejected(state, () => drawFront(state, 1), /Cannot/);

    for (const count of [2, 3]) {
        drawBack(state, 1);
        assert.equal(state.phase, 'drawBack');
        assert.equal(state.players[1].specials.length, count);
        assertOwnership(state, ids);
    }
    const replacement = state.wall.at(-1);
    assert.equal(replacement.tileId, '9TAO');
    drawBack(state, 1);
    assert.equal(state.phase, 'over');
    assert.equal(state.endReason, 'self_draw');
    assert.equal(state.winner, 1);
    assert.equal(state.wall.length, 74);
    assert.equal(state.players[1].concealed.length, 14);
    assert.ok(state.players[1].concealed.includes(replacement));
    assert.equal(state.gold, indicator);
    assert.equal(isWinningHand(state.players[1], state.gold), true);
    assert.equal(isWinningHand(state.players[1]), false);
    assert.equal(state.claimWindow, null);
    assert.equal(clock.pendingCount, 0);
    assertOwnership(state, ids);
    const finished = structuredClone(state);
    clock.advance(10000);
    assert.deepEqual(state, finished);
});
