# Roadmap: Fuzhou Mahjong in Canvas and Node.js

**Status: Ready for implementation, using the explicit defaults below.**
**Inspected: October 31, 2026.**

This roadmap develops the Mahjong website in this repository using the Canvas
2D API, HTML, CSS, plain JavaScript modules, and a Node.js WebSocket backend.
The priority is reproducing tile placement, visibility, interaction, and timing.
Build and verify the table with scripted states before integrating multiplayer.
Keep Vite as the existing development/build tool; introduce no frontend framework
or game engine.

This is a temporary implementation handoff. After successful execution, move any
lasting reference material into the project's normal documentation and delete
this handoff before committing/pushing. This planning task changes no application
code and does not authorize deployment.

## 1. Evidence, scope, and completion criteria

### What was inspected

- This repo's frontend/backend scaffold, PNGs, planning notes, and Python engine.
- The actual PNGs were visually inspected and their dimensions checked. Each
  individual sprite crop still needs validation in the phase-1 gallery.
- The layout specifications below provide a starting point for implementation.
  No live browser gameplay or animation timing test was performed; runtime
  layout and visual fidelity must be checked with the planned fixtures.

### MVP scope and working defaults

1. Use the existing table artwork and the asymmetric perspective layouts below.
2. Follow the current repo's intended four-human public lobby and anonymous
   multiplayer. The Python simulator currently distinguishes a human seat from
   bot seats; production bots remain optional. Fixtures enable solo development.
3. Each browser sees its own hand at the bottom. Absolute game seats remain
   `0 South, 1 East, 2 North, 3 West`; visual positions are relative to the viewer.
4. Use manual front draw and manual back replacement controls.
   Setup replacements remain automatic. Kong's first replacement is automatic
   from the front; subsequent special replacements require the back control.
5. Preserve the single best-claim behavior and first valid Chi combination.
   Add readable HTML action buttons and a Pass button alongside Canvas controls.
6. Add a usable round-result screen and safe wall-exhaustion termination.
7. Target desktop/laptop first. Keep the 16:9 table responsive; offer button and
   keyboard alternatives to right-click rearrangement. A redesigned portrait
   mobile table is a later feature.

Deferred: scoring and weekly leaderboards, accounts/database, trained bots,
concealed/promoted Kongs, choosing Chi combinations, dice/dealer rotation,
animated physical wall depletion, and new artwork. Dice images exist, but the
current Python setup does not implement the dice-based dealing in the notes.

### Observable acceptance criteria

| ID | Complete when | Implementation / verification |
| --- | --- | --- |
| A1 | All 42 tile identities select correct hand, revealed, discard, and Gold artwork; opponents use directional backs | Phases 1–2; labeled sprite gallery |
| A2 | Four hands, melds, specials, shaped discard piles, wall controls, Gold, current discard, and turn indicator occupy the intended regions at different viewport sizes | Phases 2–3; coordinate checks and resize fixtures |
| A3 | Deal, replacement, draw, discard, claim, retained Chi, Kong, win, and exhaustion produce the correct tile transitions without duplication | Phases 3–5; transition fixtures and rules checks |
| A4 | Pointer and keyboard actions respect turn/zone, overlap, pending requests, and manual hand order | Phases 4 and 6; input and latency checks |
| A5 | Four clients start together, see only permitted information, resolve competing claims consistently, and recover from a temporary disconnect | Phases 5–6; four-browser integration checks |
| A6 | A round can finish and return to the lobby, and the existing build succeeds | Phases 6–7; complete-round smoke test and build |

## 2. Current implementation and rules baseline

### This repository

| Existing path | Current role / planned use |
| --- | --- |
| `frontend/index.html`, `frontend/src/main.js`, `frontend/src/styles.css` | Blank 1152×648 Canvas and page shell; become table bootstrapping and HTML controls |
| `frontend/src/canvas/renderer.js`, `input.js` | Empty placeholders; implement rendering and input here |
| `frontend/src/network/client.js`, `frontend/src/ui/lobby.js` | Empty placeholders; implement connection and lobby here |
| `frontend/public/assets/` | Seven existing PNGs; reuse them |
| `backend/src/index.js` | Working HTTP health endpoint and WebSocket connection setup; register handlers here |
| `backend/src/game/state.js`, `rules.js` | Empty placeholders for authoritative state and rules |
| `backend/src/rooms/manager.js`, `backend/src/network/handlers.js` | Empty placeholders for room lifecycle and messages |
| `shared/protocol.js` | Empty placeholder; define message types, validation, and public data contracts |
| `python_state_machine/{tiles,state,rules,game,bot}.py` | Existing rules/transition reference, not a runtime dependency for the website |
| `docs/rules-notes.md` | Exploratory notes with rules that conflict with the current simulator |
| `backend/test/README.md` | Calls for Node's built-in test runner and privacy/conservation checks |

