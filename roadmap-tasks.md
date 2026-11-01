# Roadmap implementation tasks

Reviewed October 31, 2026. Based on [plan.md](plan.md), the current source tree,
the Python simulator, and repository documentation. This is an implementation
checklist, not a claim that the features below already exist.

## How to use this checklist

- Complete one checkbox at a time; its **Done** condition is the acceptance check.
- **Blocked by** lists direct prerequisite task IDs. All listed tasks must be
  complete first; their dependencies apply transitively. `None` means ready now.
- Keep IDs stable when splitting tasks further. Record verification evidence when
  checking a task off. Phase gates block downstream work where explicitly listed.
- Follow the seven phases in order for the main delivery path. Independent rules
  work may proceed after its listed prerequisites, but do not replace the visual
  fixture milestone with early multiplayer integration.
- No product decision blocks starting. Use the explicit defaults in `plan.md`.
  This checklist does not authorize deployment or add deferred features to MVP.

## Current repository and source of truth

| Location | Current state / implementation destination |
| --- | --- |
| `README.md`, `package.json`, `scripts/dev.js` | Setup instructions, Vite/Node commands, shared development launcher |
| `frontend/index.html`, `src/main.js`, `src/styles.css` under `frontend/` | Blank Canvas and page shell |
| `frontend/src/canvas/{renderer,input}.js` | Rendering/input placeholders |
| `frontend/src/network/client.js`, `frontend/src/ui/lobby.js` | Connection/lobby placeholders |
| `frontend/public/assets/` | Seven PNGs available; individual atlas crops still require validation |
| `backend/src/index.js` | HTTP health endpoint and WebSocket startup; no gameplay handlers |
| `backend/src/game/{state,rules}.js` | Authoritative engine placeholders; engine/view modules still needed |
| `backend/src/rooms/manager.js`, `backend/src/network/handlers.js` | Room/message placeholders |
| `shared/protocol.js` | Empty contract placeholder |
| `backend/test/README.md` | Test guidance; no implemented Node tests |
| `python_state_machine/{tiles,state,rules,game}.py` | Canonical identities, state, winning solver, synchronous transition reference |
| `python_state_machine/{bot,__main__}.py` | Simulation policies and CLI; not the website runtime |
| `docs/rules-notes.md` | Exploratory, internally inconsistent in places, and different from simulator |
| `docs/rules.md` | Missing, although the backend README links to it |

The roadmap selects the Python engine as the baseline, with explicit web changes.
Do not combine conflicting versions of the rules silently:

| Topic | Notes / simulator difference | MVP decision |
| --- | --- | --- |
| Winning | Notes say five triplets; solver also accepts sequences and Gold | Five melds plus pair; hidden target `17 - 3 * lockedMeldCount` |
| Chi/Peng | Notes say draw afterward; simulator normally discards | Follow simulator hand-size logic; normally discard |
| Kong | Notes describe a hidden triplet/fourth tile and back replacement | Discard-claimed Kong; automatic first replacement from front, subsequent specials from back |
| Specials | Notes prose omits some categories; pseudocode includes dragons | Winds, dragons, flowers, seasons all replace |
| Setup | Notes include dice and wall break; simulator has neither | Dealer seat 0, packet deal, automatic back replacements, then Gold |
| Humans/claims | Simulator has seat-0 special handling and implicit bot claims | Four humans, explicit best-claim/Pass, server deadline, retained Chi generalized to next eligible seat |

Python phases are `draw`, `discard`, `claims`, `over`. The web phases are
`waiting`, `setup`, `drawFront`, `drawBack`, `discard`, `claims`, `over`, with
room-level pause and client-only animation/request states. Full geometry,
atlas requirements, timing and message fields remain specified in `plan.md`
sections 3–6 until copied into lasting documentation in T71.

## Phase 1 — Rules, artwork, and fixture specifications

