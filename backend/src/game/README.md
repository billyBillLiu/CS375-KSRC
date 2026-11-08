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

Successful setup leaves phase `setup`. Opening win checks and the transition to
the dealer's first discard are deferred to M09; gameplay actions are not implemented.

`rules.js` exports `isWinningHand(player, gold)` and
`canWinWithTile(player, candidate, gold)`. They use physical tile objects, treat
Gold as a wildcard and count each locked meld (including a Kong) as one group.
Both checks leave the player's state unchanged; `gold` may be null or omitted.

Use [the Python simulator](../../../python_state_machine/) as the rules baseline,
with the web changes in [the MVP checklist](../../../roadmap-tasks.md).
Do not send the wall or opponents' concealed hands
in a public room snapshot. Clients should send intent; the server decides
whether an action is legal and sends each player their own view.
