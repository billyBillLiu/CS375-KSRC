import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageHandler } from '../src/network/handlers.js';
import { createRoomManager } from '../src/rooms/manager.js';
import { CLIENT_MESSAGES, SERVER_MESSAGES } from '../../shared/protocol.js';

function setup() {
    const rooms = createRoomManager();
    const handleMessage = createMessageHandler(rooms);
    const sent = [];
    const socket = { send: (data) => sent.push(JSON.parse(data)) };
    rooms.addConnection(socket);
    const receive = (message) => handleMessage(socket, typeof message === 'string' ? message : JSON.stringify(message));
    return { sent, receive };
}

test('listRooms gets the room list', () => {
    const { sent, receive } = setup();
    receive({ type: CLIENT_MESSAGES.LIST_ROOMS });
    assert.deepEqual(sent, [{ type: SERVER_MESSAGES.ROOM_LIST, payload: { rooms: [] } }]);
});

test('malformed messages and unknown types get a readable error', () => {
    const { sent, receive } = setup();
    receive('not json');
    receive('null');
    receive({ payload: {} });
    receive({ type: 'nope' });
    assert.deepEqual(sent.map((message) => message.payload.reason),
        ['malformed message', 'malformed message', 'malformed message', 'unknown message type nope']);
});

test('room errors are sent back instead of crashing', () => {
    const { sent, receive } = setup();
    receive({ type: CLIENT_MESSAGES.JOIN_ROOM, payload: { roomId: '42', name: 'A' } });
    receive({ type: CLIENT_MESSAGES.READY, payload: 'not an object' });
    assert.deepEqual(sent.map((message) => message.payload.reason), ['no such room', 'not in a room']);
});