- [ ] **T01 — Consolidate the web rules.** Create `docs/rules.md` from the simulator and roadmap defaults; explain the differences above and link/label `rules-notes.md` as historical exploration. Include 42 identities, 144 physical tiles, Gold, claim priority/ties, retained Chi and termination. **Blocked by:** None. **Done:** Rules reference matches the selected baseline and the backend README link resolves.
- [ ] **T02 — Specify shared data contracts.** Document physical tile IDs independent of identity, meld/discard IDs, absolute/relative seats, web phases, personalized snapshots, sanitized events and action envelopes in a durable protocol reference. **Blocked by:** T01. **Done:** Fixtures, backend and client can share concrete sample payloads; privacy and turn/window validity rules are explicit.
- [ ] **T03 — Inventory atlas crops.** Measure named slices/pivots/trim offsets for all 42 identities and required perspectives, directional backs, wall, wall targets, nest, sparrow and feather. **Blocked by:** None. **Done:** Crop records cover every required asset without assuming a uniform sheet grid; dice stay deferred.
- [ ] **T04 — Implement atlas loading.** Add `frontend/src/canvas/atlas.js` with crop lookup and one-time image loading. **Blocked by:** T03. **Done:** Required images resolve before rendering; missing images produce a readable HTML error.
- [ ] **T05 — Build and inspect a labeled sprite gallery.** Add a development-only entry in `frontend/src/dev/fixtures.js`. **Blocked by:** T04. **Done:** All 42 identities show correct hand/current/Gold/discard/revealed variants, plus directional backs and decorative sprites; no adjacent crop pixels.
- [ ] **T06 — Specify deterministic fixture scenarios.** Define setup, frozen table, special chain, pending discards for eligible/ineligible viewers, claims, retained Chi, reorder, winner and exhaustion scenarios. **Blocked by:** T02. **Done:** Expected zones, counts, legal actions and transitions are written down, including duplicate faces and overflow.
- [ ] **T07 — Accept phase 1.** Review rules, contracts, atlas gallery and fixture specifications. **Blocked by:** T05, T06. **Done:** Every crop is validated and every planned tile transition has a fixture specification.

## Phase 2 — Frozen table and layout

- [ ] **T08 — Implement responsive Canvas coordinates.** Update `main.js`/`styles.css` for 384×216 logical units, 16:9 sizing, DPR backing resolution and pixelated rendering; account for borders. **Blocked by:** T07. **Done:** Logical positions remain stable at DPR 1/2 and after resizing.
- [ ] **T09 — Implement seat mapping and anchors.** Add pure functions in `canvas/layout.js` using `(absoluteSeat - viewerSeat + 4) % 4`. **Blocked by:** T08. **Done:** Each viewer is at the bottom, next seat at right; explicit seat labels avoid confusion from the baked-in background labels.
- [ ] **T10 — Lay out hands and melds.** Implement South centering, North reversal, East/West diagonal overlap and stable meld groups. **Blocked by:** T09. **Done:** Frozen hands match roadmap anchors; five Kongs plus a pair (22 physical tiles) remain contained without changing logical meld counts.
- [ ] **T11 — Lay out shaped discard piles.** Implement roadmap capacities/indents, seed-42 jitter, stable tie-breaking and persistent slot/orientation choices. **Blocked by:** T09. **Done:** Repeated layout calls are identical; no random work occurs in the draw loop or comparator.
- [ ] **T12 — Assemble the layered renderer.** Fill `renderer.js` with backgrounds, hands, piles, Gold nest, wall/targets, specials, current tile, arrow and held-tile overlay. **Blocked by:** T10, T11. **Done:** Group/local ordering matches the roadmap; render items also expose hit rectangles; arrow anchors do not shift with hand counts.
- [ ] **T13 — Add frozen fixtures and debug overlay.** Wire initial and mid-round states, viewer switching, anchors, bounds, hit regions and layer labels. **Blocked by:** T12. **Done:** All four perspectives are inspectable with coherent concealed/meld counts.
- [ ] **T14 — Accept the frozen table.** Calibrate crops, overlap, labels, arrow and geometry in browser. **Blocked by:** T13. **Done:** Table works at 768×432 and 1152×648 CSS sizes, narrower widths, and DPR 1/2; save representative verification evidence.

## Phase 3 — Demonstrate transitions without a server

