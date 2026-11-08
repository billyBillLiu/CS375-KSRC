# Working MVP checklist

Goal: four people can join a room, play a complete Fuzhou Mahjong round, see the
result, and start another round.

This replaces the previous detailed task breakdown. Use `plan.md` for artwork,
layout and rule details when needed; this checklist defines the smaller MVP scope.
No extra rules, protocol, fixture or verification Markdown files are required.
Keep shared message names/data shapes in `shared/protocol.js`, with short comments
where useful. Update the existing README at the end.

**After** lists tasks that must be finished first. **None** means you can start
now. Check an item when its stated result works. IDs start with M to distinguish
this new checklist from the old T tasks; old documentation checkmarks do not imply
that gameplay has been implemented.

## Keep the first version simple

- Keep Canvas, plain JavaScript, Vite, Node and the existing PNGs.
- Follow the Python simulator's rules where the exploratory notes disagree:
  144 tiles, five melds plus a pair, Gold wildcards, winds/dragons/flowers/seasons
  replaced, Chi/Peng normally followed by discard, and Kong replacement starting
  at the front. Dealer stays seat 0.
- Keep four human players, manual front/back draw buttons, best Claim and Pass,
  a 3.5-second claim window, and retained Chi for the next eligible seat.
- Draw the current state immediately. Animated dealing, event replay and exact
  animation timings can wait. Use simple orderly discard rows before attempting
  the shaped/scattered piles in `plan.md`.
- Sort hands automatically for now. Manual rearrangement can wait. Use click to
  select plus a Discard button; provide keyboard selection as well.
- On a disconnect, end the round with a clear message and let the remaining
  players return to the lobby. The 60-second pause/resume system can wait.
- Keep server-side legality checks and private hands. Even a casual game needs
  to reject illegal moves and avoid sending everyone's tiles to every browser.

## 1. Get a table on screen

- [x] **M01 — Show the table background.** In `frontend/src/canvas/renderer.js`
  and `main.js`, load the existing background images and draw them on a responsive
  16:9 Canvas using 384×216 logical coordinates. Show a message if loading fails.
  **After:** None. **Done when:** `npm run dev` shows the table without stretching
  when the browser is resized.

- [x] **M02 — Draw one tile from the sprite sheet.** Add `canvas/atlas.js` with
  an image loader and named crop records. Start with `1WAN` and one tile back;
  draw both on the table. **After:** M01. **Done when:** Both sprites are clear
  and contain no pixels from neighboring sprites.

- [ ] **M03 — Map the rest of the tiles.** Extend `atlas.js` to the 42 canonical
  identities in `python_state_machine/tiles.py`, including the directional variants
  needed for hands, melds, discards and Gold. Use a temporary labeled preview in
  `frontend/src/dev/fixtures.js` to inspect them. **After:** M02. **Done when:**
  Every identity and required back can be drawn with the correct face/crop.

- [ ] **M04 — Place four sample hands.** Add `canvas/layout.js` and one hardcoded
  sample state in `dev/fixtures.js`. Draw the local hand at the bottom and opponent
  backs at the other three sides using `plan.md` anchors. **After:** M03.
  **Done when:** Switching the sample viewer between seats 0–3 always puts that
  player's hand at the bottom.

- [ ] **M05 — Show the rest of a sample round.** Extend `renderer.js` to draw
  Gold, melds, specials, current discard and simple discard rows. Add HTML details
  for specials/discards that do not fit. **After:** M04. **Done when:** A sample
  mid-round table is readable, melds are distinct from concealed tiles, and large
  hands/piles do not silently hide tiles.

## 2. Make the game rules work in Node

This section can start alongside the table work. Read the corresponding Python
function while implementing each task; no separate rules-writing step is needed.
Use short, direct functions and add small helpers only when useful.

- [x] **M06 — Create tiles and round state.** Fill `backend/src/game/state.js`
  and add a tile helper if needed. Create the 144 physical tiles with unique IDs
  independent of their faces; track wall, hands, melds, specials, discards and Gold.
  **After:** None. **Done when:** A new wall has the Python inventory and no
  duplicate instance IDs.

