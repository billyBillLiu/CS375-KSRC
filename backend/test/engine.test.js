import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClaim, createRound, discard, drawBack, drawFront } from '../src/game/engine.js';
import { createRoundState } from '../src/game/state.js';
import { buildWall, isSpecial } from '../src/game/tiles.js';

function faces(tiles) {
    return tiles.map((tile) => tile.tileId);
}

function assertConservation(state, originalWall) {
    const tiles = [...state.wall, ...state.skippedGoldSpecials];
    if (state.gold) tiles.push(state.gold);
    if (state.pendingDiscard) tiles.push(state.pendingDiscard.tile);
    for (const player of state.players) {
        tiles.push(...player.concealed, ...player.specials, ...player.discards);
        for (const meld of player.melds) tiles.push(...meld.tiles);
    }
    assert.equal(tiles.length, originalWall.length);
    assert.equal(new Set(tiles.map((tile) => tile.id)).size, originalWall.length);
    assert.deepEqual(faces(tiles).sort(), [...originalWall].sort());
}

test('setup deals four packets per seat, then one extra to the dealer', () => {
    const wall = Object.freeze(faces(buildWall()));
    const state = createRound({ wall, random: () => assert.fail('Explicit walls must not be shuffled') });
    const expectedHands = [
        [...Array(4).fill('1WAN'), ...Array(4).fill('5WAN'), ...Array(4).fill('9WAN'),
            ...Array(4).fill('4TAO'), '8TAO'],
        [...Array(4).fill('2WAN'), ...Array(4).fill('6WAN'),
            ...Array(4).fill('1TAO'), ...Array(4).fill('5TAO')],
        [...Array(4).fill('3WAN'), ...Array(4).fill('7WAN'),
            ...Array(4).fill('2TAO'), ...Array(4).fill('6TAO')],
        [...Array(4).fill('4WAN'), ...Array(4).fill('8WAN'),
            ...Array(4).fill('3TAO'), ...Array(4).fill('7TAO')],
    ];
    assert.deepEqual(state.players.map((player) => faces(player.concealed)), expectedHands);
    assert.deepEqual(state.players.map((player) => player.concealed.length), [17, 16, 16, 16]);
    assert.equal(state.gold.tileId, '9BIN');
    assert.deepEqual(faces(state.skippedGoldSpecials), wall.slice(108).reverse());
    assert.deepEqual(faces(state.wall), wall.slice(65, 107));
    assert.equal(state.currentSeat, 0);
    assert.equal(state.phase, 'discard');
    assert.equal(state.winner, null);
    assert.equal(state.endReason, null);
    assertConservation(state, wall);
});

test('setup scans hands backwards and repeats all seats before replacing new specials', () => {
    const wall = Array(65).fill('1WAN');
    wall[0] = 'WIND_EAST';
    wall[3] = 'DRGN_RED';
    wall[4] = 'FLO_1';
    wall[64] = 'SZN_SPR';
    wall.push('3BIN', '2WAN', 'FLO_2', '6TAO', '7TAO', 'WIND_SOUTH', '8BIN', '9BIN', 'DRGN_WHITE');
    const originalWall = [...wall];
    const state = createRound({ wall });

    assert.deepEqual(faces(state.players[0].specials), ['SZN_SPR', 'DRGN_RED', 'WIND_EAST', 'DRGN_WHITE']);
    assert.deepEqual(faces(state.players[1].specials), ['FLO_1', 'WIND_SOUTH']);
    assert.deepEqual(faces(state.players[0].concealed), [...Array(14).fill('1WAN'), '7TAO', '8BIN', '9BIN']);
    assert.deepEqual(faces(state.players[1].concealed), [...Array(15).fill('1WAN'), '6TAO']);
    assert.deepEqual(state.players.map((player) => player.concealed.length), [17, 16, 16, 16]);
    for (const player of state.players) {
        assert.ok(player.concealed.every((tile) => !isSpecial(tile.tileId)));
    }
    assert.equal(state.gold.tileId, '2WAN');
    assert.deepEqual(faces(state.skippedGoldSpecials), ['FLO_2']);
    assert.deepEqual(faces(state.wall), ['3BIN']);
    assert.deepEqual(wall, originalWall);
    assertConservation(state, wall);
});

