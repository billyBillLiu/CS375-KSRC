import { DISCARD_CAPACITY, SPECIAL_CAPACITY } from '../canvas/layout.js';

export function renderRoundDetails(parent, view) {
    parent.replaceChildren();
    const note = document.createElement('p');
    note.textContent = 'Face-up groups after each concealed hand are locked melds. Discard rows show the first 8 tiles. Opponent specials are listed below.';
    parent.append(note);
    for (const player of view.players) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        const specials = player.specials ?? [];
        const discards = player.discards ?? [];
        const visibleSpecials = player.seat === view.viewerSeat ? SPECIAL_CAPACITY : 0;
        summary.textContent = `Seat ${player.seat} · ${player.concealedCount} concealed · ${specials.length} specials (${Math.max(0, specials.length - visibleSpecials)} in details only) · ${discards.length} discards (${Math.max(0, discards.length - DISCARD_CAPACITY)} in details only)`;
        details.append(summary);
        const meldText = document.createElement('p');
        meldText.textContent = `Melds: ${(player.melds ?? []).map(meld => `${meld.type}: ${meld.tiles.map(tile => tile.identity).join(', ')}`).join(' / ') || 'none'}`;
        details.append(meldText);
        for (const [name, list] of [['Specials', specials], ['Discards', discards]]) {
            const title = document.createElement('p');
            title.textContent = `${name} (${list.length})${list.length ? ':' : ': none'}`;
            const entries = document.createElement('ol');
            for (const tile of list) {
                const entry = document.createElement('li');
                entry.textContent = tile.identity;
                entries.append(entry);
            }
            details.append(title, entries);
        }
        parent.append(details);
    }
}
