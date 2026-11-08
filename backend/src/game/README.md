# Rules engine

`tiles.js` creates the 144 physical tiles with opaque IDs and canonical faces.
`state.js` creates an undealt round with separate ownership containers for the
wall, each player's tiles, the pending discard, Gold and skipped Gold specials.
The undealt wall is unshuffled.

`engine.js` exports `createRound()`, which shuffles, deals, replaces setup specials
from the back and selects Gold. For deterministic debugging, `createRound({ wall })`
accepts an array of canonical face strings in front-to-back order without shuffling
or modifying it. Short walls are allowed; exhaustion returns phase `over` with
`endReason: 'wall_exhausted'` and preserves all tiles drawn so far.

After setup, the dealer either wins automatically or starts in phase `discard`.
`drawFront(state, seat)` and `drawBack(state, seat)` each draw one tile for the
current player in the matching phase. Specials require a manual back draw;
playable tiles are sorted into the hand and lead to discard or a self-win.
Exhaustion ends the round when a required draw has no tile, including when the
last tile is a special with no replacement. Wrong-seat and wrong-phase draws
throw without changing state. These functions mutate and return the round state;
discard, claim resolution, turn advancement and browser controls are still pending.

`rules.js` exports `isWinningHand(player, gold)` and
`canWinWithTile(player, candidate, gold)`. They use physical tile objects, treat
Gold as a wildcard and count each locked meld (including a Kong) as one group.
Both checks leave the player's state unchanged; `gold` may be null or omitted.

Use [the Python simulator](../../../python_state_machine/) as the rules baseline,
with the web changes in [the MVP checklist](../../../roadmap-tasks.md).
Do not send the wall or opponents' concealed hands
in a public room snapshot. Clients should send intent; the server decides
whether an action is legal and sends each player their own view.