test('default setup shuffles a full inventory and conserves every tile', () => {
    const inventory = faces(buildWall());
    let randomCalls = 0;
    const state = createRound({ random: () => {
        randomCalls++;
        return 0;
    } });
    // Always swapping with index zero rotates the first tile to the back.
    const expectedWall = [...inventory.slice(1), inventory[0]];
    const expected = createRound({ wall: expectedWall });
    assert.equal(randomCalls, 143);
    assert.deepEqual(state.players.map((player) => faces(player.concealed)),
        expected.players.map((player) => faces(player.concealed)));
    assert.deepEqual(state.players.map((player) => faces(player.specials)),
        expected.players.map((player) => faces(player.specials)));
    assert.deepEqual(faces(state.wall), faces(expected.wall));
    assert.equal(state.gold.tileId, '1WAN');
    assertConservation(state, inventory);
});

const exhaustionCases = [
    { name: 'before dealing', wall: [], handSizes: [0, 0, 0, 0] },
    { name: 'partway through a packet', wall: Array(7).fill('1WAN'), handSizes: [4, 3, 0, 0] },
    { name: 'before the dealer extra', wall: Array(64).fill('1WAN'), handSizes: [16, 16, 16, 16] },
    { name: 'before Gold selection', wall: Array(65).fill('1WAN'), handSizes: [17, 16, 16, 16] },
    { name: 'during special replacement', wall: ['WIND_EAST', ...Array(64).fill('1WAN')],
        handSizes: [16, 16, 16, 16], specials: ['WIND_EAST'] },
    { name: 'during a repeated special replacement',
        wall: ['WIND_EAST', ...Array(64).fill('1WAN'), 'DRGN_RED'],
        handSizes: [16, 16, 16, 16], specials: ['WIND_EAST', 'DRGN_RED'] },
    { name: 'while skipping Gold specials', wall: [...Array(65).fill('1WAN'), 'FLO_1', 'SZN_WNT'],
        handSizes: [17, 16, 16, 16], skippedGoldSpecials: ['SZN_WNT', 'FLO_1'] },
];

for (const scenario of exhaustionCases) {
    test(`wall exhaustion ${scenario.name} ends safely without losing tiles`, () => {
        const state = createRound({ wall: scenario.wall });
        assert.equal(state.phase, 'over');
        assert.equal(state.endReason, 'wall_exhausted');
        assert.equal(state.winner, null);
        assert.equal(state.gold, null);
        assert.equal(state.wall.length, 0);
        assert.deepEqual(state.players.map((player) => player.concealed.length), scenario.handSizes);
        assert.deepEqual(faces(state.players[0].specials), scenario.specials ?? []);
        assert.deepEqual(faces(state.skippedGoldSpecials), scenario.skippedGoldSpecials ?? []);
        assertConservation(state, scenario.wall);
    });
}

test('taking the last wall tile as Gold completes setup without an extra draw', () => {
    const wall = [...faces(buildWall()).slice(0, 65), '9BIN'];
    const state = createRound({ wall });
    assert.equal(state.gold.tileId, '9BIN');
    assert.equal(state.wall.length, 0);
    assert.equal(state.phase, 'discard');
    assert.equal(state.endReason, null);
    assertConservation(state, wall);
});

test('explicit walls reject unknown faces and malformed input', () => {
    for (const wall of [['unknown'], ['0WAN'], ['10TAO'], [null], new Array(3), '1WAN', null]) {
        assert.throws(() => createRound({ wall }), /Wall/);
    }
});

const waitingHand = '1WAN 2WAN 3WAN 4WAN 5WAN 6WAN 2TAO 2TAO 2TAO 4TAO 5TAO 6TAO 7BIN 8BIN 5BIN 5BIN'.split(' ');

// Start at a later turn without implementing claim resolution in these tests.
function createDrawState(wall, seat = 1, hand = waitingHand) {
    const state = createRoundState({ wall: [...hand, ...wall, '9TAO'] });
    state.players[seat].concealed = state.wall.splice(0, hand.length);
    state.gold = state.wall.pop();
    state.currentSeat = seat;
    state.phase = 'drawFront';
    return state;
}

function assertRejectedDraw(state, action, seat) {
    const before = structuredClone(state);
    assert.throws(() => action(state, seat), /seat|turn|Cannot/);
    assert.deepEqual(state, before);
}

function wallForDealerHand(hand, goldFace) {
    const remaining = faces(buildWall());
    for (const face of [...hand, goldFace]) {
        const index = remaining.indexOf(face);
        assert.notEqual(index, -1);
        remaining.splice(index, 1);
    }
    const wall = [];
    for (let packet = 0; packet < 4; packet++) {
        wall.push(...hand.slice(packet * 4, packet * 4 + 4));
        wall.push(...remaining.splice(0, 12));
    }
    wall.push(hand[16], ...remaining, goldFace);
    return wall;
}

