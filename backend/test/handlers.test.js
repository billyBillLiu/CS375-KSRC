import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageHandler } from '../src/network/handlers.js';
import { createManager } from '../src/rooms/manager.js';
import { C2S, S2C } from '../../shared/protocol.js';

function fakeSocket() {
    const sent = [];
    return { sent, send: (data) => sent.push(JSON.parse(data)), close() {} };
}

const handleMessage = createMessageHandler(createManager());

test('hello gets a welcome with a new token and the lobby', () => {
    const socket = fakeSocket();
    handleMessage(socket, JSON.stringify({ type: C2S.HELLO, payload: { name: 'Sunny' } }));
    assert.deepEqual(socket.sent.map((m) => m.type), [S2C.WELCOME, S2C.LOBBY]);
    assert.equal(socket.sent[0].payload.name, 'Sunny');
    assert.equal(typeof socket.sent[0].payload.token, 'string');
});

test('invalid json gets an error', () => {
    const socket = fakeSocket();
    handleMessage(socket, 'not json');
    assert.deepEqual(socket.sent, [{ type: S2C.ERROR, payload: { reason: 'bad json' } }]);
});

test('missing type, no hello, and unknown type get errors', () => {
    const socket = fakeSocket();
    handleMessage(socket, 'null');
    handleMessage(socket, JSON.stringify({ type: C2S.CREATE_GAME }));
    handleMessage(socket, JSON.stringify({ type: C2S.HELLO }));
    handleMessage(socket, JSON.stringify({ type: 'nope' }));
    const reasons = socket.sent.filter((m) => m.type === S2C.ERROR).map((m) => m.payload.reason);
    assert.deepEqual(reasons, ['missing type', 'send hello first', 'unknown type nope']);
});