- [ ] **T15 — Build the snapshot-to-view adapter.** Add `game/view.js` with explicit zones, permitted faces and stable instance IDs. **Blocked by:** T14. **Done:** Own faces/opponent backs are correct; every physical tile occupies exactly one presentation zone.
- [ ] **T16 — Preserve local hand order.** Reconcile concealed IDs by retaining survivors and appending new IDs; keep melds separate. **Blocked by:** T15. **Done:** Duplicate faces remain distinguishable and a new snapshot never resets the user's chosen order.
- [ ] **T17 — Implement setup presentation.** Add `game/presentation.js` and fixture stepping for packet deal, reverse-scan replacements and Gold reveal. **Blocked by:** T15. **Done:** Roadmap timing defaults are demonstrated; setup/rearrangement input stays disabled; opponent events need no hidden identities.
- [ ] **T18 — Implement draw/replacement presentation.** Demonstrate front draw, repeated special/back replacements and Kong's automatic first front replacement. **Blocked by:** T17. **Done:** Tile movement and front/back controls match each step without double draws.
- [ ] **T19 — Implement pending-discard presentation.** Show eligible viewers the current tile and ineligible viewers a provisional pile tile; settle/claim it using the same ID. **Blocked by:** T15. **Done:** Settlement preserves orientation, and a claim by another seat removes the provisional tile exactly once.
- [ ] **T20 — Demonstrate all claims and retained Chi.** Add Chi/Peng/Kong/Win fixtures plus Pass, timeout and retained-Chi expiry on draw/discard. **Blocked by:** T18, T19. **Done:** Melds are locked, retained Chi remains only for the next eligible seat, and no stale current tile survives.
- [ ] **T21 — Expose bounded rows and discard overflow.** Add opponent-special details and full unclaimed discard history/counts in HTML. **Blocked by:** T19. **Done:** Long specials rows and 20+ discards per pile lose no accessible information; claimed tiles leave unclaimed history.
- [ ] **T22 — Handle terminal/interrupted presentation.** Add winner reveal, exhaustion, pause and replacement-snapshot fixtures; cancel obsolete animation queues. **Blocked by:** T16, T20. **Done:** Only the winner is revealed; terminal controls/arrow stop; a fresh snapshot supersedes queued transitions.
- [ ] **T23 — Accept the visual transition milestone.** Step through all fixtures, including repeated identities, long specials and maximum Kongs. **Blocked by:** T21, T22. **Done:** No duplication, hidden overflow, random layout jumps or stale visuals; table is demonstrable without a backend.

## Phase 4 — Input and usable controls

- [ ] **T24 — Implement pointer conversion and hit tests.** Fill `input.js` using the same logical rectangles/transforms as rendering; inspect topmost items first. **Blocked by:** T23. **Done:** Resize, zoom, border offsets and diagonal overlaps select the correct eligible item.
- [ ] **T25 — Implement pointer hand rearrangement.** Add right-click pick/place, insertion marker and cancellation on blur/lost capture. **Blocked by:** T24, T16. **Done:** Only local concealed tiles move; left-click while holding cannot accidentally discard; context menu suppression is limited to the game surface.
- [ ] **T26 — Add keyboard controls.** Implement selection, legal Enter discard, reorder mode, Left/Right and Escape with readable selected-tile text. **Blocked by:** T25. **Done:** Pointer rearrangement/discard have usable keyboard alternatives and visible focus/selection.
- [ ] **T27 — Add action/status buttons.** Create `ui/game-controls.js` for Draw Front, Draw Back, best Claim, Pass, retained Chi/Draw, timer and accessible status. **Blocked by:** T24. **Done:** Controls consume fixture `legalActions` and use a shared intent path; locked/decorative zones cannot act.
- [ ] **T28 — Guard pending and invalidated input.** Simulate delayed acceptance/rejection, tile removal, pause, reconnect and result. **Blocked by:** T25, T26, T27. **Done:** Turn actions disable while pending, no optimistic tile movement occurs, and invalid held/selected IDs clear safely.
- [ ] **T29 — Accept controls.** Exercise overlap, illegal zones, both wall targets and order preservation with fixture snapshots. **Blocked by:** T28. **Done:** Pointer, keyboard and buttons agree on eligibility and remain usable under simulated latency.

## Phase 5 — Authoritative Node rules and private views

These tasks use the Python source as reference, not a runtime dependency. Backend
work can begin after T01/T02 while the visual work proceeds; integration waits
for both T29 and T48.