test('setup automatically ends on a dealer win, including a Gold substitution', () => {
    const naturalHand = [...waitingHand, '9BIN'];
    const goldHand = [...naturalHand];
    goldHand[2] = '9TAO';
    for (const hand of [naturalHand, goldHand]) {
        const wall = wallForDealerHand(hand, '9TAO');
        const state = createRound({ wall });
        assert.equal(state.phase, 'over');
        assert.equal(state.winner, 0);
        assert.equal(state.endReason, 'self_draw');
        assert.equal(state.players[0].concealed.length, 17);
        assert.equal(state.wall.length, 78);
        assertRejectedDraw(state, drawFront, 0);
        assertRejectedDraw(state, drawBack, 0);
        assertConservation(state, wall);
    }
});

test('the dealer starts with discard and cannot take an extra opening draw', () => {
    const state = createRound({ wall: faces(buildWall()) });
    assert.equal(state.phase, 'discard');
    assertRejectedDraw(state, drawFront, 0);
    assertRejectedDraw(state, drawBack, 0);
});

test('each seat draws one front tile, sorts its hand, then must discard', () => {
    for (let seat = 0; seat < 4; seat++) {
        const wall = ['1BIN', '9WAN'];
        const state = createDrawState(wall, seat);
        const drawnTile = state.wall[0];
        assert.equal(drawFront(state, seat), state);
        assert.equal(state.phase, 'discard');
        assert.equal(state.currentSeat, seat);
        assert.equal(state.winner, null);
        assert.equal(state.endReason, null);
        assert.deepEqual(faces(state.wall), ['9WAN']);
        assert.ok(state.players[seat].concealed.includes(drawnTile));
        assert.deepEqual(faces(state.players[seat].concealed),
            '1WAN 2WAN 3WAN 4WAN 5WAN 6WAN 2TAO 2TAO 2TAO 4TAO 5TAO 6TAO 1BIN 5BIN 5BIN 7BIN 8BIN'.split(' '));
        assertRejectedDraw(state, drawFront, seat);
        assertRejectedDraw(state, drawBack, seat);
        assertConservation(state, [...waitingHand, ...wall, '9TAO']);
    }
});

test('a special front draw requires manual back replacements and conserves the full wall', () => {
    const inventory = faces(buildWall());
    const dealt = inventory.splice(0, 65);
    for (const face of ['WIND_EAST', '1BIN', 'FLO_1', 'DRGN_RED', '9BIN']) {
        inventory.splice(inventory.indexOf(face), 1);
    }
    const wall = [...dealt, 'WIND_EAST', ...inventory, '1BIN', 'FLO_1', 'DRGN_RED', '9BIN'];
    const state = createRound({ wall });
    state.players[0].discards.push(state.players[0].concealed.pop());
    state.currentSeat = 1;
    state.phase = 'drawFront';
    const originalCount = state.wall.length;

    drawFront(state, 1);
    assert.equal(state.phase, 'drawBack');
    assert.equal(state.players[1].concealed.length, 16);
    assert.deepEqual(faces(state.players[1].specials), ['WIND_EAST']);
    assert.equal(state.wall.length, originalCount - 1);
    assertConservation(state, wall);
    assertRejectedDraw(state, drawFront, 1);

    for (const expectedSpecials of [['WIND_EAST', 'DRGN_RED'], ['WIND_EAST', 'DRGN_RED', 'FLO_1']]) {
        drawBack(state, 1);
        assert.equal(state.phase, 'drawBack');
        assert.equal(state.players[1].concealed.length, 16);
        assert.deepEqual(faces(state.players[1].specials), expectedSpecials);
        assertConservation(state, wall);
    }
    const replacement = state.wall.at(-1);
    drawBack(state, 1);
    assert.equal(state.phase, 'discard');
    assert.equal(state.players[1].concealed.length, 17);
    assert.ok(state.players[1].concealed.includes(replacement));
    assert.equal(replacement.tileId, '1BIN');
    assert.equal(state.wall.length, originalCount - 4);
    assertConservation(state, wall);
    assertRejectedDraw(state, drawBack, 1);
});

test('a winning front draw ends the round, including Gold on the last wall tile', () => {
    for (const face of ['9BIN', '9TAO']) {
        const state = createDrawState([face]);
        drawFront(state, 1);
        assert.equal(state.phase, 'over');
        assert.equal(state.winner, 1);
        assert.equal(state.endReason, 'self_draw');
        assert.equal(state.wall.length, 0);
        assertRejectedDraw(state, drawFront, 1);
        assertRejectedDraw(state, drawBack, 1);
        assertConservation(state, [...waitingHand, face, '9TAO']);
    }
});

