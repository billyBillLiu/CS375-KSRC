import { backs, drawSprite, loadAtlas, tiles } from '../canvas/atlas.js';

// Temporary, opt-in atlas inspection; keep this out of the normal table flow.
export async function showAtlasPreview(parent) {
    const atlas = await loadAtlas();
    const section = document.createElement('section');
    section.className = 'atlas-preview';
    const heading = document.createElement('h2');
    heading.textContent = 'Tile atlas — 42 identities';
    const note = document.createElement('p');
    note.textContent = 'All sprites at 2×. Specials use transformed existing artwork where directional, current and Gold art is absent. Left/right refer to discard slant; directions are visual seats.';
    section.append(heading, note);
    const variants = ['hand', 'current', 'gold', 'discardLeft', 'discardRight',
        'south', 'east', 'north', 'west'];
    const table = document.createElement('table');
    const header = table.createTHead().insertRow();
    for (const name of ['Identity', ...variants]) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = name;
        header.append(cell);
    }
    const body = table.createTBody();
    for (const [identity, sprites] of Object.entries(tiles)) {
        const row = body.insertRow();
        const label = document.createElement('th');
        label.scope = 'row';
        label.textContent = identity;
        row.append(label);
        for (const variant of variants) {
            row.insertCell().append(previewSprite(atlas,
                sprites[variant] ?? sprites.revealed[variant], `${identity} ${variant}`));
        }
    }
    section.append(table);
    const backHeading = document.createElement('h3');
    backHeading.textContent = 'Concealed backs';
    section.append(backHeading);
    for (const [direction, sprite] of Object.entries(backs)) {
        const label = document.createElement('figure');
        const caption = document.createElement('figcaption');
        caption.textContent = direction;
        label.append(previewSprite(atlas, sprite, `${direction} back`), caption);
        section.append(label);
    }
    parent.append(section);
}

function previewSprite(atlas, sprite, label) {
    const canvas = document.createElement('canvas');
    canvas.width = 72;
    canvas.height = 84;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
    const context = canvas.getContext('2d');
    context.scale(2, 2);
    context.imageSmoothingEnabled = false;
    drawSprite(context, atlas, sprite, 18, 21);
    return canvas;
}

// One fixed round: distinct sorted hands make seat switching easy to inspect.
const sampleState = {
    players: [
        ['1WAN', '1WAN', '2WAN', '3WAN', '4WAN', '5WAN', '6WAN', '7WAN', '8WAN', '9WAN', '1TAO', '2TAO', '3TAO', '4TAO', '5TAO', '6TAO', '7TAO'],
        ['2WAN', '2WAN', '3WAN', '4WAN', '5WAN', '6WAN', '7WAN', '8WAN', '9WAN', '1TAO', '2TAO', '3TAO', '4TAO', '5TAO', '6TAO', '7TAO'],
        ['1TAO', '2TAO', '3TAO', '4TAO', '5TAO', '6TAO', '7TAO', '8TAO', '9TAO', '1BIN', '2BIN', '3BIN', '4BIN', '5BIN', '6BIN', '7BIN'],
        ['1BIN', '2BIN', '3BIN', '4BIN', '5BIN', '6BIN', '7BIN', '8BIN', '8BIN', '9BIN', '9BIN', '9WAN', '8WAN', '7WAN', '8TAO', '9TAO'],
    ].map((identities, seat) => ({
        seat,
        hand: identities.sort((a, b) => {
            const suits = ['WAN', 'TAO', 'BIN'];
            return suits.indexOf(a.slice(1)) - suits.indexOf(b.slice(1)) || Number(a[0]) - Number(b[0]);
        }).map((identity, index) => ({ id: `sample-${seat}-${index}`, identity })),
    })),
};

export function showSamplePreview(parent, renderer) {
    const section = document.createElement('section');
    section.className = 'sample-preview';
    const label = document.createElement('label');
    label.textContent = 'Sample viewer seat: ';
    const select = document.createElement('select');
    for (const player of sampleState.players) {
        select.add(new Option(`Seat ${player.seat}`, player.seat));
    }
    label.append(select);
    const summary = document.createElement('p');
    summary.setAttribute('role', 'status');
    section.append(label, summary);
    parent.append(section);

    function updateView() {
        const viewerSeat = Number(select.value);
        renderer.setView({
            viewerSeat,
            ownHand: sampleState.players[viewerSeat].hand,
            players: sampleState.players.map(player => ({
                seat: player.seat,
                concealedCount: player.hand.length,
            })),
        });
        summary.textContent = ['Bottom', 'Right', 'Top', 'Left'].map((side, offset) => {
            const seat = (viewerSeat + offset) % 4;
            return `${side}: seat ${seat} (${sampleState.players[seat].hand.length} tiles)`;
        }).join(' · ');
    }
    select.addEventListener('change', updateView);
    updateView();
}
