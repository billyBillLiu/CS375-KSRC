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
- Optional: bots and a weekly leaderboard for valuable winning hands.

Currently, the repository contains the project scaffold, PNG assets, a responsive
table background, a browser WebSocket connection, and server-side rooms with
ready status. The lobby UI and gameplay are not implemented yet.

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

Start the frontend and backend together:

```sh
npm run dev
```

Open **http://127.0.0.1:5173** in your browser. Keep the terminal running while
working; press **Ctrl+C** to stop both servers.

- Frontend: `http://127.0.0.1:5173`
- Backend health check: `http://127.0.0.1:3001/api/health`
- WebSocket endpoint: `/ws` (room messages are listed in `shared/protocol.js`)

During development, Vite forwards `/api` and `/ws` requests to the backend.
Frontend edits reload automatically, and the backend restarts when its source
files change. No database or account setup is needed.

## Configuration

The defaults work without an environment file. To change the backend settings,
copy `.env.example` to `.env` in the repository root:

```sh
cp .env.example .env
```

Keep `HOST=127.0.0.1` for local development. If you change `PORT`, restart
`npm run dev` so the backend and Vite proxy use the new value. The `.env` file
is ignored by Git; `.env.example` is shared with the team.

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
    game/             Game state and rules placeholders
    network/          Message validation and routing
    rooms/            In-memory rooms, seats and ready status
    index.js          HTTP and WebSocket server startup
  test/               Future backend tests
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

The backend serves the built frontend from `frontend/dist`, so the page and the
`/ws` WebSocket share one URL. Render sets `PORT` and `RENDER`, and the server
binds to `0.0.0.0` when `RENDER` is set.
