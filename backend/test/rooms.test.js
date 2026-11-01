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