test('a playable back replacement checks for a self-win after a season', () => {
    const wall = ['SZN_SPR', '1BIN', '9BIN'];
    const state = createDrawState(wall, 3);
    drawFront(state, 3);
    assert.equal(state.phase, 'drawBack');
    assert.equal(state.winner, null);
    drawBack(state, 3);
    assert.equal(state.phase, 'over');
    assert.equal(state.winner, 3);
    assert.equal(state.endReason, 'self_draw');
    assert.deepEqual(faces(state.wall), ['1BIN']);
    assert.deepEqual(faces(state.players[3].specials), ['SZN_SPR']);
    assertConservation(state, [...waitingHand, ...wall, '9TAO']);
});

test('draw win checks count a locked Kong as one meld', () => {
    const hand = waitingHand.slice(3);
    const state = createDrawState(['9BIN'], 1, hand);
    state.players[1].melds.push({ id: 0, kind: 'kong', tiles: buildWall(Array(4).fill('8TAO')), fromSeat: 0 });
    drawFront(state, 1);
    assert.equal(state.phase, 'over');
    assert.equal(state.winner, 1);
    assert.equal(state.players[1].concealed.length, 14);
    assertConservation(state, [...hand, '9BIN', '9TAO', ...Array(4).fill('8TAO')]);
});

test('an empty front wall and exhausted special chains end without losing tiles', () => {
    for (const wall of [[], ['WIND_EAST'], ['WIND_EAST', 'DRGN_RED']]) {
        const state = createDrawState(wall);
        drawFront(state, 1);
        if (state.phase === 'drawBack') drawBack(state, 1);
        assert.equal(state.phase, 'over');
        assert.equal(state.endReason, 'wall_exhausted');
        assert.equal(state.winner, null);
        assert.equal(state.wall.length, 0);
        assert.equal(state.players[1].concealed.length, 16);
        assert.deepEqual(faces(state.players[1].specials), wall);
        assertConservation(state, [...waitingHand, ...wall, '9TAO']);
        assertRejectedDraw(state, drawFront, 1);
        assertRejectedDraw(state, drawBack, 1);
    }
});

test('the last playable non-winning tile still leads to discard', () => {
    const state = createDrawState(['1BIN']);
    drawFront(state, 1);
    assert.equal(state.wall.length, 0);
    assert.equal(state.phase, 'discard');
    assert.equal(state.endReason, null);
    assert.equal(state.players[1].concealed.length, 17);
});

test('draws reject invalid seats and wrong phases before changing any state', () => {
    const state = createDrawState(['1BIN', 'WIND_EAST']);
    for (const seat of [-1, 4, 1.5, '1', NaN, null, undefined, 0, 2, 3]) {
        assertRejectedDraw(state, drawFront, seat);
        state.phase = 'drawBack';
        assertRejectedDraw(state, drawBack, seat);
        state.phase = 'drawFront';
    }
    for (const phase of ['setup', 'discard', 'claims', 'over', 'drawBack']) {
        state.phase = phase;
        assertRejectedDraw(state, drawFront, 1);
    }
    for (const phase of ['setup', 'discard', 'claims', 'over', 'drawFront']) {
        state.phase = phase;
        assertRejectedDraw(state, drawBack, 1);
    }
});

test('a legal draw settles the pending discard once, while an illegal draw leaves it pending', () => {
    const wall = ['3WAN', 'WIND_EAST', '9BIN'];
    const state = createDrawState(wall);
    const pendingTile = state.wall.shift();
    state.pendingDiscard = { tile: pendingTile, fromSeat: 0 };
    assertRejectedDraw(state, drawFront, 2);
    drawFront(state, 1);
    assert.equal(state.pendingDiscard, null);
    assert.deepEqual(state.players[0].discards, [pendingTile]);
    drawBack(state, 1);
    assert.deepEqual(state.players[0].discards, [pendingTile]);
    assertConservation(state, [...waitingHand, ...wall, '9TAO']);
});

function assertRejectedDiscard(state, seat, tileId) {
    const before = structuredClone(state);
    assert.throws(() => discard(state, seat, tileId), /seat|turn|Cannot|instance ID|concealed hand/);
    assert.deepEqual(state, before);
}

