import { renderRoundDetails } from '../ui/round-details.js';
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

// Fixed public examples; instance IDs remain distinct even for repeated faces.
function makeSample(stress = false) {
    let nextId = 0;
    const tile = identity => ({ id: `sample-${nextId++}`, identity });
    const players = Array.from({ length: 4 }, (_, seat) => {
        const meldFaces = stress && seat === 0
            ? ['1WAN', '2WAN', '3WAN', '4WAN', '5WAN'].map(face => [face, face, face, face])
            : [seat === 0 ? ['1WAN', '2WAN', '3WAN'] : ['9BIN', '9BIN', '9BIN']];
        const count = stress && seat === 0 ? 2 : 13;
        return {
            seat,
            hand: Array.from({ length: count }, (_, index) => tile(`${Math.floor(index / 2) + 1}${['TAO', 'WAN', 'BIN', 'TAO'][seat]}`)),
            melds: meldFaces.map((faces, index) => ({
                id: `meld-${seat}-${index}`, type: faces.length === 4 ? 'Kong' : seat === 0 ? 'Chi' : 'Peng', tiles: faces.map(tile),
            })),
            specials: Array.from({ length: stress && seat === 0 ? 28 : seat + 2 }, (_, index) => tile(['WIND_EAST', 'DRGN_RED', 'FLO_1', 'SZN_SPR'][index % 4])),
            discards: Array.from({ length: stress ? 25 : 6 + seat * 2 }, (_, index) => tile(`${index % 9 + 1}BIN`)),
        };
    });
    return { players, goldIndicator: tile('8TAO'), pendingDiscard: { seat: 2, tile: tile('5WAN') } };
}

export function showSamplePreview(parent, renderer) {
    let sampleState = makeSample();
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
    const stressLabel = document.createElement('label');
    const stress = document.createElement('input');
    stress.type = 'checkbox';
    stressLabel.append(stress, ' Stress: five Kongs and overflowing public piles');
    const details = document.createElement('div');
    details.className = 'round-details';
    section.append(label, stressLabel, summary, details);
    parent.append(section);

    function updateView() {
        const viewerSeat = Number(select.value);
        const view = {
            viewerSeat,
            ownHand: sampleState.players[viewerSeat].hand,
            players: sampleState.players.map(player => ({
                seat: player.seat,
                concealedCount: player.hand.length,
                melds: player.melds,
                specials: player.specials,
                discards: player.discards,
            })),
            goldIndicator: sampleState.goldIndicator,
            pendingDiscard: sampleState.pendingDiscard,
        };
        renderer.setView(view);
        renderRoundDetails(details, view);
        summary.textContent = ['Bottom', 'Right', 'Top', 'Left'].map((side, offset) => {
            const seat = (viewerSeat + offset) % 4;
            return `${side}: seat ${seat} (${sampleState.players[seat].hand.length} tiles)`;
        }).join(' · ');
    }
    stress.addEventListener('change', () => {
        sampleState = makeSample(stress.checked);
        updateView();
    });
    select.addEventListener('change', updateView);
    updateView();
}