- [ ] **T30 — Implement protocol constants and validation.** Fill `shared/protocol.js` from the contract. **Blocked by:** T02. **Done:** Versioned room/action/snapshot/reply shapes reject malformed types, IDs, lengths and actions with readable errors.
- [ ] **T31 — Implement tiles and authoritative state.** Fill `state.js` and a small tile helper if useful; create 144 identity-independent instance IDs and all ownership containers. **Blocked by:** T02. **Done:** Counts match Python's 42 identities; Gold and skipped Gold specials have separate accounting.
- [ ] **T32 — Port pure claim predicates.** Fill claim portions of `rules.js`. **Blocked by:** T31. **Done:** No self-claim; Chi only from previous seat's discard; natural identities only, first valid Chi combination, best-claim priority Win > Kong > Peng > Chi.
- [ ] **T33 — Port the Gold-aware winning solver.** Implement five melds/pair and locked-meld hand sizes. **Blocked by:** T31. **Done:** Gold works in any sequence position, as a pair/triplet substitute or natural identity; incorrect lengths fail.
- [ ] **T34 — Implement setup transitions.** Add `engine.js` with explicit-wall support, packet deal, automatic back replacements, Gold selection and ordered setup events. **Blocked by:** T31, T33. **Done:** Counts finish at 17/16, all specials clear, dealer self-win is checked, and setup exhaustion terminates safely.
- [ ] **T35 — Implement manual draw/discard transitions.** Add `drawFront`, one-tile `drawBack`, self-win checks and instance-owned discard removal. **Blocked by:** T32, T33, T34. **Done:** Special chains require the correct controls; Gold remains discardable; out-of-turn/illegal intents do not mutate state.
- [ ] **T36 — Implement timed claim collection/resolution.** Separate deadline scheduling from pure transitions; collect all human intents before resolving. **Blocked by:** T35. **Done:** Silence is Pass, claim window is 3.5 seconds, ties follow turn order after discarder, and submission order cannot choose the winner.
- [ ] **T37 — Implement claim tile transfers and Kong replacement.** Transfer pending/owned tiles into stable melds or the winning hand. **Blocked by:** T36. **Done:** Chi/Peng normally enter discard; Kong counts as one meld, automatically draws once from front, then uses manual back replacement only for specials.
- [ ] **T38 — Generalize retained Chi.** Keep unclaimed discard pending for the next eligible human seat. **Blocked by:** T37. **Done:** Timed Pass does not remove retained Chi; current-turn retained claim is valid; draw/discard expires it atomically; other/old-window claims fail.
- [ ] **T39 — Centralize terminal handling.** Finish self-draw/discard wins and exhaustion at every draw site. **Blocked by:** T38. **Done:** State remains coherent and subsequent actions are rejected; expose a terminal result that room timers can use for cleanup.
- [ ] **T40 — Implement personalized snapshots/legal actions.** Add backend `game/view.js`. **Blocked by:** T30, T39. **Done:** Each seat sees only its own concealed IDs/faces and legal actions; others have counts, public zones and explicit winner reveal only.
- [ ] **T41 — Sanitize presentation events.** Project setup, draws and replacements per recipient. **Blocked by:** T40. **Done:** Opponent events expose seat/count only; no wall order, private skipped-Gold list or hidden IDs/faces escape.
- [ ] **T42 — Test inventory and conservation.** Add built-in Node tests covering each transition, pending discard, Gold, skipped specials and Kong. **Blocked by:** T39. **Done:** Standard-wall scenarios always account for all 144 unique physical instances exactly once, including terminal states.
- [ ] **T43 — Test solver and baseline parity.** Compare explicit front-to-back walls/scenarios with Python; test edge-rank sequences, Gold in each position, pairs and locked Kongs. **Blocked by:** T39. **Done:** Expected outcomes match except documented web changes; tests do not assume identical cross-language RNG seeds shuffle alike.
- [ ] **T44 — Test claim deadlines and retained Chi.** Use an injected clock/deadline input. **Blocked by:** T39. **Done:** Competing/equal-priority claims, timeout, Pass, retained claims and stale windows resolve deterministically without real-time sleeps.
- [ ] **T45 — Test setup, replacements and exhaustion.** Include short explicit walls and consecutive specials. **Blocked by:** T39. **Done:** Setup exhaustion, ordinary exhaustion, special-chain exhaustion, initial dealer win and Kong no-double-draw all pass.
- [ ] **T46 — Test snapshot/event privacy.** Inspect complete payloads for all four seats and every phase. **Blocked by:** T41. **Done:** No hidden identities/IDs, wall order, private skipped specials or other players' legal actions appear; only permitted winner reveal is added at game end.
- [ ] **T47 — Test malformed and illegal intents.** Cover wrong phase/seat/tile, unknown protocol fields/types where prohibited and invalid identifiers. **Blocked by:** T30, T39. **Done:** Rejections preserve authoritative state and return useful reasons.
- [ ] **T48 — Accept the rules engine.** Run all focused backend tests and review documented Python/web differences. **Blocked by:** T42, T43, T44, T45, T46, T47. **Done:** Engine is independently testable without browser/network dependencies and invariants/privacy hold.