test('discard moves the exact owned instance into claims and preserves matching copies', () => {
    const wall = faces(buildWall());
    const state = createRound({ wall });
    const before = structuredClone(state);
    const hand = [...state.players[0].concealed];
    const selected = hand[1];
    assert.equal(hand[0].tileId, selected.tileId);
    assert.notEqual(hand[0].id, selected.id);

    assert.equal(discard(state, 0, selected.id), state);
    assert.deepEqual(state.players[0].concealed, hand.filter((tile) => tile !== selected));
    assert.equal(state.pendingDiscard.tile, selected);
    assert.equal(state.pendingDiscard.fromSeat, 0);
    assert.equal(state.phase, 'claims');
    assert.equal(state.currentSeat, 0);
    assert.equal(state.winner, null);
    assert.equal(state.endReason, null);
    assert.deepEqual(state.wall, before.wall);
    assert.deepEqual(state.gold, before.gold);
    assert.deepEqual(state.players.slice(1), before.players.slice(1));
    assert.deepEqual(state.players[0].discards, []);
    assertConservation(state, wall);

    assertRejectedDiscard(state, 0, selected.id);
    assertRejectedDiscard(state, 0, hand[0].id);
    assertRejectedDraw(state, drawFront, 0);
    assertRejectedDraw(state, drawBack, 0);
});

test('each seat can discard after a normal draw or back replacement, even with an empty wall', () => {
    for (const wall of [['1BIN'], ['FLO_1', '1BIN']]) {
        for (let seat = 0; seat < 4; seat++) {
            const state = createDrawState(wall, seat);
            drawFront(state, seat);
            if (state.phase === 'drawBack') drawBack(state, seat);
            assert.equal(state.phase, 'discard');
            assert.equal(state.wall.length, 0);
            const selected = state.players[seat].concealed.find((tile) => tile.tileId === '1BIN');
            discard(state, seat, selected.id);
            assert.equal(state.phase, 'claims');
            assert.equal(state.endReason, null);
            assert.equal(state.currentSeat, seat);
            assert.equal(state.players[seat].concealed.length, 16);
            assert.deepEqual(state.pendingDiscard, { tile: selected, fromSeat: seat });
            assertConservation(state, [...waitingHand, ...wall, '9TAO']);
        }
    }
});

test('a concealed Gold tile can be discarded without moving the Gold indicator', () => {
    const hand = [...waitingHand, '1BIN'];
    hand[0] = '9TAO';
    const wall = wallForDealerHand(hand, '9TAO');
    const state = createRound({ wall });
    assert.equal(state.phase, 'discard');
    const indicator = state.gold;
    const selected = state.players[0].concealed.find((tile) => tile.tileId === indicator.tileId);
    assert.notEqual(selected.id, indicator.id);
    discard(state, 0, selected.id);
    assert.equal(state.pendingDiscard.tile, selected);
    assert.equal(state.gold, indicator);
    assertConservation(state, wall);
});

test('discard rejects invalid seats and every phase other than discard without mutation', () => {
    const state = createDrawState(['1BIN']);
    drawFront(state, 1);
    const selected = state.players[1].concealed[0];
    for (const seat of [-1, 4, 1.5, '1', NaN, null, undefined, 0, 2, 3]) {
        assertRejectedDiscard(state, seat, selected.id);
    }
    for (const phase of ['setup', 'drawFront', 'drawBack', 'claims', 'over']) {
        state.phase = phase;
        assertRejectedDiscard(state, 1, selected.id);
    }
});

test('discard rejects malformed IDs, face names and unknown instances', () => {
    const state = createRound({ wall: faces(buildWall()) });
    const selected = state.players[0].concealed[0];
    for (const id of [undefined, null, 0, '', [], {}, { id: selected.id }, selected.tileId, 'missing-tile']) {
        assertRejectedDiscard(state, 0, id);
    }
});

test('only concealed ownership permits discard, even when other zones contain the same face', () => {
    const wall = faces(buildWall());
    const state = createRound({ wall });
    const player = state.players[0];
    player.melds.push({ id: 0, kind: 'peng', tiles: player.concealed.splice(0, 3), fromSeat: 1 });
    player.specials.push(state.skippedGoldSpecials.pop());
    player.discards.push(state.wall.shift());
    state.pendingDiscard = { tile: state.wall.shift(), fromSeat: 3 };
    const forbidden = [
        state.wall[0], state.gold, state.skippedGoldSpecials[0], state.pendingDiscard.tile,
        state.players[1].concealed[0], player.melds[0].tiles[0], player.specials[0], player.discards[0],
    ];
    assert.equal(player.melds[0].tiles[0].tileId, player.concealed[0].tileId);
    for (const tile of forbidden) assertRejectedDiscard(state, 0, tile.id);

    const selected = player.concealed[0];
    discard(state, 0, selected.id);
    assert.equal(state.pendingDiscard.tile, selected);
    assert.equal(player.concealed.length, 13);
    assertConservation(state, wall);
});

