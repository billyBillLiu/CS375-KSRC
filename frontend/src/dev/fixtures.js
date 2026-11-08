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
