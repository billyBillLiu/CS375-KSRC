import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomManager } from '../src/rooms/manager.js';
import { createRound } from '../src/game/engine.js';
import { buildWall } from '../src/game/tiles.js';
import { openSessionDatabase } from '../src/database/sessions.js';
import pg from 'pg';

function setup(sessionDatabase, wall = buildWall().map((tile) => tile.tileId)) {
    const timers = [];
    const rooms = createRoomManager({
        sessionDatabase,
        createGame: (options) => createRound({ ...options, wall }),
        setTimer: (callback) => { timers.push(callback); return callback; },
        clearTimer: () => {},
    });
    const sockets = Array.from({ length: 4 }, () => ({
        messages: [], send(data) { this.messages.push(JSON.parse(data)); },
    }));
    sockets.forEach((socket) => rooms.addConnection(socket));
    rooms.createRoom(sockets[0], 'Alice');
    sockets.slice(1).forEach((socket, index) => rooms.joinRoom(socket, '1', `Player ${index + 2}`));
    return { rooms, sockets, timers };
}

test('session history keeps departed participants and never saves tokens or tiles', () => {
    const records = [];
    const { rooms, sockets } = setup({ save: (session) => records.push(session) });
    rooms.leaveRoom(sockets[1]);
    rooms.joinRoom(sockets[1], '1', 'Replacement');
    const saved = records.at(-1);
    assert.equal(saved.participants.length, 5);
    assert.ok(saved.participants[1].leftAt);
    assert.equal(saved.participants[4].seat, 1);
    assert.notEqual(saved.participants[1].id, saved.participants[4].id);
    assert.equal(records[0].participants.length, 1);
    for (const socket of sockets) {
        const token = socket.messages.find((message) => message.type === 'roomState').payload.token;
        assert.ok(!JSON.stringify(records).includes(token));
    }
    assert.ok(!JSON.stringify(records).includes('concealed'));
    for (const socket of sockets) rooms.leaveRoom(socket);
    assert.equal(records.at(-1).endReason, 'room_empty');
});

test('reconnect retains the participant and timeout records the abandoned round', () => {
    const records = [];
    const { rooms, sockets, timers } = setup({ save: (session) => records.push(session) });
    sockets.forEach((socket) => rooms.setReady(socket, true));
    const participantId = records.at(-1).participants[2].id;
    const token = sockets[2].messages.findLast((message) => message.type === 'roomState').payload.token;
    rooms.removeConnection(sockets[2]);
    assert.equal(records.at(-1).participants[2].connected, false);
    rooms.addConnection(sockets[2]);
    rooms.resumeSeat(sockets[2], '1', token);
    assert.equal(records.at(-1).participants[2].id, participantId);
    assert.equal(records.at(-1).participants[2].connected, true);
    rooms.removeConnection(sockets[2]);
    timers.at(-1)();
    const saved = records.at(-1);
    assert.equal(saved.rounds.length, 1);
    assert.equal(saved.rounds[0].endReason, 'player_disconnected');
    assert.ok(saved.rounds[0].endedAt);
    assert.equal(saved.rounds[0].winnerSeat, null);
    assert.ok(saved.participants[2].leftAt);
});

test('leaving an active round records abandonment before removing the participant', () => {
    const records = [];
    const { rooms, sockets } = setup({ save: (session) => records.push(session) });
    sockets.forEach((socket) => rooms.setReady(socket, true));
    rooms.leaveRoom(sockets[1]);
    const saved = records.at(-1);
    assert.equal(saved.rounds[0].endReason, 'player_left');
    assert.ok(saved.participants[1].leftAt);
    assert.equal(saved.rounds[0].participantIds.length, 4);
});

test('setup exhaustion is saved once with all four round participants', () => {
    const records = [];
    const { rooms, sockets } = setup({ save: (session) => records.push(session) }, []);
    sockets.forEach((socket) => rooms.setReady(socket, true));
    const saved = records.at(-1);
    assert.equal(saved.rounds[0].endReason, 'wall_exhausted');
    assert.deepEqual(saved.rounds[0].participantIds, saved.participants.map((player) => player.id));
    assert.equal(records.filter((record) => record.rounds.length).length, 1);
});

