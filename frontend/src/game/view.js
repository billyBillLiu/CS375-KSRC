function mapTile(tile) {
    return tile && { id: tile.id, identity: tile.tileId };
}

function handOrder(tile) {
    const suit = ['WAN', 'TAO', 'BIN'].indexOf(tile.identity.slice(1));
    return suit * 9 + Number(tile.identity[0]);
}

// A pending tile is still public to everyone, but only claimants need it in the center.
export function getDiscardDisplay(view) {
    const pending = view.pendingDiscard;
    const centerDiscard = pending && view.legalActions?.claim ? pending : null;
    const piles = view.players.map(player => {
        const tiles = [...(player.discards ?? [])];
        if (pending && !centerDiscard && pending.seat === player.seat) {
            tiles.push(pending.tile);
        }
        return { seat: player.seat, tiles };
    });
    return { centerDiscard, piles };
}

// Adapt the private server snapshot to the Canvas view without changing seats.
export function createTableView(snapshot) {
    return {
        roundId: snapshot.roundId,
        viewerSeat: snapshot.you,
        currentSeat: snapshot.currentSeat,
        phase: snapshot.phase,
        wallCount: snapshot.wallCount,
        ownHand: snapshot.ownHand.map(mapTile).sort((a, b) => handOrder(a) - handOrder(b)),
        goldIndicator: mapTile(snapshot.gold),
        pendingDiscard: snapshot.pendingDiscard && {
            seat: snapshot.pendingDiscard.fromSeat,
            tile: mapTile(snapshot.pendingDiscard.tile),
        },
        claimWindowId: snapshot.claimWindowId,
        retainedChi: snapshot.retainedChi,
        legalActions: snapshot.legalActions,
        openingTileId: snapshot.openingTileId ?? null,
        players: snapshot.players.map(player => ({
            seat: player.seat,
            concealedCount: player.concealedCount,
            melds: player.melds.map(meld => ({
                id: meld.id,
                type: meld.kind,
                fromSeat: meld.fromSeat,
                // The engine stores the claimed tile first; show the meld in rank order.
                tiles: meld.tiles.map(mapTile).sort((a, b) => handOrder(a) - handOrder(b)),
            })),
            specials: player.specials.map(mapTile),
            discards: player.discards.map(mapTile),
        })),
    };
}

// The tile drawn this turn is the one new tile in the local hand since the
// previous snapshot. It stays marked until it is discarded or the turn ends.
// The dealer's extra opening tile comes from the server, since there is no earlier hand to compare.
export function findDrawnTileId(previous, next) {
    if (next.currentSeat !== next.viewerSeat || next.phase !== 'discard') return null;
    if (next.openingTileId && next.ownHand.some((tile) => tile.id === next.openingTileId)) return next.openingTileId;
    if (!previous || previous.roundId !== next.roundId) return null;
    const previousIds = new Set(previous.ownHand.map((tile) => tile.id));
    const added = next.ownHand.filter((tile) => !previousIds.has(tile.id));
    if (added.length === 1) return added[0].id;
    return added.length === 0 && next.ownHand.some((tile) => tile.id === previous.drawnTileId)
        ? previous.drawnTileId : null;
}

// Specials drawn this turn: new local specials since the previous snapshot,
// kept until the turn ends. A chain of specials marks every one of them.
export function findDrawnSpecialIds(previous, next) {
    if (!previous || previous.roundId !== next.roundId) return [];
    if (next.currentSeat !== next.viewerSeat || !['drawBack', 'discard'].includes(next.phase)) return [];
    const previousIds = new Set(previous.players[next.viewerSeat].specials.map((tile) => tile.id));
    const added = next.players[next.viewerSeat].specials.filter((tile) => !previousIds.has(tile.id));
    return [...(previous.drawnSpecialIds ?? []), ...added.map((tile) => tile.id)];
}