test('discard settles an older pending tile once before replacing it with the new discard', () => {
    const wall = faces(buildWall());
    const state = createRound({ wall });
    const settledTile = state.wall.shift();
    const previousTile = state.wall.shift();
    state.players[3].discards.push(settledTile);
    state.pendingDiscard = { tile: previousTile, fromSeat: 3 };
    assertRejectedDiscard(state, 0, 'missing-tile');
    assertRejectedDiscard(state, 0, previousTile.id);
    const selected = state.players[0].concealed[0];
    discard(state, 0, selected.id);
    assert.deepEqual(state.players[3].discards, [settledTile, previousTile]);
    assert.deepEqual(state.pendingDiscard, { tile: selected, fromSeat: 0 });
    assert.deepEqual(state.players[0].discards, []);
    assertRejectedDiscard(state, 0, selected.id);
    assertConservation(state, wall);
});

const chiHand = '1WAN 2WAN 2WAN 4WAN 5WAN 7WAN 8WAN 1TAO 3TAO 5TAO 7TAO 1BIN 3BIN 5BIN 7BIN 9BIN'.split(' ');
const kongHand = '3WAN 3WAN 3WAN 1WAN 2WAN 4WAN 5WAN 7WAN 8WAN 1TAO 3TAO 5TAO 7TAO 1BIN 3BIN 5BIN'.split(' ');
const kongWinningHand = '3WAN 3WAN 3WAN 1TAO 2TAO 3TAO 4TAO 5TAO 6TAO 6TAO 7TAO 8TAO 1BIN 2BIN 3BIN 5BIN'.split(' ');

function createClaimState(hand, candidate, wall = [], seat = 1, fromSeat = 0) {
    const state = createDrawState([candidate, ...wall], seat, hand);
    const tile = state.wall.shift();
    state.players[fromSeat].concealed.push(tile);
    state.currentSeat = fromSeat;
    state.phase = 'discard';
    discard(state, fromSeat, tile.id);
    return state;
}

function assertRejectedClaim(state, seat) {
    const before = structuredClone(state);
    assert.throws(() => applyClaim(state, seat), /seat|No claim/);
    assert.deepEqual(state, before);
}

test('Chi, Peng and Kong move physical tiles into one meld while conserving a full wall', () => {
    for (const { kind, swaps, expectedTiles } of [
        { kind: 'chi', swaps: [[4, 8]], expectedTiles: ['1WAN', '2WAN', '3WAN'] },
        { kind: 'peng', swaps: [[1, 4], [2, 5]], expectedTiles: Array(3).fill('1WAN') },
        { kind: 'kong', swaps: [[1, 4], [2, 5], [3, 6]], expectedTiles: Array(4).fill('1WAN') },
    ]) {
        const wall = faces(buildWall());
        for (const [first, second] of swaps) [wall[first], wall[second]] = [wall[second], wall[first]];
        const state = createRound({ wall });
        discard(state, 0, state.players[0].concealed[0].id);
        const pendingTile = state.pendingDiscard.tile;
        const originalHand = [...state.players[1].concealed];
        const before = structuredClone(state);

        assert.equal(applyClaim(state, 1), state);
        const player = state.players[1];
        const meld = player.melds[0];
        assert.equal(player.melds.length, 1);
        assert.equal(meld.id, 0);
        assert.equal(meld.kind, kind);
        assert.equal(meld.fromSeat, 0);
        assert.deepEqual(faces(meld.tiles), expectedTiles);
        assert.equal(meld.tiles[0], pendingTile);
        assert.ok(meld.tiles.slice(1).every((tile) => originalHand.includes(tile)));
        assert.ok(meld.tiles.every((tile) => !player.concealed.includes(tile)));
        assert.equal(player.concealed.length, 14);
        assert.equal(state.nextMeldId, 1);
        assert.equal(state.pendingDiscard, null);
        assert.equal(state.currentSeat, 1);
        assert.equal(state.phase, 'discard');
        assert.equal(state.winner, null);
        assert.equal(state.endReason, null);
        assert.deepEqual(state.wall, kind === 'kong' ? before.wall.slice(1) : before.wall);
        assert.deepEqual(state.gold, before.gold);
        assert.deepEqual(state.skippedGoldSpecials, before.skippedGoldSpecials);
        for (const seat of [0, 2, 3]) assert.deepEqual(state.players[seat], before.players[seat]);
        assertConservation(state, wall);
        assertRejectedClaim(state, 1);
        assertRejectedDraw(state, drawFront, 1);
        assertRejectedDraw(state, drawBack, 1);
        for (const tile of meld.tiles) assertRejectedDiscard(state, 1, tile.id);

        discard(state, 1, player.concealed[0].id);
        assert.equal(player.concealed.length, 13);
        assert.equal(player.melds[0], meld);
        assertConservation(state, wall);
    }
});

