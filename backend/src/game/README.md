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
throw without changing state. These functions mutate and return the round state.

`discard(state, seat, tileInstanceId)` moves one owned concealed tile into
`pendingDiscard: { tile, fromSeat }` and enters phase `claims`. Any older pending
tile is settled into its discarder’s pile. Invalid seats, phases or tile IDs throw
before mutation. Each discard opens a 3.5-second `claimWindow` with a fresh `id`,
server `deadline` and private per-seat `choices`.

`submitClaim(state, seat, windowId, 'claim' | 'pass')` records one final choice per
seat other than the discarder. Silence counts as Pass. The timer resolves at the
deadline by Win > Kong > Peng > Chi, breaking ties in turn order after the
discarder. Late, duplicate and stale submissions are rejected before mutation;
resolution before the deadline is also rejected.
With no accepted claim, the next seat starts its turn; an available Chi remains
in `retainedChi` even after Pass. `claimRetainedChi(state, seat, windowId)` takes
that separate opportunity against the still-pending tile. Drawing or discarding
expires it, and late timed-window submissions cannot take it.

`createRound({ clock, onChange })` optionally accepts a clock with `now()`,
`setTimeout(callback, delay)` and `clearTimeout(handle)` for deterministic tests.
The defaults use server time and Node timers. `onChange(state)` runs after claim
resolution so future room code can broadcast personalized views. Timer handles
stay outside round state and are canceled on resolution, claim application or
round end. `resolveClaims(state, windowId)` can also resolve a due window directly.

`applyClaim(state, seat)` is the trusted transition used by the resolver; player
intents use `submitClaim` or `claimRetainedChi`. It rechecks and applies the
selected seat's best claim.
A winning discard enters the winner's hand and ends the round. Chi/Peng create
one locked meld and make the claimant discard; Kong creates one four-tile meld
and automatically draws one front replacement, with manual back draws for
specials. Illegal or repeated applications throw without changing state.
`view.js` builds personalized snapshots with the recipient’s own hand and legal
actions, opponent counts and public tiles. Only a finished round’s winner is
revealed. Rooms start the engine when all four connected seats are ready and
broadcast these views on setup and timed claim resolution. Browser controls send
validated actions to the server.

`rules.js` exports `isWinningHand(player, gold)` and
`canWinWithTile(player, candidate, gold)`. They use physical tile objects, treat
Gold as a wildcard and count each locked meld (including a Kong) as one group.
Both checks leave the player's state unchanged; `gold` may be null or omitted.
`winningGroupPoints` uses the same solver to maximize concealed meld points.
`scoring.js` adds declared melds and the special/win multipliers at round end;
only the winner's score is included in finished snapshots.

`getBestClaim(state, seat)` returns the seat's highest-priority claim during phase
`claims`: Win, Kong, Peng, then Chi. After that window, it offers only retained Chi
to the current eligible seat. It returns `{ kind, tiles }`, where `tiles`
contains the concealed instances needed for a meld (empty for Win), or null when
no claim is available. A seat cannot claim its own discard; only the next seat
can Chi. `findChiTiles(player, candidate)` finds the first natural matching pair
in Python order. Neither query changes state.

Use [the Python simulator](../../../python_state_machine/) as the rules baseline,
with the web changes in [the MVP checklist](../../../roadmap-tasks.md).
Do not send the wall or opponents' concealed hands
in a public room snapshot. Clients should send intent; the server decides
whether an action is legal and sends each player their own view.
