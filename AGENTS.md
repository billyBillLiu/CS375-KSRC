# Project conventions

Build a readable, working four-player Mahjong MVP. Keep the process lightweight;
avoid extra frameworks, documentation layers and abstractions without a current need.

## Before starting a task

- Read `README.md` for setup and `roadmap-tasks.md` for current scope and dependencies.
- Read the relevant sections of `plan.md`, nearby source files, tests and local
  README files before editing. Use the Python reference for rules work.
- Check `git status` and relevant diffs. Preserve unrelated work and user edits.
- Confirm what is actually implemented; a roadmap entry or checkbox is not proof
  that code exists or works. Do not start dependent work on missing prerequisites.
- Reuse context already read in this session unless files or task scope have changed.

## Scope and references

- Follow the user's latest instructions. For MVP scope, `roadmap-tasks.md` takes
  precedence over the older, more detailed `plan.md`.
- Use `plan.md` for applicable artwork, geometry and gameplay details. Its animated
  setup, manual rearrangement, shaped piles and reconnect recovery are deferred
  by the MVP checklist; do not add them as prerequisites.
- Use `python_state_machine/tiles.py`, `state.py`, `rules.py` and `game.py` as the
  rules baseline, with the web changes listed in the MVP checklist. The simulator
  is a reference, not a web runtime dependency.
- `docs/rules-notes.md` is exploratory and may disagree with the simulator. Do not
  silently mix rules. Older links to `docs/rules.md` do not require creating it.
- Keep the existing stack: plain JavaScript ES modules, Canvas, HTML/CSS, Node,
  WebSockets and Vite. Use the existing PNG assets and Node 22.12 or newer.

## Code style

- Optimize for readability. Use descriptive names, straightforward control flow
  and small functions with a clear purpose. Prefer explicit code over clever shortcuts.
- Match nearby style and `.editorconfig`: four spaces, two for JSON, LF endings,
  final newline and no trailing whitespace. JavaScript uses single quotes and
  semicolons; use `const` by default and `let` when reassignment is needed.
- Use camelCase for JavaScript variables/functions, PascalCase for classes and
  UPPER_SNAKE_CASE for shared constants. Keep Python's existing snake_case style.
- Reuse existing modules before adding files. Extract helpers when they clarify
  behavior or remove meaningful duplication, not to anticipate future features.
- Keep changes focused. Avoid unrelated refactors, formatting churn, dependencies
  or new tooling. Do not edit generated builds or installed packages.

## Comments and communication

- Comments explain a non-obvious rule, reason or limitation; do not narrate code.
  Prefer clearer names or simpler logic over adding an explanatory paragraph.
- Keep comments short and close to the relevant code. Use JSDoc/docstrings only
  when inputs, outputs or behavior need clarification; not for every function.
- Keep progress updates and final summaries concise and easy to read. State what
  changed, what was checked and any remaining blocker. Do not claim unrun checks passed.

## Game and module boundaries

- Keep rules/state transitions in `backend/src/game/`, room lifecycle in
  `backend/src/rooms/` and socket handling in `backend/src/network/`.
- Keep drawing/input in `frontend/src/canvas/`, browser connections in `network/`
  and HTML controls in `ui/`. Keep `main.js` focused on wiring these together.
- Put shared message names and small data helpers in `shared/protocol.js` as
  needed. Comments and working code are sufficient; no formal contract document.
- The server decides legality and binds sockets to seats. Validate incoming
  intents before mutation; reject stale/duplicate actions without double moves.
- Send personalized snapshots. Never send wall order or opponents' concealed
  identities/IDs; reveal only the winner's hand when the round ends.
- Track physical tiles with unique IDs independent of their faces. Keep each
  tile in one ownership location, including Gold and skipped Gold specials.
- Keep logical Canvas coordinates separate from CSS/backing-pixel sizes. Drawing
  and hit testing must share geometry; visual seat mapping must not change turn order.

## Tests and verification

- Test meaningful behavior and regressions, not private implementation details.
  Add focused tests for rules, state transitions, validation and privacy changes.
  Do not add tests just for comments, documentation or trivial styling changes.
- Use Node's built-in `node:test` and `node:assert/strict`; put backend tests in
  `backend/test/*.test.js`. Name tests after the behavior they verify.
- Keep tests deterministic. Use explicit walls for Python/JavaScript comparisons
  and an injected clock for deadlines; avoid real sleeps and random failures.
- Prioritize tile conservation, Gold wins, claim priority/ties, retained Chi,
  special/Kong replacements, exhaustion, illegal actions and concealed-hand privacy.
  Cover room readiness and disconnect behavior when implementing those features.
- Run the affected test files while working. Run `node --test backend/test/*.test.js`
  for shared engine/network changes once test files exist. Do not treat a missing
  test suite as a successful test run.
- Run `npm run build` for frontend/build changes and `git diff --check` before
  finishing. Inspect visual/input changes in the browser; a build cannot verify them.
- For Python engine changes, also run
  `python3 -m python_state_machine --seed 7 --games 100`. This checks the simulator,
  not browser gameplay. For multiplayer changes, exercise the affected flow with
  four browser contexts, including privacy and disconnects where relevant.
- Scale checks to the change. Documentation-only work needs review of facts,
  paths and formatting, not gameplay tests. Report any check that could not run.

## Documentation maintenance

- Update documents only when a change makes their existing content inaccurate,
  or when the user explicitly requests documentation work.
- Edit the smallest relevant section. Keep wording concise; do not rewrite
  unrelated docs, add routine progress logs or create extra specification files.
- Keep setup/usage instructions in `README.md` and implementation tasks in
  `roadmap-tasks.md`. Mark tasks complete only when their completion checks pass.
- Document implemented behavior accurately. Do not describe planned features as
  working, or expand MVP scope merely to satisfy an older document.
