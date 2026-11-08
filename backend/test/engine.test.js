import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../src/game/engine.js';
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
    assert.equal(state.phase, 'setup');
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
    const wall = [...Array(65).fill('1WAN'), '9BIN'];
    const state = createRound({ wall });
    assert.equal(state.gold.tileId, '9BIN');
    assert.equal(state.wall.length, 0);
    assert.equal(state.phase, 'setup');
    assert.equal(state.endReason, null);
    assertConservation(state, wall);
});

test('explicit walls reject unknown faces and malformed input', () => {
    for (const wall of [['unknown'], ['0WAN'], ['10TAO'], [null], new Array(3), '1WAN', null]) {
        assert.throws(() => createRound({ wall }), /Wall/);
    }
});
