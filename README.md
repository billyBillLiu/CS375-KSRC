# CS375 Mahjong

A browser-based Fuzhou Mahjong game developed for **CS375** by **Bill Liu,
Zhixian Li, and Sunny Liu**.

The project uses plain JavaScript and the **Canvas API** for game rendering,
with a **Node.js WebSocket backend** for live multiplayer. Vite provides the
frontend development server and production build tooling.

## Planned features

- Public lobby where users can create games and join anonymously.
- Four players required to begin a game.
- Disconnection handling.
- Live Mahjong gameplay using the Fuzhou ruleset.
- Daily and weekly high scores for winning hands.
- Optional: bots.
- Saved sessions and session game state so people can rejoin.
- Lobby code creation and joining system.

Currently, the repository contains the project scaffold, PNG assets, a responsive
table background, a sample mid-round viewer, a browser WebSocket connection, and server-side rooms with
ready status. The lobby supports creating, joining and leaving rooms, player names, and ready
status. When all four connected players are ready, the server starts a round and
sends private snapshots with each player’s own hand, opponent counts, public tiles
and legal actions. Each browser renders its sorted hand at the bottom, opponent
backs, Gold and public tiles, with seat labels, the current turn and wall count.
Gameplay controls support draws, discards and claims. Finished winning rounds show
a score breakdown and whether the score has been saved to the leaderboard.

To view a live round, open four browser tabs and click **Create game** on the
table in one. Its address changes to `/?room=<id>`; open that invite link in
the other three tabs (or click **Join Game** and pick the room or enter its code),
then click Ready in each. The lobby menus also work with Tab and Enter. Separate rooms can run at the same time.
If a player's connection drops or they reload during a round, play pauses and
their seat is held for 30 seconds; the same tab rejoins automatically. If they
do not return in time, the round ends and everyone else goes back to the room.
Expand the details below the table to
inspect public melds, specials and discards.

## Setup

Install Git and **Node.js 22.12 or newer**, including npm. Check your installation:

```sh
node --version
npm --version
```

Clone the repository and install its dependencies:

```sh
git clone https://github.com/billyBillLiu/CS375-KSRC.git
cd CS375-KSRC
npm ci
```

If you already have the repository, run `npm ci` from its root directory.

Complete the PostgreSQL setup under Configuration below, then start the frontend
and backend together:

```sh
npm run dev
```

Open **http://127.0.0.1:5173** in your browser. Keep the terminal running while
working; press **Ctrl+C** to stop both servers.

- Frontend: `http://127.0.0.1:5173`
- Backend health check: `http://127.0.0.1:3001/api/health`
- WebSocket endpoint: `/ws` (room messages are listed in `shared/protocol.js`)

To inspect the tile artwork during development, open
**http://127.0.0.1:5173/?atlas**. The labeled preview shows all 42 identities,
their display variants, and four directional backs. Missing special-tile variants
reuse scaled/rotated existing artwork. The preview is excluded from production.

To inspect the sample round, open **http://127.0.0.1:5173/?sample** and switch
the viewer between seats 0–3. The selected hand appears face-up at the bottom;
opponents use directional backs. HTML labels identify the absolute seats.
Gold, face-up meld groups, the current discard and simple discard rows are shown.
The center uses the wall and front/back draw-tile artwork, with Gold in its
layered nest. These draw targets are visual only until gameplay input is connected.
Expand each seat’s details for all public tiles and overflow counts. The stress
checkbox shows a synthetic five-Kong hand and oversized public piles.
This preview is development-only. Run its layout tests with
`node --test frontend/test/layout.test.js`.

During development, Vite forwards `/api` and `/ws` requests to the backend.
Frontend edits reload automatically, and the backend restarts when its source
files change. PostgreSQL is required; accounts are not required.

## Configuration

Start a local PostgreSQL server (for example with Postgres.app), create the database,
and copy `.env.example` to `.env` in the repository root:

```sh
createdb mahjong
cp .env.example .env
```

Set `DATABASE_URL` in `.env` to your PostgreSQL connection string (the default is
`postgresql://localhost:5432/mahjong`). If your server requires credentials, include
the database username and password. The backend creates its tables automatically
on startup; the database user needs table-creation permission. Startup fails if
PostgreSQL is unavailable. Only one backend may use this database at a time.

PostgreSQL stores room sessions, participant names/seats and connection status,
and round start/end times, reasons and winner seats. A new room gets a unique
session ID even when its short room code is reused. Participants are anonymous
seat memberships, linked to an anonymous leaderboard identity remembered per browser
tab across rooms and reloads. Separate tabs have separate identities; opening a
new tab or clearing session storage starts a new identity. Names are display labels,
not account credentials. The database stores only a hash of the private identity
token. No hands, wall order or seat-resume tokens are stored. Live games remain in memory: the existing
30-second reconnect works while the backend is running, but restarting it ends
unfinished sessions. Session history survives restarts.

