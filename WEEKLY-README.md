# This week's work (Nov 9 – Nov 15)

Team: **Sunny, Bill, Zhixian**. Task IDs and "Done when" checks are in
[roadmap-tasks.md](roadmap-tasks.md). Follow [AGENTS.md](AGENTS.md) for style,
tests and branch naming (`M06: Create tiles and round state`, branched off an
up-to-date `main`).

## Where we are

Finished (in `main`):

| Task | What | Who |
| --- | --- | --- |
| Scaffold | Vite frontend, Node HTTP/WebSocket backend, PNG assets | Bill |
| Rules reference | Python state machine, roadmap, `AGENTS.md` | Bill, Zhixian |
| M01, M02 | Table background, one tile from the sprite sheet | Zhixian |
| M15, M16 | Browser ↔ server WebSocket, rooms with seats and ready status | Sunny |
| Bot notes | `docs/ai-bot.md` (scoring ideas, not code yet) | Zhixian |

Still empty: `backend/src/game/state.js`, `rules.js`, `frontend/src/ui/lobby.js`,
`frontend/src/canvas/input.js`. No game engine exists yet.

The `add-workflow-to-agents.md` branch has one commit that isn't in `main`. It
adds two lines to `README.md` "Planned features": saved sessions/rejoin, and
lobby codes. Merge it or open a PR before someone edits the README. Its other
differences from `main` come from the branch being older, so ignore them.

## This week: 3 parallel tracks

There are 23 tasks left over two weeks. This week covers 9 of them, which is
everything the M18–M19 milestone needs except the claim logic. All three tracks
can start on day one.

### Bill: game engine core (backend JS)

1. **M06 — Tiles and round state** (`backend/src/game/state.js`). Do this
   **first**, by Tuesday if possible, since Sunny's M08 depends on its tile shape.
   Use face strings from `python_state_machine/tiles.py` (`1WAN`, `WIND_EAST`,
   `FLO_1`…). Suggested tile shape: `{ id, face }`.
2. **M07 — Deal and replace setup specials** (new `backend/src/game/engine.js`).
3. **M09 — Front and back draws** (`engine.js`; uses Sunny's `isWinningHand`
   for the self-win check. Stub it until M08 merges).
4. **M10 — Discard** (`engine.js`).
5. Add `backend/test/engine.test.js` covering tile conservation (144 tiles, no
   duplicate IDs), the 17/16/16/16 deal, and illegal discards.

### Sunny: lobby UI + winning-hand rules (frontend JS + backend JS)

1. **M17 — Build the lobby** (`frontend/src/ui/lobby.js`, wire it in `main.js`).
   The server messages already exist in `shared/protocol.js` (`listRooms`,
   `createRoom`, `joinRoom`, `ready`, `leaveRoom`). Check with 4 browser windows.
2. **M08 — Port the winning-hand check** (`backend/src/game/rules.js`). Port
   `is_winning_hand`, `can_win_with_tile` and `_solve` from
   `python_state_machine/rules.py`. It can work on plain face-string arrays,
   so you can start before M06 merges.
3. Add `backend/test/rules.test.js`: Gold at start/middle/end of a sequence, a
   locked Kong, and known non-winning hands.

### Zhixian: table rendering (frontend JS)

1. **M03 — Map the rest of the tiles** (`frontend/src/canvas/atlas.js`, temporary
   preview in new `frontend/src/dev/fixtures.js`). Include all 42 identities plus
   the directional variants.
2. **M04 — Place four sample hands** (new `frontend/src/canvas/layout.js`,
   sample state in `dev/fixtures.js`). Seats 0–3 must each be able to render at
   the bottom.
3. **M05 — Show the rest of a sample round** (`renderer.js`: Gold, melds,
   specials, current discard, discard rows).

Make the sample state in `fixtures.js` match the shape Bill uses in `state.js`
(`{ id, face }` tiles, seats 0–3). That way M19 can later swap the sample for real
server snapshots with little rework.

## Avoiding merge conflicts

- `main.js`: Sunny adds the lobby wiring and Zhixian adds the sample-render
  wiring. Keep each edit small and pull `main` before opening a PR.
- `rules.js` is Sunny's and `engine.js`/`state.js` are Bill's. Bill imports from
  `rules.js` and doesn't edit it.
- `shared/protocol.js`: no changes are expected this week. Announce in chat if
  you need one.
- Tick a checkbox in `roadmap-tasks.md` only when its "Done when" check passes.

## End-of-week check

- `npm test` passes, with new engine and rules tests.
- `npm run dev`: 4 windows can create a room, join it and ready up using only the UI.
- The dev preview shows every tile and a readable sample mid-round table from any seat.

## Next week (preview, not assigned yet)

- **Engine:** M11 claims, M12 apply claim/meld, M13 claim window, M14 tricky-case tests.
- **Wiring:** M18 private views, M19 render real snapshots.
- **Controls:** M20 input/selection, M21 send/validate actions, M22 timer/results.
- **Finish:** M23 play again, M24 disconnects, M25–M27 playtest, UI fixes, README.

A likely split, so everyone keeps JS work: Bill takes M11–M14, Sunny takes
M18, M21 and M24, and Zhixian takes M19, M20 and M22. Everyone shares
M23 and M25–M27.
