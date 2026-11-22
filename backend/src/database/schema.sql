CREATE TABLE IF NOT EXISTS game_sessions (
    id uuid PRIMARY KEY,
    room_code text NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    end_reason text
);

CREATE TABLE IF NOT EXISTS session_participants (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES game_sessions(id),
    seat integer NOT NULL CHECK (seat BETWEEN 0 AND 3),
    name text NOT NULL,
    joined_at timestamptz NOT NULL,
    connected boolean NOT NULL,
    left_at timestamptz
);

CREATE TABLE IF NOT EXISTS session_rounds (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES game_sessions(id),
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    end_reason text,
    winner_seat integer CHECK (winner_seat BETWEEN 0 AND 3),
    participant_ids uuid[] NOT NULL CHECK (cardinality(participant_ids) = 4)
);

CREATE INDEX IF NOT EXISTS session_participants_session_idx ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS session_rounds_session_idx ON session_rounds(session_id);
