import { getBestClaim } from './rules.js';

// Build an allowlisted view, never a copy of the complete engine state.
export function createGameView(state, seat, serverNow = Date.now()) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= state.players.length) {
        throw new Error('Player seat must be 0, 1, 2 or 3');
    }
    const view = {
        you: seat,
        serverNow,
        phase: state.phase,
        currentSeat: state.currentSeat,
        dealerSeat: state.dealerSeat,
        wallCount: state.wall.length,
        gold: copyTile(state.gold),
        ownHand: state.players[seat].concealed.map(copyTile),
        players: state.players.map((player, index) => ({
            seat: index,
            concealedCount: player.concealed.length,
            melds: player.melds.map((meld) => ({
                id: meld.id,
                kind: meld.kind,
                fromSeat: meld.fromSeat,
                tiles: meld.tiles.map(copyTile),
            })),
            specials: player.specials.map(copyTile),
            discards: player.discards.map(copyTile),
        })),
        pendingDiscard: state.pendingDiscard && {
            fromSeat: state.pendingDiscard.fromSeat,
            tile: copyTile(state.pendingDiscard.tile),
        },
        claimWindowId: state.claimWindow?.id ?? null,
        claimDeadline: state.claimWindow?.deadline ?? null,
        retainedChi: state.retainedChi?.seat === seat ? { ...state.retainedChi } : null,
        legalActions: legalActions(state, seat, serverNow),
        winner: state.winner,
        endReason: state.endReason,
    };
    if (state.phase === 'over' && state.winner !== null) {
        view.revealedWinnerHand = state.players[state.winner].concealed.map(copyTile);
    }
    return view;
}

function copyTile(tile) {
    return tile && { id: tile.id, tileId: tile.tileId };
}

function legalActions(state, seat, now) {
    const actions = { drawFront: false, drawBack: false, discard: false, claim: null, pass: false };
    if (state.phase === 'over' || state.phase === 'setup') return actions;
    if (state.phase === 'claims') {
        const window = state.claimWindow;
        if (!window || now >= window.deadline || window.choices[seat] !== null
            || state.pendingDiscard?.fromSeat === seat) return actions;
        actions.pass = true;
        actions.claim = getBestClaim(state, seat)?.kind ?? null;
    } else if (state.currentSeat === seat) {
        actions.drawFront = state.phase === 'drawFront';
        actions.drawBack = state.phase === 'drawBack';
        actions.discard = state.phase === 'discard';
        actions.claim = getBestClaim(state, seat)?.kind ?? null;
    }
    return actions;
}
