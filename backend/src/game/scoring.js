import { MELDS_PER_HAND, winningGroupPoints } from './rules.js';

export function scoreWinner(state) {
    if (state.phase !== 'over' || state.winner === null
        || !['self_draw', 'discard_claim'].includes(state.endReason)) return null;
    const player = state.players[state.winner];
    const concealedPoints = winningGroupPoints(player, state.gold);
    if (concealedPoints < 0) throw new Error('Cannot score an invalid winning hand');
    const concealedMelds = MELDS_PER_HAND - player.melds.length;
    // A concealed meld earns either 1 (run) or 2 (triplet), never Kong points.
    let triplets = concealedPoints - concealedMelds;
    let runs = concealedMelds - triplets;
    let kongs = 0;
    for (const meld of player.melds) {
        if (meld.kind === 'chi') runs++;
        else if (meld.kind === 'peng') triplets++;
        else if (meld.kind === 'kong') kongs++;
        else throw new Error('Unknown meld kind');
    }
    const basePoints = runs + triplets * 2 + kongs * 4;
    const specials = player.specials.length;
    const specialMultiplier = 1 + specials * 0.5;
    const winMultiplier = state.endReason === 'self_draw' ? 2 : 1;
    return {
        runs, triplets, kongs, specials, basePoints, specialMultiplier, winMultiplier,
        total: basePoints * specialMultiplier * winMultiplier,
    };
}