- [ ] **M07 — Deal and replace setup specials.** Add `game/engine.js`. Deal
  four packets of four to each player, then one extra to seat 0. Repeat reverse
  hand scans, replacing specials from the back; reveal a non-special Gold tile
  and retain skipped Gold specials for accounting. Allow an explicit wall for
  debugging. **After:** M06. **Done when:** Normal setup leaves hands of
  17/16/16/16 playable tiles and a Gold indicator; a short wall ends safely.

- [ ] **M08 — Port the winning-hand check.** Fill `game/rules.js` using the
  Python solver, including Gold substitutions and locked meld counts.
  **After:** M06. **Done when:** Known winning/non-winning hands give the right
  answer, including Gold at the start/middle/end of a sequence and a locked Kong.

- [ ] **M09 — Implement front and back draws.** In `engine.js`, let the current
  player draw from the front; if special, expose it and require a back draw until
  a playable tile arrives. Check self-win after setup and each playable draw;
  terminate on exhaustion. **After:** M07, M08. **Done when:** Dealer starts
  with discard, later turns draw once, and repeated specials use the back.

- [ ] **M10 — Implement discard.** Remove one owned concealed tile by instance
  ID and make it the pending discard. Reject wrong-seat, wrong-phase and unowned
  tile actions. **After:** M09. **Done when:** One legal action moves exactly one
  tile; illegal actions leave state unchanged.

- [ ] **M11 — Find available claims.** Add claim predicates in `rules.js`:
  Win, Kong, Peng and Chi in that priority order. Use natural matches for melds,
  allow Chi only for the next seat and choose the first valid Chi combination.
  **After:** M08, M10. **Done when:** Each seat gets its best available claim;
  nobody can claim their own discard.

- [ ] **M12 — Apply a winning claim or meld.** In `engine.js`, move the pending
  tile and matching concealed tiles into the claimant's meld, or into the winning
  hand. Chi/Peng lead to discard; Kong automatically takes one front replacement
  and uses manual back draws for specials. **After:** M11. **Done when:** Tiles
  move once, a Kong counts as one meld, and Kong does not cause a second normal draw.

- [ ] **M13 — Resolve the claim window.** Collect human Claim/Pass choices for
  3.5 seconds, treating silence as Pass. Resolve by priority, then turn order after
  the discarder. With no accepted claim, keep retained Chi for the next eligible
  seat until it draws/discards; otherwise settle the tile and advance the turn.
  Keep the clock separate enough to test without waiting. **After:** M12.
  **Done when:** Submission order does not decide the winner, timed Pass still
  allows retained Chi, and late claims cannot affect a different discard.

- [ ] **M14 — Check the engine's tricky cases.** Add a small Node test suite in
  `backend/test/` for Gold wins, claim priority/ties, retained Chi, Kong replacement,
  special chains and exhaustion. Assert unique tile ownership and 144-tile
  conservation through full-wall scenarios. **After:** M13. **Done when:**
  `node --test backend/test/*.test.js` passes, including invalid moves.

## 3. Connect four browsers

- [X] **M15 — Connect the browser to the server.** Fill
  `frontend/src/network/client.js` and `backend/src/network/handlers.js`; register
  handlers in `backend/src/index.js`. Put message names and small shared helpers
  in `shared/protocol.js` as needed. Catch malformed messages and show connection
  errors. **After:** None. **Done when:** A browser exchanges a simple message
  over `/ws`, and the existing health endpoint still works.

- [x] **M16 — Create, join and leave rooms.** Fill `backend/src/rooms/manager.js`
  with in-memory rooms and four seats. Bind each socket to its assigned seat.
  **After:** M15. **Done when:** Four connections can join one room, a fifth is
  rejected, and leaving a waiting room frees the seat.

- [ ] **M17 — Build the lobby.** Fill `frontend/src/ui/lobby.js` with room list,
  Create, Join, Leave and Ready controls; show player names and readiness.
  **After:** M16. **Done when:** Four browser windows show the same membership
  and readiness without needing console commands.

- [ ] **M18 — Start a round and send private views.** Start the engine only
  when all four connected seats are ready. Add `backend/src/game/view.js` to send
  each player their own hand, opponent counts, public tiles and legal actions;
  include a fresh round ID. Send full snapshots after changes. **After:** M14,
  M17. **Done when:** Four browsers start together and their WebSocket messages
  contain no opponents' concealed tiles/IDs or wall order.

