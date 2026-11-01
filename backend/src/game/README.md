# Rules engine

Place authoritative game state, dealing, legal-action validation, claims, and
win evaluation here. The current server has no game or lobby logic.

Implement the rules described in [the rules reference](../../../docs/rules.md).
Do not send the wall or opponents' concealed hands
in a public room snapshot. Clients should send intent; the server decides
whether an action is legal and sends each player their own view.
