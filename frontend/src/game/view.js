function mapTile(tile) {
    return tile && { id: tile.id, identity: tile.tileId };
}

function handOrder(tile) {
    const suit = ['WAN', 'TAO', 'BIN'].indexOf(tile.identity.slice(1));
    return suit * 9 + Number(tile.identity[0]);
}

// Adapt the private server snapshot to the Canvas view without changing seats.
export function createTableView(snapshot) {
    return {
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
        players: snapshot.players.map(player => ({
            seat: player.seat,
            concealedCount: player.concealedCount,
            melds: player.melds.map(meld => ({
                id: meld.id,
                type: meld.kind,
                fromSeat: meld.fromSeat,
                tiles: meld.tiles.map(mapTile),
            })),
            specials: player.specials.map(mapTile),
            discards: player.discards.map(mapTile),
        })),
    };
}
