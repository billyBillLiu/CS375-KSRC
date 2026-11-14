import { createRound, discard } from '../src/game/engine.js';
import { buildWall } from '../src/game/tiles.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomError, createRoomManager } from '../src/rooms/manager.js';
import { SERVER_MESSAGES } from '../../shared/protocol.js';

function fakeSocket() {
    const sent = [];
    return {
        sent,
        send: (data) => sent.push(JSON.parse(data)),
        last(type) { return sent.findLast((message) => message.type === type)?.payload; },
    };
}

function connect(rooms, count) {
    return Array.from({ length: count }, () => {
        const socket = fakeSocket();
        rooms.addConnection(socket);
        return socket;
    });
}

test('four connections can join one room and a fifth is rejected', () => {
    const rooms = createRoomManager();
    const sockets = connect(rooms, 5);
    rooms.createRoom(sockets[0], 'Sunny');
    for (const socket of sockets.slice(1, 4)) rooms.joinRoom(socket, '1', '');

    const state = sockets[3].last(SERVER_MESSAGES.ROOM_STATE);
    assert.equal(state.you, 3);
    assert.deepEqual(state.seats.map((seat) => seat.name), ['Sunny', 'Player 2', 'Player 3', 'Player 4']);
    assert.throws(() => rooms.joinRoom(sockets[4], '1', 'Late'), /room is full/);
    assert.deepEqual(sockets[4].last(SERVER_MESSAGES.ROOM_LIST).rooms,
        [{ id: '1', playerNames: ['Sunny', 'Player 2', 'Player 3', 'Player 4'], isFull: true }]);
});

test('leaving a waiting room frees the seat for someone else', () => {
    const rooms = createRoomManager();
    const sockets = connect(rooms, 3);
    rooms.createRoom(sockets[0], 'A');
    rooms.joinRoom(sockets[1], '1', 'B');
    rooms.leaveRoom(sockets[0]);

    assert.deepEqual(sockets[1].last(SERVER_MESSAGES.ROOM_STATE).seats, [null, { name: 'B', ready: false }, null, null]);
    rooms.joinRoom(sockets[2], '1', 'C');
    assert.equal(sockets[2].last(SERVER_MESSAGES.ROOM_STATE).you, 0);
    assert.equal(sockets[0].last(SERVER_MESSAGES.ROOM_LIST).rooms[0].playerNames.length, 2);
});

test('players outside rooms see the room list update as membership changes', () => {
    const rooms = createRoomManager();
    const [host, guest, watcher] = connect(rooms, 3);
    rooms.createRoom(host, 'Host');
    assert.deepEqual(watcher.last(SERVER_MESSAGES.ROOM_LIST).rooms, [{ id: '1', playerNames: ['Host'], isFull: false }]);
    rooms.joinRoom(guest, '1', 'Guest');
    assert.deepEqual(watcher.last(SERVER_MESSAGES.ROOM_LIST).rooms[0].playerNames, ['Host', 'Guest']);
    assert.equal(host.sent.filter((message) => message.type === SERVER_MESSAGES.ROOM_LIST).length, 0);
});

test('ready status is shared with everyone in the room', () => {
    const rooms = createRoomManager();
    const [host, guest] = connect(rooms, 2);
    rooms.createRoom(host, 'Host');
    rooms.joinRoom(guest, '1', 'Guest');
    rooms.setReady(guest, true);
    assert.deepEqual(host.last(SERVER_MESSAGES.ROOM_STATE).seats[1], { name: 'Guest', ready: true });
    rooms.setReady(guest, 'yes');
    assert.equal(host.last(SERVER_MESSAGES.ROOM_STATE).seats[1].ready, false);
});

test('a closed connection leaves its room and empty rooms are removed', () => {
    const rooms = createRoomManager();
    const [host, guest, watcher] = connect(rooms, 3);
    rooms.createRoom(host, 'Host');
    rooms.joinRoom(guest, '1', 'Guest');

    rooms.removeConnection(guest);
    assert.deepEqual(host.last(SERVER_MESSAGES.ROOM_STATE).seats[1], null);
    rooms.removeConnection(host);
    assert.deepEqual(watcher.last(SERVER_MESSAGES.ROOM_LIST).rooms, []);
    assert.throws(() => rooms.joinRoom(watcher, '1', 'W'), /no such room/);
});