test('PostgreSQL saves sessions atomically, retries failed writes and closes interrupted rounds', {
    skip: !process.env.TEST_DATABASE_URL,
}, async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    const reader = new pg.Client({ connectionString });
    await reader.connect();
    let database;
    try {
        database = await openSessionDatabase(connectionString);
        await assert.rejects(openSessionDatabase(connectionString), /Another Mahjong backend/);
        const { rooms, sockets } = setup(database);
        sockets.forEach((socket) => rooms.setReady(socket, true));
        await database.flush();
        const roundId = sockets[0].messages.findLast((message) => message.type === 'snapshot').payload.roundId;
        const result = await reader.query('SELECT * FROM session_rounds WHERE id = $1', [roundId]);
        const sessionId = result.rows[0].session_id;
        assert.equal(result.rows[0].participant_ids.length, 4);
        assert.equal(result.rows[0].ended_at, null);
        const players = await reader.query('SELECT * FROM session_participants WHERE session_id = $1', [sessionId]);
        assert.equal(players.rowCount, 4);

        // Reject writes temporarily to exercise rollback and the retained queue.
        await reader.query(`ALTER TABLE session_participants ADD CONSTRAINT test_reject_disconnect
            CHECK (connected = true) NOT VALID`);
        rooms.removeConnection(sockets[2]);
        await assert.rejects(database.flush());
        assert.equal(database.healthy, false);
        assert.equal((await reader.query('SELECT connected FROM session_participants WHERE id = $1',
            [result.rows[0].participant_ids[2]])).rows[0].connected, true);
        await reader.query('ALTER TABLE session_participants DROP CONSTRAINT test_reject_disconnect');
        await database.flush();
        assert.equal(database.healthy, true);
        assert.equal((await reader.query('SELECT connected FROM session_participants WHERE id = $1',
            [result.rows[0].participant_ids[2]])).rows[0].connected, false);
        await database.close();
        rooms.removeConnection(sockets[0]);
        assert.equal(database.healthy, true);
        database = null;
        assert.equal((await reader.query('SELECT end_reason FROM session_rounds WHERE id = $1',
            [roundId])).rows[0].end_reason, 'server_stopped');

        // Simulate rows left open by a process that did not shut down cleanly.
        await reader.query('UPDATE game_sessions SET ended_at = NULL, end_reason = NULL WHERE id = $1', [sessionId]);
        await reader.query('UPDATE session_rounds SET ended_at = NULL, end_reason = NULL WHERE id = $1', [roundId]);
        database = await openSessionDatabase(connectionString);
        assert.equal((await reader.query('SELECT end_reason FROM session_rounds WHERE id = $1',
            [roundId])).rows[0].end_reason, 'server_restarted');
        assert.equal((await reader.query('SELECT count(*)::int AS count FROM session_rounds WHERE id = $1',
            [roundId])).rows[0].count, 1);
    } finally {
        await reader.query('ALTER TABLE session_participants DROP CONSTRAINT IF EXISTS test_reject_disconnect');
        if (database) await database.close();
        await reader.end();
    }
});