## Phase 6 — Four-player rooms and live integration

- [ ] **T49 — Implement room membership/readiness.** Fill `rooms/manager.js` with in-memory create/list/join/leave and anonymous seats. **Blocked by:** T48. **Done:** Round starts only with four connected ready seats; membership cannot overfill or start twice.
- [ ] **T50 — Implement session ownership and resume tokens.** Bind server-issued tokens/sockets to room seats. **Blocked by:** T49. **Done:** A client cannot choose another acting seat; valid resume restores the existing seat; invalid/expired tokens are rejected.
- [ ] **T51 — Route validated messages.** Fill `network/handlers.js`, register in `index.js`, send personalized views and errors. **Blocked by:** T50. **Done:** `/api/health`, `/ws`, existing payload limits and Vite proxy remain usable; malformed JSON does not crash the server.
- [ ] **T52 — Enforce request and round validity.** Deduplicate request IDs per session and validate round/turn/window IDs. **Blocked by:** T51. **Done:** Retransmission cannot draw twice; prior-round intents fail; simultaneous valid claims are not rejected just because global revision changed.
- [ ] **T53 — Schedule setup and claim deadlines.** Connect room clocks to pure transitions and sanitized events. **Blocked by:** T52. **Done:** Setup input waits for a server deadline without waiting indefinitely on client animation acknowledgments; terminal states cancel timers.
- [ ] **T54 — Implement pause, resume and grace expiry.** On disconnect pause the round and remaining claim time; reserve the seat for 60 seconds. **Blocked by:** T53. **Done:** All seats see pause, all must reconnect to resume, saved deadline remainder is restored, and expiry ends as abandoned without auto-discard or hidden-hand exposure.
- [ ] **T55 — Implement browser transport.** Fill `network/client.js` with validation, pending requests, ordered revisions/events, resync and reconnect. **Blocked by:** T51. **Done:** Revision gaps request fresh state; rejected requests clear pending UI; restart/invalid session shows a clear session-ended message.
- [ ] **T56 — Implement the HTML lobby.** Fill `ui/lobby.js` with anonymous create/join/list/ready/leave and connection status. **Blocked by:** T55. **Done:** Four browser contexts see membership/readiness and transition into the same round.
- [ ] **T57 — Connect live state to table and controls.** Wire transport snapshots/events into existing view/presentation/input modules. **Blocked by:** T29, T53, T55, T56. **Done:** No fixture-only assumptions remain in live flow; requests await acceptance; each viewer remains at the bottom.
- [ ] **T58 — Reconcile pause/reconnect in the UI.** Add overlay, disable input, clear invalid selections and replace animation queues on resume. **Blocked by:** T54, T57. **Done:** Fresh authoritative snapshot wins, surviving hand order is preserved where possible, and the displayed timer reflects restored remaining time.
- [ ] **T59 — Implement results and replay lifecycle.** Show winner/draw/abandoned results and explicit return to lobby. **Blocked by:** T58. **Done:** Abandonment returns connected users to lobby with a reason; each new game requires readiness, uses a new round ID and keeps dealer seat 0.
- [ ] **T60 — Clean up expired room resources.** Expire empty rooms, tokens, old request records and obsolete timers. **Blocked by:** T59. **Done:** Dead sessions/rounds cannot mutate new games and repeated room cycles do not retain obsolete state.
- [ ] **T61 — Test lifecycle and hostile/stale transport cases.** Add room/handler tests for readiness, ownership, duplicate requests, old rounds, reconnect and grace expiry. **Blocked by:** T60. **Done:** Fake-clock cases pass, including disconnect during claims and multiple disconnected seats.
- [ ] **T62 — Verify four-browser gameplay and privacy.** Play a full round; use deterministic scenarios for competing claims and rare endings; inspect all four WebSocket streams. **Blocked by:** T61. **Done:** Clients agree on one resolution, reveal no private data, recover within grace and report abandonment/restart clearly.
- [ ] **T63 — Accept multiplayer lifecycle.** Verify finish → lobby → ready → new round as well as disconnect during reorder/claim. **Blocked by:** T62. **Done:** No old-round action, timer or animation affects the next round.

