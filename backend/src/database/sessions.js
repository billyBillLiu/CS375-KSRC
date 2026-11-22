import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

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

    // Reads and identity requests use separate connections so they cannot run
    // inside the session writer's transaction.
    const readers = new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
    readers.on('error', (error) => console.error('PostgreSQL reader error:', error.message));
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
        async identifyPlayer(token) {
            if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
                const result = await readers.query('SELECT id FROM leaderboard_players WHERE token_hash = $1',
                    [createHash('sha256').update(token).digest('hex')]);
                if (result.rowCount) return { id: result.rows[0].id, token };
            }
            const id = randomUUID();
            token = randomBytes(32).toString('hex');
            await readers.query('INSERT INTO leaderboard_players (id, token_hash) VALUES ($1, $2)',
                [id, createHash('sha256').update(token).digest('hex')]);
            return { id, token };
        },
        async leaderboard(period, now = new Date()) {
            if (!['daily', 'weekly'].includes(period)) throw new Error('Invalid leaderboard period');
            const unit = period === 'daily' ? 'day' : 'week';
            const result = await readers.query(`
                WITH boundaries AS (
                    SELECT date_trunc($1, $2::timestamptz AT TIME ZONE 'America/New_York') AS local_start
                ), best AS (
                    SELECT DISTINCT ON (COALESCE(p.player_id, p.id))
                        s.round_id, p.name, s.points, s.completed_at
                    FROM winner_scores s JOIN session_participants p ON p.id = s.participant_id,
                        boundaries b
                    WHERE s.completed_at >= b.local_start AT TIME ZONE 'America/New_York'
                        AND s.completed_at < (b.local_start +
                            CASE WHEN $1 = 'day' THEN interval '1 day' ELSE interval '1 week' END)
                            AT TIME ZONE 'America/New_York'
                    ORDER BY COALESCE(p.player_id, p.id), s.points DESC, s.completed_at, s.round_id
                )
                SELECT rank() OVER (ORDER BY points DESC)::int AS rank,
                    name, points::float8 AS score, completed_at AS "completedAt"
                FROM best ORDER BY points DESC, completed_at, round_id LIMIT 50`, [unit, now]);
            return { period, timezone: 'America/New_York', entries: result.rows };
        },
        async scoreSaved(roundId) {
            const result = await readers.query('SELECT 1 FROM winner_scores WHERE round_id = $1', [roundId]);
            return result.rowCount > 0;
        },
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
                await readers.end();
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
                (id, session_id, seat, name, joined_at, connected, left_at, player_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE
                SET connected = EXCLUDED.connected, left_at = EXCLUDED.left_at`,
            [player.id, session.id, player.seat, player.name, player.joinedAt, player.connected, player.leftAt, player.playerId ?? null]);
        }
        for (const round of session.rounds) {
            await client.query(`INSERT INTO session_rounds
                (id, session_id, started_at, ended_at, end_reason, winner_seat, participant_ids)
                VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE
                SET ended_at = EXCLUDED.ended_at, end_reason = EXCLUDED.end_reason,
                    winner_seat = EXCLUDED.winner_seat`,
            [round.id, session.id, round.startedAt, round.endedAt, round.endReason, round.winnerSeat, round.participantIds]);
            if (round.score && round.winnerSeat !== null && round.endedAt
                && ['self_draw', 'discard_claim'].includes(round.endReason)) {
                await client.query(`INSERT INTO winner_scores
                    (round_id, participant_id, completed_at, points, breakdown)
                    VALUES ($1, $2, $3, $4, $5) ON CONFLICT (round_id) DO NOTHING`,
                [round.id, round.participantIds[round.winnerSeat], round.endedAt, round.score.total, round.score]);
            }
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}
