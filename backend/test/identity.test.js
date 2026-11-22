import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdentifiedHandler } from '../src/network/handlers.js';

function socket() {
    return { readyState: 1, messages: [], send(data) { this.messages.push(JSON.parse(data)); },
        close(code) { this.closeCode = code; } };
}

test('room actions wait for server-verified identity and never trust supplied player IDs', async () => {
    const connections = [];
    const rooms = { addConnection: (client) => connections.push(client), createRoom(client) {
        assert.equal(client.playerId, 'server-player');
    } };
    const handler = createIdentifiedHandler(rooms, {
        identifyPlayer: async (token) => {
            assert.equal(token, 'resume-token');
            return { id: 'server-player', token: 'private-token' };
        },
    });
    const client = socket();
    await handler(client, JSON.stringify({ type: 'createRoom', payload: { playerId: 'forged' } }));
    assert.equal(connections.length, 0);
    await handler(client, JSON.stringify({ type: 'identify', payload: { token: 'resume-token', playerId: 'forged' } }));
    assert.equal(connections.length, 1);
    assert.deepEqual(client.messages.at(-1), { type: 'playerSession', payload: { token: 'private-token' } });
    await handler(client, JSON.stringify({ type: 'createRoom', payload: {} }));
});

test('disconnecting during identification does not register a dead socket', async () => {
    let resolve;
    const handler = createIdentifiedHandler({ addConnection: () => assert.fail('dead socket registered') }, {
        identifyPlayer: () => new Promise((done) => { resolve = done; }),
    });
    const client = socket();
    const pending = handler(client, JSON.stringify({ type: 'identify', payload: {} }));
    client.readyState = 3;
    resolve({ id: 'player', token: 'token' });
    await pending;
    assert.deepEqual(client.messages, []);
});