- [ ] **M19 — Render real snapshots.** Replace sample state in `main.js` with
  server snapshots, adding `frontend/src/game/view.js` if a mapping helper is
  useful. Use absolute seats for ownership and relative seats for drawing.
  **After:** M05, M18. **Done when:** All four browsers show their own hand at
  the bottom and agree on public tiles, turn and wall count.

- [ ] **M20 — Select a tile and show action buttons.** Fill `canvas/input.js`
  with pointer-to-logical-coordinate conversion and topmost-tile selection. Add
  `ui/game-controls.js` for Discard, Draw Front, Draw Back, best Claim and Pass.
  Allow arrow-key selection and Enter to discard; show selected-tile text.
  **After:** M19. **Done when:** Only local concealed tiles can be selected,
  resized-table clicks still work, and buttons follow server-provided legal actions.

- [ ] **M21 — Send and validate player actions.** Connect the controls to
  server handlers and engine transitions. Validate socket ownership and current
  round/turn/claim window, deduplicate request IDs, and reply with acceptance or
  a readable error. Disable action controls while a request is pending; change
  tile positions only after server acceptance. **After:** M20. **Done when:**
  Draw/discard/claim works across four browsers; double-clicks cannot draw twice,
  and old actions cannot affect a new turn or round. Concurrent valid claims
  remain valid even when another player's claim updates the snapshot.

- [ ] **M22 — Show turn, claim timer and results.** In `game-controls.js`, show
  whose turn it is, remaining claim time from the server deadline, and retained
  Chi choices. Show a winner or exhausted-wall result and reveal only the winner's
  hand. **After:** M21. **Done when:** A round can finish visibly, gameplay
  controls stop, and no timers keep changing the finished round.

- [ ] **M23 — Return to the lobby and play again.** Add a Return to Lobby
  button and reset room readiness after a finished round. Clear old timers,
  pending requests and selections; allocate a new round ID on the next start.
  **After:** M22. **Done when:** The same four players can complete the
  finish → lobby → ready → new round loop without refreshing.

- [ ] **M24 — Handle disconnects simply.** Detect closed sockets, stop the
  active round, cancel its timers and tell remaining players why it ended. Let
  them return to the lobby, remove departed players and clean up empty rooms.
  Show connection-lost/server-restarted messages instead of a frozen playable UI.
  **After:** M23. **Done when:** Closing one browser never leaves the others
  waiting forever or able to keep acting on the abandoned round.

## 4. Make it ready to demo

- [ ] **M25 — Play and fix a complete four-player round.** Run four browser
  windows through setup, draw, discard, claims and results. Use a few hardcoded
  debug walls to reach rare cases rather than building a fixture framework.
  Try competing claims, repeated specials, Kong, Gold win, wall exhaustion,
  disconnect and starting another round. **After:** M24. **Done when:** All
  clients agree on outcomes and their messages expose only permitted information.

- [ ] **M26 — Fix the obvious UI problems.** Check a small laptop-sized window,
  resize/zoom, overlapping hands, large melds and long discard/special lists.
  Make buttons, selected tile, turn, errors and results readable. Keep temporary
  sample/gallery/debug-wall controls out of the normal game flow. **After:** M25.
  **Done when:** The game is usable with mouse or keyboard and no important
  information is clipped or hidden.

- [ ] **M27 — Run the build and leave short startup instructions.** Run
  `npm run build`, the backend tests and `git diff --check`. Update `README.md`
  with how to start the app, join with four browsers, use the controls, and the
  MVP disconnect limitation. Fix its rules link and the backend README's missing
  rules-file link by pointing to the actual Python reference/brief README notes.
  **After:** M26. **Done when:** Checks pass and a teammate can run the demo
  from the README. No additional documentation files or verification reports needed.

## Later, once the MVP works

Manual hand rearrangement, animated dealing/replacements, shaped discard piles,
exact visual polish, pause/reconnect recovery, portrait mobile layout, bots,
scoring, accounts, leaderboards, dice/dealer rotation, extra Kong types and
alternate Chi selection. Production hosting is also separate; Vite preview alone
is not a deployed multiplayer server.

**Start with M01, M06 or M15.** They are independent. The table and game engine
come together at M18–M19. The MVP is finished when four players can complete a
round and start another, disconnects are handled clearly, and the build/tests pass.