test('Chi uses the first valid combination and leaves an unused matching copy concealed', () => {
    const state = createClaimState(chiHand, '3WAN');
    const copies = state.players[1].concealed.filter((tile) => tile.tileId === '2WAN');
    applyClaim(state, 1);
    assert.deepEqual(faces(state.players[1].melds[0].tiles), ['3WAN', '1WAN', '2WAN']);
    assert.equal(state.players[1].melds[0].tiles[2], copies[0]);
    assert.ok(state.players[1].concealed.includes(copies[1]));
    assert.equal(state.phase, 'discard');
    assertConservation(state, [...chiHand, '3WAN', '9TAO']);
});

test('a new meld gets a fresh ID without changing an existing meld', () => {
    const hand = chiHand.slice(0, 13);
    const state = createClaimState(hand, '3WAN');
    const existing = { id: 4, kind: 'chi', tiles: buildWall(['6TAO', '7TAO', '8TAO']), fromSeat: 3 };
    const before = structuredClone(existing);
    state.players[1].melds.push(existing);
    state.nextMeldId = 5;
    applyClaim(state, 1);
    assert.equal(state.players[1].melds[0], existing);
    assert.deepEqual(existing, before);
    assert.equal(state.players[1].melds[1].id, 5);
    assert.equal(state.nextMeldId, 6);
    assert.equal(state.players[1].concealed.length, 11);
    assertConservation(state, [...hand, '3WAN', '9TAO', '6TAO', '7TAO', '8TAO']);
});

test('discard wins move the pending tile into the winner hand without drawing or changing the turn seat', () => {
    for (let seat = 0; seat < 4; seat++) {
        for (const candidate of ['9BIN', '9TAO']) {
            const fromSeat = (seat + 3) % 4;
            const wall = ['1BIN', '2BIN'];
            const state = createClaimState(waitingHand, candidate, wall, seat, fromSeat);
            const pendingTile = state.pendingDiscard.tile;
            const wallBefore = [...state.wall];
            applyClaim(state, seat);
            assert.equal(state.phase, 'over');
            assert.equal(state.winner, seat);
            assert.equal(state.endReason, 'discard_claim');
            assert.equal(state.currentSeat, fromSeat);
            assert.equal(state.pendingDiscard, null);
            assert.equal(state.players[seat].concealed.length, 17);
            assert.ok(state.players[seat].concealed.includes(pendingTile));
            assert.deepEqual(state.players[seat].melds, []);
            assert.deepEqual(state.players[fromSeat].discards, []);
            assert.deepEqual(state.wall, wallBefore);
            assert.equal(state.nextMeldId, 0);
            assertConservation(state, [...waitingHand, candidate, ...wall, '9TAO']);
            assertRejectedClaim(state, seat);
        }
    }
});

test('Win is applied ahead of the claimant Kong and does not consume a replacement', () => {
    const hand = '1WAN 1WAN 1WAN 2WAN 3WAN 4WAN 5WAN 6WAN 2TAO 2TAO 2TAO 4TAO 5TAO 6TAO 5BIN 5BIN'.split(' ');
    const state = createClaimState(hand, '1WAN', ['FLO_1']);
    applyClaim(state, 1);
    assert.equal(state.endReason, 'discard_claim');
    assert.equal(state.winner, 1);
    assert.deepEqual(state.players[1].melds, []);
    assert.deepEqual(faces(state.wall), ['FLO_1']);
    assertConservation(state, [...hand, '1WAN', 'FLO_1', '9TAO']);
});

test('Kong takes one front replacement and repeated specials require manual back draws', () => {
    const wall = ['WIND_EAST', '1BIN', '6BIN', 'FLO_1', 'DRGN_RED'];
    const state = createClaimState(kongHand, '3WAN', wall);
    const inventory = [...kongHand, '3WAN', ...wall, '9TAO'];
    applyClaim(state, 1);
    const meld = state.players[1].melds[0];
    assert.equal(meld.kind, 'kong');
    assert.equal(meld.tiles.length, 4);
    assert.equal(state.phase, 'drawBack');
    assert.equal(state.currentSeat, 1);
    assert.equal(state.players[1].concealed.length, 13);
    assert.deepEqual(faces(state.players[1].specials), ['WIND_EAST']);
    assert.deepEqual(faces(state.wall), wall.slice(1));
    assertRejectedClaim(state, 1);
    assertRejectedDraw(state, drawFront, 1);
    assertRejectedDiscard(state, 1, state.players[1].concealed[0].id);
    assertConservation(state, inventory);

    for (const expected of [['WIND_EAST', 'DRGN_RED'], ['WIND_EAST', 'DRGN_RED', 'FLO_1']]) {
        drawBack(state, 1);
        assert.equal(state.phase, 'drawBack');
        assert.equal(state.players[1].concealed.length, 13);
        assert.deepEqual(faces(state.players[1].specials), expected);
        assertConservation(state, inventory);
    }
    drawBack(state, 1);
    assert.equal(state.phase, 'discard');
    assert.equal(state.players[1].concealed.length, 14);
    assert.equal(state.players[1].melds[0], meld);
    assert.equal(state.players[1].melds.length, 1);
    assert.deepEqual(faces(state.wall), ['1BIN']);
    assertConservation(state, inventory);
    assertRejectedDraw(state, drawFront, 1);
    assertRejectedDraw(state, drawBack, 1);
});