Use the current Python state machine as the rules baseline. The notes say to
draw after Chi/Peng and use the back for Kong; current code normally discards
after Chi/Peng and starts Kong replacement at the front. Winds **and dragons**
are specials. The notes' dice/wall-break procedure is not implemented in the simulator.
During implementation, create `docs/rules.md` as the concise authoritative web
rules reference; `backend/src/game/README.md` already links to that missing file.

Rule invariants for the port: 144 physical tiles (four of each suited tile,
wind and dragon; one of each flower/season); five melds plus one pair to win;
hidden winning-hand target `17 - 3 * lockedMeldCount`. Gold substitutes in the
hidden-hand solver, can occupy any sequence position, and can also be used as its
natural identity or discarded. Claims use natural identities rather than wildcard
substitution. Nobody can claim their own discard; Chi is only for the next seat.

### Presentation responsibilities

Represent tiles with plain data, calculate positions using pure layout functions,
and use one draw list and one hit-test system. Tile placement, directional sprite
selection, group layering and interaction eligibility should remain separate
from the Python-derived rules. Section 6 maps these responsibilities to concrete
modules in this repository.

## 3. Reconstruct the table geometry

### Coordinate system

Use a **384×216 logical table**, matching both background PNGs. The existing
1152×648 canvas is exactly 3× this resolution. Store anchors and sprite sizes in
logical units; CSS size and device-pixel backing resolution are separate.

For the coordinate reference below, a 3.84×2.16 table is centered at `(0, 1.08)`.
Convert these reference units to logical pixels at 100 pixels per unit:

```text
logicalX = 192 + worldX * 100
logicalY = 216 - worldY * 100
logicalWidth = worldWidth * 100
logicalHeight = worldHeight * 100
```

Use the logical coordinates directly in browser layout. Apply parent scale and
offsets explicitly for nested visuals. These values are a calibration baseline
to verify with the frozen-table fixtures.

### Layout anchors

Coordinates are sprite/container centers unless stated otherwise. Names identify
proposed layout anchors. Visual seat names describe the default seat-0 view.

| Object | Reference position | Logical Canvas anchor | Placement behavior |
| --- | --- | --- | --- |
| `Hand_South` | `(0, .3778)` | `(192, 178.22)` | Centered horizontal row; 20-unit layout slots |
| `Hand_East` | `(1.22, 1.15)` | `(314, 101)` | Slants outward to the right as the index increases |
| `Hand_North` | `(0, 1.75)` | `(192, 41)` | Centered reversed row; 14-unit step |
| `Hand_West` | `(-1.22, 1.15)` | `(70, 101)` | Slants outward to the left as the index increases |
| `Specials_Pile` | `(-1.8, .17)` | `(12, 199)` | Local player's small revealed row; parent scale .4 |
| `Current_Tile` | `(0, .74)` | `(192, 142)` | Large claimable tile; parent scale .88 |
| `Gold_Tile_Slot` | `(-.525, 1.19)` | `(139.5, 97)` | Gold-specific artwork between nest layers |
| `WALL` | `(.1785, 1.1382)` | `(209.85, 102.18)` | Static decorative wall sprite, 100×53 |
| `Wall_Front` | `(-.2245, .9612)` | `(169.55, 119.88)` | Front draw target, authored sprite 11×19 |
| `Wall_Back` | `(.648, 1.1)` | `(256.8, 106)` | Back replacement target, authored sprite 11×19 |
| `Discard_South` | `(1.45, .62)` | `(337, 154)` | Lower-right origin; rows move left/up |
| `Discard_East` | `(1, 1.56)` | `(292, 60)` | Upper-right origin; rows move left/down |
| `Discard_North` | `(-1, 1.56)` | `(92, 60)` | Upper-left origin; rows move right/down |
| `Discard_West` | `(-1.45, .62)` | `(47, 154)` | Lower-left origin; rows move right/up |

The background artwork itself labels East on the left and West on the right,
while this layout places seat 1/East on the right and seat 3/West on the left. Keep
the specified seat mapping for gameplay and show explicit HTML seat labels.
Correcting the baked-in labels is an optional art task, not a change to turn order.

### Hand layout rules

- South: initially sort WAN, TAO, BIN by rank. For `n` tiles, centers start at
  `192 - (n - 1) * 20 / 2`; subsequent centers advance by 20. Keep logical slot
  size separate from visible sprite size. Seventeen 20-unit slots occupy 340
  units. After initial sorting, retain the local player's chosen order.
- North: use a 20-unit preferred slot width with spacing `-6`, and reverse
  arrangement. Start with `x = 192 - (i - (n - 1)/2) * 14`, `y = 41`.
- East/West: `x = anchorX + i * 3 * direction`, where direction is `+1` for
  East and `-1` for West. `y = 101 + (i - (n - 1)/2) * 6`. The slant is indexed
  from zero, not centered. Later indices overlap earlier ones.