Writes are queued in order and committed transactionally. Failed writes are
retried while the process runs, and `/api/health` returns 503 after a persistence
failure. A lost PostgreSQL connection requires restarting the backend. Queued
writes are held in memory and can be lost if the process crashes before saving.
Graceful shutdown flushes the queue and marks open sessions as stopped.

To run the database integration test, create a **separate disposable database**
(the test marks unfinished sessions as interrupted):

```sh
createdb mahjong_test
TEST_DATABASE_URL=postgresql://localhost:5432/mahjong_test npm test
```

Without `TEST_DATABASE_URL`, database integration is skipped; the remaining
backend tests still run.

Keep `HOST=127.0.0.1` for local development. If you change `PORT`, restart
`npm run dev` so the backend and Vite proxy use the new value. The `.env` file
is ignored by Git; `.env.example` is shared with the team.

## Scoring and leaderboards

Only the winner earns a score:

`(runs + 2 × triplets + 4 × Kongs) × (1 + 0.5 × specials) × win multiplier`

The win multiplier is 2 for self-draw (including a dealer opening win and Kong
replacement draws), or 1 for a discard win. All collected winds, dragons, flowers
and seasons count as specials; skipped Gold-indicator specials do not. A pair
earns zero points. Kongs count once and must be declared melds. Concealed groups
and Gold substitutions use the highest-scoring valid five-meld-plus-pair
arrangement. Fractional scores are preserved. For example, four runs and one
triplet, with four specials and self-draw, earn `6 × 3 × 2 = 36` points.

The High scores panel shows the top 50 players by their best single winning score
in the selected calendar day or Monday-start week, using `America/New_York`
(including daylight-saving changes). Equal scores share a rank. The display name
is the name used for that winning round; identical names are not merged. Scores
remain in PostgreSQL after the period ends or the server restarts. Losers,
exhausted-wall rounds and abandoned rounds have no score records.

The server computes the score and saves it together with the finished round in
one transaction. The round ID prevents duplicate score submissions. The result
panel confirms saving, or shows a pending/unavailable message with a status-check
button. Refresh the leaderboard to load newly saved scores. Existing queued-write
limitations described above still apply.

Read-only endpoints: `/api/leaderboard?period=daily` (or `weekly`) and
`/api/score-status?roundId=<uuid>`. No endpoint accepts client-submitted scores.
Existing databases gain the new tables/column automatically at backend startup.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend and backend together |
| `npm run dev:client` | Start only the Vite frontend server |
| `npm run dev:server` | Start only the backend with file watching |
| `npm run build` | Build the frontend into `frontend/dist/` |
| `npm run preview` | Preview the built frontend locally |
| `npm start` | Start the backend without file watching; serves `frontend/dist` if built |
| `npm test` | Run backend tests in `backend/test/` |

To check the frontend build:

```sh
npm run build
npm run preview
```

Open the URL printed by Vite. Preview serves only the frontend; it does not
start the backend or configure production API/WebSocket routing.

## Project structure

```text
frontend/
  index.html          Page shell and game Canvas
  public/assets/      PNG tile sheets, backgrounds, dice, and gold feather
  src/
    canvas/           Table rendering and input placeholder
    network/          Browser WebSocket client
    ui/               Lobby UI placeholder
    main.js           Frontend entry point
    styles.css        Page styles
  vite.config.js      Development proxy and build configuration
backend/
  src/
    game/             Round state, setup, draws, discards, claims and win checks
    network/          Message validation and routing
    rooms/            In-memory rooms, seats and ready status
    index.js          HTTP and WebSocket server startup
  test/               Node tests for rules, rounds, rooms and messages
shared/
  protocol.js         WebSocket message names and helpers
scripts/
  dev.js              Starts and stops both development servers
python_state_machine/
  __init__.py
  __main__.py
  bot.py
  game.py
  rules.py
  state.py
  tiles.py
docs/
  rules-notes.md      Gameplay planning notes
```

See [rules notes](docs/rules-notes.md) for gameplay planning.

## Deploying to Render

Create a **Web Service** from this repository:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Set `DATABASE_URL` to the connection string for your PostgreSQL database.

The backend serves the built frontend from `frontend/dist`, so the page and the
`/ws` WebSocket share one URL. Render sets `PORT` and `RENDER`, and the server
binds to `0.0.0.0` when `RENDER` is set.
