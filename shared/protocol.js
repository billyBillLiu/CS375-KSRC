// WebSocket message contract shared by the backend and frontend.
// Every message is JSON: { type, payload }.

/** Client -> server message types. Drawing is automatic, so there is no DRAW. */
export const C2S = Object.freeze({
    HELLO: 'hello',             // { token?: string, name?: string }  send first; token from localStorage
    CREATE_GAME: 'createGame',  // {}
    JOIN_GAME: 'joinGame',      // { gameId: string }
    LEAVE_GAME: 'leaveGame',    // {}
    DISCARD: 'discard',         // { tile: number }  0-35
    CLAIM: 'claim',             // { kind: 'chi'|'peng'|'kong'|'win', tiles?: number[] }  tiles = your tiles forming the chi
    PASS: 'pass',               // {}  decline the current claim window
    DECLARE_KONG: 'declareKong',// { tile: number }  concealed kong on your own turn
    DECLARE_WIN: 'declareWin',  // {}  self-drawn win
});

/** Server -> client message types. */
export const S2C = Object.freeze({
    WELCOME: 'welcome',         // { token: string, name: string }  save token to localStorage
    LOBBY: 'lobby',             // { games: [{ id, players: string[], seatsOpen: number }] }  open games only
    GAME_STATE: 'gameState',    // per-player view, see below
    CLAIM_WINDOW: 'claimWindow',// { tile: number, from: seat, options: string[], deadline: epoch ms }
    GAME_OVER: 'gameOver',      // { winner: seat|null, reason: string }
    PLAYER_LEFT: 'playerLeft',  // { seat: number, reconnectDeadline: epoch ms }
    ERROR: 'error',             // { reason: string }
});

/*
 * GAME_STATE payload. Each player gets their own view: other players' hands
 * are only counts, and the wall is only a count. Sent on every change.
 * {
 *   gameId, seat,                 // your seat, 0-3
 *   phase: 'waiting'|'playing'|'over',
 *   hand: number[],               // your tiles, sorted
 *   lastDrawn: number|null,       // tile you just drew (only on your turn)
 *   players: [{ seat, name, connected, away, handCount, discards: number[] }],
 *   wallCount, dealer,
 *   currentTurn: seat|null,       // whoever must discard now
 *   turnDeadline: epoch ms|null,  // server auto-discards for them at this time
 *   result: GAME_OVER payload|null
 * }
 * TODO: revealed melds, flowers, and gold tile once the engine supports them.
 */