test('room requests are rejected when they do not fit the player\'s membership', () => {
    const rooms = createRoomManager();
    const [socket] = connect(rooms, 1);
    assert.throws(() => rooms.setReady(socket, true), RoomError);
    assert.throws(() => rooms.leaveRoom(socket), /not in a room/);
    rooms.createRoom(socket, 'A');
    assert.throws(() => rooms.createRoom(socket, 'A'), /already in a room/);
    assert.throws(() => rooms.joinRoom(socket, '1', 'A'), /already in a room/);
});

test('names are trimmed, shortened and default to the seat number', () => {
    const rooms = createRoomManager();
    const [first, second] = connect(rooms, 2);
    rooms.createRoom(first, '   ');
    rooms.joinRoom(second, '1', `  ${'x'.repeat(30)}  `);
    const names = second.last(SERVER_MESSAGES.ROOM_STATE).seats.slice(0, 2).map((seat) => seat.name);
    assert.deepEqual(names, ['Player 1', 'x'.repeat(20)]);
});


test('four ready connected seats start once, with private snapshots and a fresh round ID', () => {
    let state;
    let expire;
    let time = 0;
    let starts = 0;
    const rooms = createRoomManager({ now: () => time, createGame(options) {
        starts++;
        state = createRound({ ...options, wall: buildWall().map((tile) => tile.tileId),
            clock: { now: () => time, setTimeout(callback) { expire = callback; return 1; }, clearTimeout() {} } });
        return state;
    } });
    const sockets = connect(rooms, 5);
    rooms.createRoom(sockets[0], 'A');
    for (const socket of sockets.slice(1, 4)) rooms.joinRoom(socket, '1', 'B');
    for (const socket of sockets.slice(0, 3)) rooms.setReady(socket, true);
    assert.equal(starts, 0);
    rooms.setReady(sockets[3], true);
    assert.equal(starts, 1);
    const id = sockets[0].last(SERVER_MESSAGES.SNAPSHOT).roundId;
    assert.ok(id);
    for (let seat = 0; seat < 4; seat++) {
        const snapshot = sockets[seat].last(SERVER_MESSAGES.SNAPSHOT);
        assert.equal(snapshot.roundId, id);
        assert.equal(snapshot.you, seat);
        assert.deepEqual(snapshot.ownHand, state.players[seat].concealed);
        for (let other = 0; other < 4; other++) {
            if (other === seat) continue;
            for (const tile of state.players[other].concealed) assert.ok(!JSON.stringify(snapshot).includes(tile.id));
        }
    }
    assert.equal(sockets[4].last(SERVER_MESSAGES.SNAPSHOT), undefined);
    assert.deepEqual(sockets[4].last(SERVER_MESSAGES.ROOM_LIST).rooms, []);
    assert.throws(() => rooms.setReady(sockets[0], true), /already started/);
    assert.equal(starts, 1);
    discard(state, 0, state.players[0].concealed[0].id);
    time = 3500;
    expire();
    for (const socket of sockets.slice(0, 4)) {
        const snapshot = socket.last(SERVER_MESSAGES.SNAPSHOT);
        assert.equal(snapshot.phase, state.phase);
        assert.equal(snapshot.currentSeat, 1);
        assert.equal(snapshot.roundId, id);
        assert.equal(snapshot.serverNow, time);
    }
    rooms.removeConnection(sockets[3]);
    assert.throws(() => rooms.joinRoom(sockets[4], '1', 'Late'), /already started/);
    for (const socket of sockets.slice(0, 3)) rooms.leaveRoom(socket);
    rooms.addConnection(sockets[3]);
    rooms.createRoom(sockets[0], 'A');
    for (const socket of sockets.slice(1, 4)) rooms.joinRoom(socket, '2', 'B');
    for (const socket of sockets.slice(0, 4)) rooms.setReady(socket, true);
    assert.notEqual(sockets[0].last(SERVER_MESSAGES.SNAPSHOT).roundId, id);
});

test('missing or closed seats cannot start a round', () => {
    const rooms = createRoomManager({ createGame() { assert.fail('must not start'); } });
    const sockets = connect(rooms, 4);
    rooms.createRoom(sockets[0], 'A');
    for (const socket of sockets.slice(1, 3)) rooms.joinRoom(socket, '1', 'B');
    for (const socket of sockets.slice(0, 3)) rooms.setReady(socket, true);
    rooms.joinRoom(sockets[3], '1', 'D');
    sockets[3].readyState = 3;
    rooms.setReady(sockets[3], true);
});