## Phase 7 — Final verification and documentation

- [ ] **T64 — Verify visual and interaction edge cases.** Run the roadmap's resize/zoom/DPR, duplicate-face, 22-tile hand, long-special and discard-overflow scenarios. **Blocked by:** T63. **Done:** Hit targets align, overlap remains readable, and all four perspectives retain correct ownership/artwork.
- [ ] **T65 — Polish accessibility and motion.** Check keyboard focus, status text, disabled/error states, loading feedback and reduced motion. **Blocked by:** T64. **Done:** Core actions work without right-click; animations never shorten a live claim window or block resync.
- [ ] **T66 — Isolate development tooling.** Remove fixture/gallery/debug controls from normal user flow and guard development-only imports/entry points. **Blocked by:** T65. **Done:** Production users cannot access synthetic hidden state or accidentally start fixture mode; developers can still reproduce scenarios.
- [ ] **T67 — Run final automated checks.** Run `npm run build`, `node --test backend/test/*.test.js`, `python3 -m python_state_machine --seed 7 --games 100`, and `git diff --check`; run any focused layout tests added during implementation. **Blocked by:** T66. **Done:** Commands pass on Node 22.12+; record results and fix failures before checking off.
- [ ] **T68 — Verify acceptance A1–A3.** Review sprite gallery, all table regions and all tile transitions. **Blocked by:** T67. **Done:** Link evidence for A1 artwork, A2 responsive layout and A3 transition correctness; no physical tile duplication/loss.
- [ ] **T69 — Verify acceptance A4–A6.** Recheck input, four-player privacy/recovery and completed-round lifecycle on final build. **Blocked by:** T68. **Done:** Link evidence for A4 controls, A5 multiplayer and A6 finish/lobby/build; normal flow contains no development UI.
- [ ] **T70 — Update runnable-project documentation.** Update README with actual file structure, controls, four-player startup, reconnect limitations, rule differences and reproducible demo steps. **Blocked by:** T69. **Done:** Another teammate can run the demo; explain that Vite preview serves frontend only and production `/api`/`/ws` routing is separate work.
- [ ] **T71 — Preserve references and retire the handoff.** Move lasting geometry, atlas, timing, contracts and verification references from `plan.md` into normal docs; update this checklist's links. **Blocked by:** T70. **Done:** All lasting specifications remain available and A1–A6 evidence is retained, then delete the temporary `plan.md` as it requests before a later implementation commit/push. Do not delete it during this planning task.

## Milestone gates and dependency overview

| Gate | Required tasks | Unlocks / acceptance |
| --- | --- | --- |
| Rules/contracts | T01–T02 | Shared fixtures and independent backend implementation |
| Validated reference | T07 | Layout can rely on atlas and agreed scenarios |
| Frozen table | T14 | Transition/presentation implementation |
| Visual milestone | T23 | Input work; first useful standalone deliverable |
| Usable controls | T29 | Live integration once backend/transport prerequisites also pass |
| Safe engine | T48 | Room lifecycle implementation |
| Four-player lifecycle | T63 | Final polish and full verification |
| MVP accepted | T69 | A1–A6 all demonstrated; documentation/handoff closure remains |
| Roadmap complete | T71 | Runnable documented MVP with lasting references preserved |

Start with T01 and T03; after T01, T02 opens contracts and then fixture specs.
The main frontend chain is T07 → T14 → T23 → T29. The backend chain starts at
T02 and converges at T48. Live integration T57 joins the frontend, room deadlines
and browser transport; completion requires the remaining lifecycle and QA gates.

## To be planned work (not blockers for this roadmap)

Scoring/weekly leaderboards, accounts/database, production bots, concealed or
promoted Kongs, selecting alternate Chi combinations, dice/dealer rotation,
animated wall depletion, new artwork or baked-in compass-label correction,
auto-sort, portrait redesign and polished touch rearrangement need separate scope
and acceptance criteria. Production hosting/deployment is also a separate task.

## Review limitations

This checklist was produced by reading the roadmap, documentation, configuration,
frontend/backend scaffold and Python source. It does not claim browser gameplay,
atlas validation, a successful build or a passing gameplay suite; those are
explicit implementation tasks above. No application code was changed.
