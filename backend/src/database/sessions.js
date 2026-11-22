import { readFile } from 'node:fs/promises';
import pg from 'pg';

// One backend owns the in-memory rooms. The advisory lock prevents a second
// backend from marking the first backend's live sessions as interrupted.
export async function openSessionDatabase(connectionString) {
    if (!connectionString) throw new Error('DATABASE_URL is required; see README.md for PostgreSQL setup');
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    let connectionError = null;
    client.on('error', (error) => {
        connectionError = error;
        console.error('PostgreSQL connection lost; restart the backend:', error.message);
    });
    await client.connect();
    try {
        const lock = await client.query('SELECT pg_try_advisory_lock(375, 1) AS acquired');
        if (!lock.rows[0].acquired) throw new Error('Another Mahjong backend is using this database');
        await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
        await client.query('BEGIN');
        await endOpenSessions(client, 'server_restarted');
        await client.query('COMMIT');
    } catch (error) {
        await client.end();
        throw error;
    }

    const pending = [];
    let running = null;
    let failure = null;
    let retryTimer = null;
    let closing = false;

    async function drain() {
        while (pending.length) {
            try {
                await saveSession(client, pending[0]);
                pending.shift();
                failure = null;
            } catch (error) {
                failure = error;
                console.error('Session persistence failed; pending records will be retried:', error.message);
                if (!closing) {
                    retryTimer = setTimeout(() => { retryTimer = null; startDrain(); }, 1000);
                    retryTimer.unref();
                }
                break;
            }
        }
    }

    function startDrain() {
        if (!running) running = drain().finally(() => { running = null; });
        return running;
    }

    return {
        save(session) {
            // Shutdown closes every open record; late socket callbacks must not reopen it.
            if (closing) return;
            pending.push(session);
            if (!retryTimer) startDrain();
        },
        get healthy() { return failure === null && connectionError === null; },
        async flush() {
            clearTimeout(retryTimer);
            retryTimer = null;
            await running;
            await startDrain();
            if (failure) throw failure;
        },
        async close() {
            closing = true;
            try {
                await this.flush();
                await client.query('BEGIN');
                await endOpenSessions(client, 'server_stopped');
                await client.query('COMMIT');
            } finally {
                await client.end();
            }
        },
    };
}

async function endOpenSessions(client, reason) {
    await client.query(`UPDATE session_rounds SET ended_at = now(), end_reason = $1
        WHERE ended_at IS NULL`, [reason]);
    await client.query(`UPDATE session_participants SET connected = false, left_at = now()
        WHERE left_at IS NULL`);
    await client.query(`UPDATE game_sessions SET ended_at = now(), end_reason = $1
        WHERE ended_at IS NULL`, [reason]);
}

async function saveSession(client, session) {
    await client.query('BEGIN');
    try {
        await client.query(`INSERT INTO game_sessions (id, room_code, started_at, ended_at, end_reason)
            VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE
            SET ended_at = EXCLUDED.ended_at, end_reason = EXCLUDED.end_reason`,
        [session.id, session.roomCode, session.startedAt, session.endedAt, session.endReason]);
        for (const player of session.participants) {
            await client.query(`INSERT INTO session_participants
                (id, session_id, seat, name, joined_at, connected, left_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE
                SET connected = EXCLUDED.connected, left_at = EXCLUDED.left_at`,
            [player.id, session.id, player.seat, player.name, player.joinedAt, player.connected, player.leftAt]);
        }
        for (const round of session.rounds) {
            await client.query(`INSERT INTO session_rounds
                (id, session_id, started_at, ended_at, end_reason, winner_seat, participant_ids)
                VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE
                SET ended_at = EXCLUDED.ended_at, end_reason = EXCLUDED.end_reason,
                    winner_seat = EXCLUDED.winner_seat`,
            [round.id, session.id, round.startedAt, round.endedAt, round.endReason, round.winnerSeat, round.participantIds]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}