- Meld tiles remain in the same hand container, after concealed tiles, grouped
  by stable meld ID. For South this places them on the right; North reverses the
  apparent side. Use the seat-specific revealed art, not a rotated hand face.
- New local draws append before the meld section. Do not re-sort the whole local
  hand after every snapshot. Keep optional auto-sort as a later control.
- A Kong adds a physical tile without adding a second logical meld. Stress-test
  up to 22 physical tiles for five Kongs plus a pair. Compress horizontal spacing
  within a defined hand region when necessary; don't clip the hand off-screen.
- Keep turn-indicator anchors out of tile counts so the arrow cannot change
  hand spacing or shift when the concealed count changes.

### Discard shapes and stability

All discard layouts use 16×16 logical spacing, random seed 42, scatter
randomness .3, and tile scale .7. The tuple for each row is `(capacity, indent)`.
Directions below use Canvas's downward Y axis.

| Visual pile | X direction | Y direction | Rows | Visible capacity |
| --- | --- | --- | --- | --- |
| South | -1 | -1 | `(7,1.5), (7,1), (5,2.5)` | 19 |
| East | -1 | +1 | `(6,.7), (6,0), (2,0), (3,-.8), (1,-1.34)` | 18 |
| North | +1 | +1 | `(6,.6), (7,.2), (2,-.2), (2,-.4), (1,-1.1)` | 18 |
| West | +1 | -1 | `(8,1.2), (7,1), (4,2.9)` | 19 |

Build slots with `x = anchorX + (column + indent) * 16 * xDirection` and
`y = anchorY + row * 16 * yDirection`. Score each slot by distance from
the pile origin plus seeded jitter, then sort the scores once for a stable
scattered appearance. Use a small deterministic random generator.
Precompute slot order and use a stable tie-breaker. Never call `Math.random()`
inside the render loop or sort comparator.

Assign discard-left/right art once per discard ID and retain it through final
settlement so a tile cannot flip appearance when it becomes settled.
Within a pile, tiles lower on the screen draw later.

For the web MVP, retain the shaped visible
pile and add a count plus an HTML expandable full discard history, including
overflow. Clearly indicate overflow; no tile should silently disappear from the
player's available information. Claimed discards must leave the pile/history's
unclaimed collection.

### Layers and draw order

Preserve the useful hierarchy, rather than copying only per-sprite numeric order:

1. Background table, then decorative border.
2. North hand (group order 0), North/East discard groups (2).
3. Gold nest back (3), Gold tile (4), nest front (5).
4. East/West hands, decorative wall, sparrow (5), wall targets (6).
5. South/West discard groups (8), current-discard group (9).
6. South hand (10), local specials (11).
7. Turn indicator and interaction overlays; held tile drawn on top.

Within a hand, preserve the sibling/index order. Within a group, use local depth
ordering; a global sort by tile Y alone would break the grouping. Give the held
tile a global top layer so it remains visible over all other groups.

Use fixed seat anchors for the arrow and a 3-unit vertical bob, with seat scales
South .9, East/West .75, North .6. Hide it during the claim window and after a win.
Calibrate its position independently from the hand row with fixtures for changing
hand counts.

## 4. Sprite and asset translation

| Existing PNG | Dimensions | Use |
| --- | --- | --- |
| `background_table.png`, `background_border.png` | 384×216 each | Full-table layers |
| `tile_sheet.png` | 379×556 | Hand/current/Gold/discard/directional tiles, backs, wall, nest, sparrow |
| `tile_sheet_south_revealed.png` | 192×161 | South revealed tiles for melds, specials, winning hand |
| `gold_feather.png` | 15×36 | Turn indicator; verify transparent margins and crop |
| `dice_sheet.png`, `dice_animation.png` | 101×16, 96×16 | Deferred dice feature |

Add `frontend/src/canvas/atlas.js` with named crop records:

```js
// Proposed data shape; crop numbers must be validated against the PNGs.
{
  image: 'tile_sheet',
  sx: 0, sy: 0, sw: 20, sh: 31,
  pivotX: 0.5, pivotY: 0.5
}
// tiles['1WAN'] -> { hand, current, gold, discardLeft, discardRight,
//                    revealed: { south, east, north, west } }
```

Map by canonical IDs in `python_state_machine/tiles.py`, such as `DRGN_GREEN`.
The full inventory is 27 suited identities, 4 winds, 3 dragons, 4 flowers, and
4 seasons. Backs are selected by visual seat and do
not require an opponent's concealed tile identity.

Measure named slices directly against the supplied PNGs and visually validate
every crop in the gallery. The main sheet is 379×556 and contains variants with
different dimensions and transparent margins; do not assume a uniform grid.
Preserve pivot and trimmed-offset information where needed. Store the complete
atlas in this repo so the deployed website needs only its own assets.