test('PostgreSQL keeps one winner score, tab identities and calendar leaderboards', {
    skip: !process.env.TEST_DATABASE_URL,
}, async () => {
    const { randomUUID } = await import('node:crypto');
    const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.connect();
    const schema = `scoring_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const reader = new pg.Client({ connectionString: url.href });
    await reader.connect();
    let database;
    try {
        database = await openSessionDatabase(url.href);
        const alice = await database.identifyPlayer();
        const bob = await database.identifyPlayer();
        const carol = await database.identifyPlayer();
        assert.deepEqual(await database.identifyPlayer(alice.token), alice);
        assert.notEqual(alice.id, bob.id);
        assert.notEqual((await database.identifyPlayer('invalid')).id, alice.id);
        const stored = (await reader.query('SELECT * FROM leaderboard_players WHERE id = $1', [alice.id])).rows[0];
        assert.ok(!JSON.stringify(stored).includes(alice.token));

        function session(player, points, completedAt, name = 'Same name', reason = 'self_draw') {
            const participants = Array.from({ length: 4 }, (_, seat) => ({
                id: randomUUID(), playerId: seat === 0 ? player.id : null, seat,
                name: seat === 0 ? name : 'Loser', joinedAt: completedAt, connected: true, leftAt: null,
            }));
            return {
                id: randomUUID(), roomCode: '1', startedAt: completedAt, endedAt: null, endReason: null,
                participants,
                rounds: [{ id: randomUUID(), startedAt: completedAt, endedAt: completedAt,
                    endReason: reason, winnerSeat: reason === 'self_draw' ? 0 : null,
                    participantIds: participants.map((p) => p.id), score: { total: points } }],
            };
        }
        const first = session(alice, 16, '2026-11-02T05:00:00Z');
        await reader.query('ALTER TABLE winner_scores ADD CONSTRAINT reject_scores CHECK (points < 0) NOT VALID');
        database.save(first);
        await assert.rejects(database.flush());
        assert.equal((await reader.query('SELECT * FROM game_sessions WHERE id = $1', [first.id])).rowCount, 0);
        await reader.query('ALTER TABLE winner_scores DROP CONSTRAINT reject_scores');
        await database.flush();
        database.save(first);
        const records = [
            session(alice, 10, '2026-11-02T08:00:00Z'),
            session(bob, 16, '2026-11-02T09:00:00Z'),
            session(carol, 7.5, '2026-11-02T10:00:00Z', 'Carol'),
            session(alice, 20, '2026-11-03T05:00:00Z'),
            session(alice, 99, '2026-11-02T04:59:59Z'),
            session(bob, 99, '2026-11-02T09:00:00Z', 'Abandoned', 'player_disconnected'),
            session(bob, 99, '2026-11-02T09:00:00Z', 'Draw', 'wall_exhausted'),
        ];
        records.forEach((record) => database.save(record));
        await database.flush();
        assert.equal(await database.scoreSaved(first.rounds[0].id), true);
        assert.equal(await database.scoreSaved(records.at(-1).rounds[0].id), false);
        assert.equal((await reader.query('SELECT * FROM winner_scores')).rowCount, 6);
        const daily = await database.leaderboard('daily', new Date('2026-11-02T12:00:00Z'));
        assert.deepEqual(daily.entries.map(({ rank, name, score }) => ({ rank, name, score })), [
            { rank: 1, name: 'Same name', score: 16 },
            { rank: 1, name: 'Same name', score: 16 },
            { rank: 3, name: 'Carol', score: 7.5 },
        ]);
        assert.deepEqual((await database.leaderboard('weekly', new Date('2026-11-02T12:00:00Z')))
            .entries.map((entry) => entry.score), [20, 16, 7.5]);
        assert.deepEqual((await database.leaderboard('daily', new Date('2026-11-04T12:00:00Z'))).entries, []);
        assert.equal((await database.leaderboard('daily', new Date('2026-11-01T12:00:00Z'))).entries[0].score, 99);
        await assert.rejects(database.leaderboard('monthly'), /Invalid/);

        // Spring-forward day ends after 23 hours, not 24.
        database.save(session(alice, 15, '2026-03-08T05:00:00Z'));
        database.save(session(bob, 20, '2026-03-09T03:59:59Z'));
        database.save(session(carol, 50, '2026-03-09T04:00:00Z'));
        await database.flush();
        assert.deepEqual((await database.leaderboard('daily', new Date('2026-03-08T12:00:00Z')))
            .entries.map((entry) => entry.score), [20, 15]);
        await database.close();
        database = await openSessionDatabase(url.href);
        assert.equal(await database.scoreSaved(first.rounds[0].id), true);
        assert.deepEqual(await database.identifyPlayer(alice.token), alice);
    } finally {
        if (database) await database.close();
        await reader.end();
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
    }
});
