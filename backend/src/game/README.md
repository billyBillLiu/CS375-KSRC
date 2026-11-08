# Rules engine

`tiles.js` creates the 144 physical tiles with opaque IDs and canonical faces.
`state.js` creates an undealt round with separate ownership containers for the
wall, each player's tiles, the pending discard, Gold and skipped Gold specials.
The wall is unshuffled; dealing, transitions and win evaluation are not implemented.

Use [the Python simulator](../../../python_state_machine/) as the rules baseline,
with the web changes in [the MVP checklist](../../../roadmap-tasks.md).
Do not send the wall or opponents' concealed hands
in a public room snapshot. Clients should send intent; the server decides
whether an action is legal and sends each player their own view.