Load all required images once, wait for them before starting the table, and show
an HTML loading/error state if an asset fails. Use Canvas's source-and-destination
`drawImage` form for atlas crops. See [MDN's image drawing reference](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Using_images).

## 5. Tile states: when and where tiles appear

Keep game ownership, presentation zone, visual face, and input eligibility
separate. A gold indicator is not a concealed hand tile; a pending discard is
one physical tile even when different viewers display it in different places.

| Event/state | Placement and appearance | Input / next transition |
| --- | --- | --- |
| Waiting for four players | Table can be previewed; no live hand | Lobby controls only |
| Deal | One four-tile packet per seat per pass, for four passes (16 per seat); dealer receives one extra. Local faces and opponent backs appear in their hand rows | Disable gameplay and rearrangement until setup completes |
| Setup special replacement | Special leaves hand; local revealed tile appears in small specials row. Opponent hand shrinks/refills; their specials appear in the details panel | Automatic back replacement; repeated reverse-hand scans until clear |
| Gold reveal | Non-special back tile appears in Gold slot between nest layers; skipped specials do not enter a player's pile | Gold stays fixed; initial hand sort finishes |
| Await front draw | Active seat's arrow visible; local hand normally has 16 logical tiles before draw | Enable front wall and Draw button only for active local player |
| Ordinary draw | One new local face/opponent back enters hand; local existing order stays intact | Winning hand ends round; otherwise allow discard |
| Draw a special | Special leaves hand immediately and becomes public special data; local specials row grows | After visual cue, enable back replacement for active local player; repeat if another special appears |
| Discard, local viewer eligible to claim | Tile leaves owner's hand and appears enlarged in `Current_Tile`, using `currentSprite` | Enable best Claim and Pass during 3.5-second server window |
| Discard, local viewer ineligible | Tile leaves owner's hand and is provisionally drawn in that owner's shaped pile at .7 scale | No claim interaction; tile is still pending globally and may be claimed by another seat |
| Claim pending | Tile remains in its current display location; show “Claim submitted” | Do not move it into a meld optimistically; wait for server resolution |
| No accepted claim and no retained Chi | Pending tile settles into its owner's discard collection | No gameplay input on old discards |
| Retained Chi | If no claim won and next seat can Chi, keep pending discard available for that seat until it draws/discards | Claim or draw; drawing/discarding expires it atomically |
| Chi/Peng accepted | Pending tile and 2 hidden matching tiles become 1 revealed meld group at end of claimer's hand row | Claimer normally proceeds directly to discard; meld tiles cannot be discarded or rearranged |
| Kong accepted | Pending tile and 3 hidden matching tiles become a 4-tile revealed group | Automatically start one front replacement; specials chain from back; then discard or win |
| Rearranging local hand | Chosen concealed tile is excluded from row layout and shown at insertion gap on top | Right-click to pick/place; keyboard alternative; no server turn mutation |
| Win | Reveal winner's concealed tiles using directional revealed sprites, including South; retain melds and Gold | Stop gameplay, hide arrow, show winner/reason and return-to-lobby controls |
| Wall exhausted | Preserve last coherent table and show draw result | No further draw/discard/claim; cancel timers |
| Disconnected/reconnecting | Preserve table with a visible connection overlay | Disable actions; reconcile to authoritative snapshot before resuming |

### Timing defaults and interaction safeguards

Deal each four-tile packet with a .1-second pause, wait .5 seconds before setup
replacement, replace each setup special with a .1-second pause, then wait .5
seconds before Gold. Ordinary special draws pause .5 seconds before asking for
back replacement. Kong replacement begins after .5 seconds. Claims last 3.5
seconds. These are proposed presentation timings to verify in the browser;
ordinary multiplayer turns wait for human input.

Start with correct discrete transitions. Add short optional motion later; avoid
animations that obscure or shorten a live claim window.

Enforce these safeguards:

- Assign zone `special` when a tile enters the specials pile and disable
  discard/reorder for it.
- Give the Gold indicator a dedicated `gold` presentation zone and no gameplay
  hit target.
- Expose pile overflow through full history as described above.
- Preserve a discard's orientation across pending and settled states.
- Use Python's terminal `wall_exhausted` behavior, including during setup.
- Place the held tile above the row with a visible insertion marker.

## 6. Browser architecture and contracts

### Small modules with explicit responsibilities

Existing files should be filled in; other paths below are proposed additions.

| Module | Responsibility |
| --- | --- |
| `frontend/src/main.js` | Start app, load assets, own current view, connect modules, schedule one render loop |
| `frontend/src/canvas/atlas.js` (new) | Crop metadata and loaded images |
| `frontend/src/canvas/layout.js` (new) | Pure functions for seat mapping, hands, piles, anchors, scaling; produce draw items and hit regions |
| `frontend/src/canvas/renderer.js` | Draw backgrounds, ordered items, highlight/arrow/held tile from prepared data |
| `frontend/src/canvas/input.js` | Pointer conversion, hit testing, selection/reordering, action intent; never decide game legality |
| `frontend/src/game/view.js` (new) | Convert personalized snapshot into tile zones and visible sprites; preserve client-only order |
| `frontend/src/game/presentation.js` (new) | Setup replay/short transitions, event sequencing, interruption/reconnect handling |
| `frontend/src/dev/fixtures.js` (new) | Development-only deterministic visual scenarios, no production access to real hidden state |
| `frontend/src/network/client.js` | WebSocket lifecycle, message validation, request tracking, reconnect/resync |
| `frontend/src/ui/lobby.js` | DOM lobby, room list, join/create, readiness |
| `frontend/src/ui/game-controls.js` (new) | DOM status, action buttons, timer, history, results and connection overlay |
| `backend/src/game/{state,rules}.js` | Authoritative data and pure rule predicates |
| `backend/src/game/engine.js` (new) | Validated phase transitions and sanitized presentation events |
| `backend/src/game/view.js` (new) | Per-seat public snapshot and legal-action generation |
| `backend/src/rooms/manager.js` | Rooms, membership, readiness, sessions and deadlines |
| `backend/src/network/handlers.js` | Parse/validate intent, bind socket to seat, route and broadcast personalized views |
| `shared/protocol.js` | Protocol version, message shapes, constants and basic validators |

Draw items can be `{ id, spriteKey, x, y, scale, groupOrder, localOrder, zone,
interactive }`. Input consumes the same computed rectangles/transforms as the
renderer. Walk interactive items from front to back for overlap hit testing.
Keep decorative wall artwork distinct from its two active hit areas.

### Canvas sizing and input

Use one logical 384×216 coordinate space at every viewport size. Size the backing
canvas from the CSS content size multiplied by device pixel ratio, set the
logical-to-backing transform, and restore `imageSmoothingEnabled = false` after
any backing-size change. CSS `image-rendering: pixelated` complements it. See
[MDN's high-density Canvas example](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio).

For pointer coordinates, map the canvas **content** rectangle to logical units:
`x = (clientX - contentLeft) * 384/contentWidth`, and likewise for Y with 216.
Put the border on a wrapper or explicitly subtract it; `getBoundingClientRect()`
includes the element's border. Device pixel ratio is not another multiplier on
this logical pointer conversion. If letterboxing is internal, subtract its
offset and reject clicks outside the table.

Use Pointer Events, pointer capture for drag gestures where used, and cancellation
on lost capture/blur. Suppress `contextmenu` only on the game surface for the
right-click workflow. Provide keyboard selection, Enter to discard when legal,
and a reorder mode that uses Left/Right and Escape. Button controls should share
the same intent path. See [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).

HTML handles headings, names, room lists, loading/errors, action buttons, result
dialogs, and an accessible status region. Canvas handles the actual table and
tiles. Avoid one HTML element per visible tile as the primary renderer.

### Separate authoritative and local state

Server state tracks physical tile instances, not only identity strings:

```text
Tile = { id: opaqueInstanceId, tileId: canonicalIdentity }
Player = { concealed: Tile[], melds: Meld[], specials: Tile[], discards: Tile[] }
Meld = { id, kind, tiles: Tile[], fromSeat }
PendingDiscard = { id, tile: Tile, fromSeat, claimWindowId }
```

Assign IDs independently of tile identity so an ID does not reveal a hidden
tile's face. Stable physical IDs let the client preserve order among duplicates
and move the same tile between zones without double rendering. `gold` is a
separate tile removed from the wall; skipped Gold specials stay in private
accounting. Conservation across all containers must total 144.

The client keeps `handOrder: instanceId[]`, selected/held IDs, hover/insertion
index, persistent discard visual choices, queued presentation events, and pending
request IDs. On a snapshot: remove absent concealed IDs, retain surviving order,
append new concealed IDs, and render melds separately. Cancel an interaction if
the held tile leaves the concealed hand or a reconnect/result invalidates it.

Visual seat mapping is `(absoluteSeat - viewerSeat + 4) % 4`. Map 0→bottom,
1→right, 2→top, 3→left. Choose sprite perspective using this visual seat;
validate turn/claim rules using absolute seats. Never rotate the entire bitmap
table or send opponents' concealed identities to support rotation.

### Personalized snapshots and messages

Use full personalized snapshots for this small four-player game. Add ordered,
sanitized events only for transitions that a final snapshot cannot explain,
especially setup and chained replacements. Avoid a general event-sourcing system.

```text
Client intent:
  { type: "action", protocolVersion, requestId, roundId, turnId,
    action: "drawFront" | "drawBack" | "discard" | "claimBest" | "pass",
    tileInstanceId?, claimWindowId? }

Server view:
  { type: "snapshot", protocolVersion, roomId, roundId, revision, turnId,
    you: absoluteSeat, serverNow, phase, currentSeat, dealerSeat,
    wallCount, gold, ownHand,
    players: [{ seat, name, connected, concealedCount, melds, specials, discards }],
    pendingDiscard, claimWindowId, claimDeadline, retainedChiSeat,
    legalActions, winner, endReason, revealedWinnerHand?, events? }

Reply:
  { type: "actionResult", requestId, accepted, reason?, revision }
```

`ownHand` contains only the recipient's identities. Opponent hands are counts
until an explicit winner reveal. Public specials/melds/discards are visible to
all; show opponents' specials in an HTML details panel initially to preserve the
table's uncluttered layout. Never serialize the wall, private skipped-Gold list,
opponent concealed IDs/identities, or other players' legal actions. Sanitize
events too: another player's deal/draw event carries seat/count, not tile face.

Initial room messages: `listRooms`, `createRoom`, `joinRoom`, `ready`, `leaveRoom`,
`resume`, `resync`; responses include room summaries/membership and errors.
The server binds sockets to seats; ignore any client assertion of its acting seat.
Validate malformed JSON, message types, lengths, room/round IDs and ownership.

Use separate turn/claim-window IDs for action validity. Rejecting every action
whose global revision is old would incorrectly reject simultaneous valid claims
when the first player's submission increments that revision. Deduplicate request
IDs within a session; a double click or retransmission must not draw twice.

### State machine and presentation timing

Authoritative phases: `waiting`, `setup`, `drawFront`, `drawBack`, `discard`,
`claims`, `over`. A room-level disconnected/paused status can suspend these.
Client-only `animating`/`requestPending` states must not grant legal actions.

- Setup produces ordered packet/replacement/Gold events. Keep authoritative
  gameplay disabled through a server-defined setup deadline sufficient for the
  chosen sequence. A joining/reconnecting client can snap to the current state
  instead of replaying the entire deal. Do not wait indefinitely for animation
  acknowledgments from a client.
- After setup, check the dealer's 17-tile hand for an automatic self-win;
  otherwise enter `discard` without an extra front draw.
- On normal front draw: consume one tile. If special, expose it and enter
  `drawBack`; otherwise check self-win and enter `discard` or `over`.
- `drawBack` repeats until a non-special arrives or the wall is exhausted.
- Discard removes exactly one owned concealed instance and opens a server-timed
  3.5-second claim window. The client timer uses the server deadline, not frames.
- Collect every eligible human's intent; resolve at the deadline with
  Win > Kong > Peng > Chi and ties by turn order after the discarder. Silence
  means Pass. Do not apply Python's implicit auto-claim behavior to human seats.
- Generalize the simulator's retained seat-0 Chi to the next eligible human seat. After
  the window, keep it pending only if that seat can Chi. It expires when the
  next player draws/discards; a late claim from a different/old window is invalid.
  The timed-window Pass declines that window only; it does not remove the
  retained-Chi opportunity. Label the next-turn choices clearly as Chi or Draw.
  Accept retained Chi only against the still-pending discard and the current
  turn, even though its original timed window has ended.
- For Chi/Peng, lock the meld and enter discard. For Kong, lock four physical
  tiles and automatically consume the front replacement; use `drawBack` if it
  is special. Do not accidentally draw a second ordinary tile afterward.
- End states cancel claim/setup timers, clear pending actions, and reveal only
  the winner's hand unless an explicit later rule expands visibility.

All tile moves follow server acceptance. Local hover/reorder is immediate;
discard/claim/draw is not optimistic. Interrupted animations jump to the latest
valid snapshot. A revision gap triggers resync; reconnect snapshots replace queued
animations rather than replaying already-consumed transitions.

## 7. Ordered implementation roadmap

### Phase 1 — Finalize the specification and validate artwork

**Work:** Read the repository map above, create `docs/rules.md`, implement `atlas.js`
and a development-only sprite gallery through `dev/fixtures.js`. Record exact
crop/pivot mappings for all identities, backs, wall pieces, Gold nest and arrow.
Keep any extraction helper small and optional; the application build should
depend only on the files in this repository.

Prepare fixture specifications for initial setup, sorted hand, local special
replacement, eligible/ineligible discards, a meld, rearrangement and win reveal.
Use the coordinate and state tables above as their acceptance baseline.

**Exit:** Every labeled sprite is correct, and the fixture specifications cover
the intended layout and transitions.

### Phase 2 — Render one convincing frozen table

**Work:** Implement `layout.js`, `renderer.js`, asset startup in `main.js`, and
responsive sizing in `styles.css`. Start with a fixture with 17 local tiles,
16 backs per opponent, Gold and local specials. Add a mid-round fixture with
shaped discards and melds, reducing concealed counts to match locked melds.
Add a dev overlay for anchors, sprite bounds, hit areas and group order.

Calibrate the coordinate table, North reversal, diagonal overlap, Gold nest
layering, and turn indicator. Add viewer-seat switching in fixtures so the same
state can be viewed as each of the four players.

**Exit:** A complete perspective table at 768×432 and 1152×648 CSS table sizes,
with no stretching, incorrect crops or seat inversion. Layout also remains
contained at narrower widths and device pixel ratios 1 and 2.

### Phase 3 — Make every tile transition demonstrable without a server

**Work:** Implement `game/view.js`, `game/presentation.js`, and fixture controls
for stepping through the state table. Include setup, multiple special replacements,
claimable/ineligible discards, claims won by another player, retained Chi,
Chi/Peng/Kong, winner reveal and exhaustion.

Add persistent discard slots/orientation and full overflow history. Keep each
physical tile in exactly one presentation location. Pending discards provisionally
in a pile must not also be drawn from its settled discard list. Add repeated
identities, long specials rows and maximum-Kong hand fixtures.

**Exit:** Every transition can be stepped forward predictably; no duplicates,
stale current tiles, hidden overflow information, or layout jumps caused by random
scatter. This is the main visual milestone before backend integration.

### Phase 4 — Add usable controls

**Work:** Fill `input.js` and add `ui/game-controls.js`. Implement shared draw-list
hit tests, right-click pick/place, keyboard alternatives, insertion marker,
best-claim/Pass and front/back draw controls. Controls consume fixture-provided
`legalActions` initially. Show the selected tile/action in DOM text for clarity.

Cancel held tiles on invalidation; disable turn actions while a request is pending.
Make decorative and locked zones non-interactive. A left click while rearranging
must not accidentally discard. Add opponent-special details and discard history.

**Exit:** Correct tile selected in overlapping regions; the right wall target
activates for each draw state; illegal zones cannot act; user order survives
draw, meld formation and simulated snapshots.

### Phase 5 — Translate rules and expose safe player views

**Work:** Fill backend `state.js`/`rules.js`, add `engine.js`/`view.js`, and define
`shared/protocol.js`. Port tiles/counts, setup, specials, Gold-aware five-meld
solver, claims, hand-size rules and termination from the existing Python modules.
Separate timer scheduling from pure transitions so deadline behavior can be
verified without waiting in real time.

The translation needs deliberate changes: physical instance IDs; all seats human;
manual replacement phases; generalized retained Chi; setup presentation events;
server-timed claim collection; terminal results. Python collapses animation and
replacement clicks into synchronous operations and is not sufficient by itself
as a browser presentation model.

Add focused Node built-in tests under `backend/test/` for conservation, claims,
Kong logical counts/replacement, wildcard cases, exhaustion and per-seat privacy.
Use explicit front-to-back walls for Python/JavaScript comparison; identical RNG
seeds do not imply identical shuffled walls across languages.

**Exit:** Deterministic scenarios match baseline gameplay except documented web
changes; all 144 tiles remain accounted for; personalized snapshots/events hide
concealed information. No frontend or network dependency is needed to test rules.

### Phase 6 — Connect four players and complete the room lifecycle

**Work:** Implement `rooms/manager.js`, `network/handlers.js`, the browser client
and DOM lobby. Start only with four connected ready seats. Use in-memory rooms,
server-issued session/resume tokens, and per-seat snapshots. Preserve the existing
`/api/health` and `/ws` endpoints and Vite proxy.

Default disconnect policy: pause the round, suspend remaining claim time, and
reserve the seat for 60 seconds. Broadcast the paused state to everyone. Resume
the same round and restore the remaining deadline when all seats reconnect;
after grace expires, end the round as abandoned and return connected users to
the lobby. Do not quietly auto-discard or expose a disconnected player's hand.
Server restart loses in-memory rooms; show a clear session-ended message.

Connect accepted snapshots/events to the existing renderer and controls. Add
winner/draw/abandoned results and an explicit return-to-lobby action. A new game
gets a new round ID and requires readiness again; the initial dealer stays seat
0 for MVP parity. Expire empty rooms and old request/token records.

**Exit:** Four browser contexts complete a round, competing claims resolve once,
disconnect/rejoin keeps the seat and local order where possible, and stale actions
cannot affect a subsequent round.

### Phase 7 — Polish, verify, and document the runnable project

**Work:** Run the verification matrix below, fix overlap/readability and disabled
states, test browser zoom/resizing and reduced motion, and remove development
fixtures from the normal user flow. Update README with implemented behavior,
controls, four-player startup, reconnect limitations and known differences.

Keep the current dependency set unless an actual requirement cannot be met.
Production hosting is a separate task: Vite preview serves the frontend only;
a deployed setup must serve the built assets and route `/api` and `/ws` to Node.
Do not treat a successful preview as proof of production multiplayer routing.

**Exit:** A1–A6 pass, `npm run build` succeeds, and there is a reproducible demo.

### Suggested effort allocation

Allocate roughly 15% to reference/atlas, 25% to layout, 20% to transitions/input,
20% to rules/protocol, and 20% to multiplayer/verification. These are planning
weights, not calendar estimates. Keep the first three phases independently
demonstrable; the largest uncertainty is presentation fidelity, not file syntax.

## 8. Verification plan

### Commands for the executor

Run from this repository root, using the README prerequisite of Node 22.12+ and
installed dependencies (`npm ci` if needed):

```sh
npm run dev
npm run build
node --test backend/test/*.test.js
python3 -m python_state_machine --seed 7 --games 100
git diff --check
```

The Node test command is for the **future tests added in phase 5**; no test suite
is currently implemented here. The Python command exercises the existing simulator,
not Canvas or Node. The command above matches this repository's package path.
No new test framework is required. Add a few pure layout tests with `node --test`
if needed for fragile
coordinate conversion/seat mapping/overflow behavior, not broad screenshot-test
infrastructure.

### Focused manual and integration checks

| Scenario | Expected result |
| --- | --- |
| All sprite variants for 42 identities | Correct face and crop; no adjacent atlas pixels or accidental rotations |
| Initial deal and setup replacement | Packet order, 17/16 concealed totals after replacement, local/opponent visibility, then non-special Gold |
| Local special draw followed by 2 more specials | Front disabled; each back click consumes one tile; all specials remain public and non-discardable |
| Ineligible pending discard claimed by someone else | Provisional pile visual disappears and same tile joins winner's meld exactly once |
| Eligible pending discard, Pass/no claims | Central tile settles once with stable orientation; old pile tiles are not claimable |
| Retained Chi followed by draw | Chi remains after deadline only for next eligible seat; drawing expires it before adding a tile |
| Simultaneous Chi/Peng/Kong/Win and equal-priority claims | Correct priority and turn-order tie; every client agrees; old-window intent rejected |
| Kong replacement and following turn | Four revealed physical tiles count as one meld; one front replacement, back only for specials; no double draw |
| Local reorder with duplicate tile faces | Correct physical copy moves; order survives snapshots and new draw; melds stay locked |
| Resize/zoom/DPR and diagonal overlap | Drawing and hit testing align; topmost eligible tile wins hit test; border adds no offset |
| 22-tile hand, many specials, 20+ discards per pile | Hand stays contained; specials wrap or expose details; discard overflow count/history remains usable |
| Winner, setup exhaustion, ordinary exhaustion | Terminal result shown, timers/input stop, only allowed hand reveal is transmitted |
| Double click, malformed action, stale round/window | No duplicate mutations; readable rejection; client returns to current legal state |
| Four different viewer seats | Each local hand at bottom; right/left relative seats correct; action ownership still absolute |
| Inspect all four WebSocket streams including setup events | No wall order or opponent concealed identities; visible backs depend only on counts |
| Disconnect during claim/reorder, then resume | Pause visible; remaining deadline preserved; invalid selection cleared; fresh snapshot wins over queued animation |
| Reconnect after grace/server restart | Clear abandoned/session-ended state; no attempt to act on a dead room |

Compare key Canvas fixture screenshots against the coordinate, layering and state
specifications in this document at a consistent 16:9 aspect. Check each viewer's
perspective and HTML controls for accidental geometry or visibility differences.

### Checks performed while writing this roadmap

PNG visual inspection and dimension checks, Python-source inspection, and review
of the existing commands/contracts. No application build, gameplay test suite,
or browser gameplay test was run while writing the roadmap. These remain
implementation verification.

## 9. Remaining risks and optional decisions

No blocking product decision is required to start phases 1–3 under this plan.
The following are explicit implementation risks or optional follow-ups:

- **Runtime layout:** final layout/arrow behavior is unverified in the browser.
  Resolve with phase-2 fixtures before accepting the geometry.
- **Atlas crops:** image dimensions alone do not guarantee correct sprite crops.
  The sprite gallery is the gate before layout work relies on the atlas.
- **Multiplayer behavior:** relative-seat rendering, retained Chi for any seat,
  pause-on-disconnect and all-human claims are planned website behavior. These
  features are not implemented in the current scaffold.
- **Long rows:** local specials can accumulate and Kongs expand physical hands.
  Reserve bounded layout regions and expose overflow/details rather than
  shrinking text and hit targets without limits.
- **Rules drift:** `docs/rules-notes.md` conflicts with working code. Consolidate
  the rule reference before adding features; do not silently mix both versions.
- **Mobile scope:** a landscape responsive table and button alternatives come
  first. Portrait redesign and polished touch rearrangement can follow the MVP.
- **Optional features:** bots, scoring, dice, dealer rotation, alternate Chi
  selection and new Kong types need their own acceptance criteria later.

The first useful deliverable is a fixture-driven table that can demonstrate every
tile zone and transition. The final deliverable is that same table driven by
authoritative personalized Node.js state, with a complete four-player round lifecycle.