test('Kong replacement wins work from the front or back, including Gold', () => {
    for (const wall of [
        ['5BIN', '1WAN'], ['9TAO', '1WAN'],
        ['WIND_EAST', '1WAN', '5BIN', 'FLO_1'], ['WIND_EAST', '1WAN', '9TAO', 'FLO_1'],
    ]) {
        const state = createClaimState(kongWinningHand, '3WAN', wall);
        applyClaim(state, 1);
        while (state.phase === 'drawBack') drawBack(state, 1);
        assert.equal(state.phase, 'over');
        assert.equal(state.winner, 1);
        assert.equal(state.endReason, 'self_draw');
        assert.equal(state.players[1].melds.length, 1);
        assert.equal(state.players[1].melds[0].kind, 'kong');
        assert.equal(state.players[1].concealed.length, 14);
        assert.deepEqual(faces(state.wall), ['1WAN']);
        assertConservation(state, [...kongWinningHand, '3WAN', ...wall, '9TAO']);
        assertRejectedDraw(state, drawFront, 1);
        assertRejectedDraw(state, drawBack, 1);
    }
});

test('exhausted Kong replacements end the round but keep the completed meld and every tile', () => {
    for (const wall of [[], ['WIND_EAST'], ['WIND_EAST', 'FLO_1']]) {
        const state = createClaimState(kongHand, '3WAN', wall);
        applyClaim(state, 1);
        while (state.phase === 'drawBack') drawBack(state, 1);
        assert.equal(state.phase, 'over');
        assert.equal(state.endReason, 'wall_exhausted');
        assert.equal(state.winner, null);
        assert.equal(state.currentSeat, 1);
        assert.equal(state.pendingDiscard, null);
        assert.equal(state.players[1].melds.length, 1);
        assert.equal(state.players[1].melds[0].tiles.length, 4);
        assert.equal(state.players[1].concealed.length, 13);
        assert.deepEqual(faces(state.players[1].specials), wall);
        assert.equal(state.nextMeldId, 1);
        assertConservation(state, [...kongHand, '3WAN', ...wall, '9TAO']);
        assertRejectedClaim(state, 1);
    }
});

test('Gold used naturally in a Chi moves into the meld without moving the indicator', () => {
    const hand = [...chiHand];
    hand[2] = '9TAO';
    const state = createClaimState(hand, '8TAO');
    const indicator = state.gold;
    const concealedGold = state.players[1].concealed.find((tile) => tile.tileId === '9TAO');
    applyClaim(state, 1);
    assert.deepEqual(faces(state.players[1].melds[0].tiles), ['8TAO', '7TAO', '9TAO']);
    assert.ok(state.players[1].melds[0].tiles.includes(concealedGold));
    assert.equal(state.gold, indicator);
    assertConservation(state, [...hand, '8TAO', '9TAO']);
});

test('claim application rejects invalid seats, self-claims, ineligible players and wrong phases without mutation', () => {
    const state = createClaimState(chiHand, '3WAN');
    for (const seat of [-1, 4, 1.5, '1', NaN, null, undefined, 0, 2, 3]) {
        assertRejectedClaim(state, seat);
    }
    for (const phase of ['setup', 'drawFront', 'drawBack', 'discard', 'over']) {
        state.phase = phase;
        assertRejectedClaim(state, 1);
    }
    state.phase = 'claims';
    state.pendingDiscard = null;
    assertRejectedClaim(state, 1);
});

test('claim eligibility is checked again against the current concealed tiles', () => {
    const state = createClaimState(chiHand, '3WAN');
    state.players[1].discards.push(...state.players[1].concealed.splice(0, 5));
    assertRejectedClaim(state, 1);
});
