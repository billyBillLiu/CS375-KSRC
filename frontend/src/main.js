import './styles.css';
import { CLIENT_MESSAGES, SERVER_MESSAGES } from '../../shared/protocol.js';
import { initializeRenderer } from './canvas/renderer.js';
import { connectToServer } from './network/client.js';
import { createLobby } from './ui/lobby.js';
import { createTableView } from './game/view.js';
import { renderRoundDetails } from './ui/round-details.js';

const canvas = document.querySelector('#game');
const status = document.querySelector('.status');
const connectionStatus = document.querySelector('.connection-status');
const roundSummary = document.querySelector('.round-summary');
const seatSummary = document.querySelector('.seat-summary');
const roundDetails = document.querySelector('.round-details');
const params = new URLSearchParams(window.location.search);
const samplePreview = import.meta.env.DEV && params.has('sample');
let renderer = null;
let tableView = null;

function showSnapshot(snapshot) {
    tableView = createTableView(snapshot);
    renderer?.setView(tableView);
    const youLabel = tableView.currentSeat === tableView.viewerSeat ? ' (you)' : '';
    const turnText = tableView.phase === 'over'
        ? 'Round ended' : `Turn: seat ${tableView.currentSeat}${youLabel}`;
    roundSummary.textContent = `Wall: ${tableView.wallCount} tiles · ${turnText}`;
    seatSummary.textContent = ['Bottom', 'Right', 'Top', 'Left'].map((side, offset) => {
        const seat = (tableView.viewerSeat + offset) % 4;
        return `${side}: seat ${seat}${offset === 0 ? ' (you)' : ''}`;
    }).join(' · ');
    renderRoundDetails(roundDetails, tableView);
}

function clearRound() {
    tableView = null;
    renderer?.setView(null);
    roundSummary.textContent = '';
    seatSummary.textContent = '';
    roundDetails.replaceChildren();
}

const lobby = createLobby(document.querySelector('.lobby'), (type, payload) => connection.send(type, payload));

const connection = connectToServer({
    onStatus(state) {
        lobby.setConnected(state === 'open');
        if (state === 'connecting') connectionStatus.textContent = 'Connecting to server…';
        if (state === 'open') {
            connectionStatus.textContent = 'Connected';
            connection.send(CLIENT_MESSAGES.LIST_ROOMS);
        }
        if (state === 'closed') connectionStatus.textContent = 'Connection lost. Reload the page to reconnect.';
    },
    onMessage({ type, payload }) {
        if (type === SERVER_MESSAGES.ROOM_LIST) {
            connectionStatus.textContent = 'Connected';
            lobby.showRoomList(payload.rooms);
            if (!samplePreview) clearRound();
        } else if (type === SERVER_MESSAGES.ROOM_STATE) {
            connectionStatus.textContent = 'Connected';
            lobby.showRoomState(payload);
            if (!samplePreview && !payload.roundId) clearRound();
        } else if (type === SERVER_MESSAGES.SNAPSHOT && !samplePreview) {
            showSnapshot(payload);
        } else if (type === SERVER_MESSAGES.ERROR) {
            connectionStatus.textContent = `Server error: ${payload.reason}`;
        }
    },
});

try {
    renderer = await initializeRenderer(canvas);
    // A snapshot can arrive while the artwork is still loading.
    renderer.setView(tableView);
    if (import.meta.env.DEV) {
        if (params.has('sample') || params.has('atlas')) {
            const fixtures = await import('./dev/fixtures.js');
            if (params.has('sample')) fixtures.showSamplePreview(canvas.parentElement, renderer);
            if (params.has('atlas')) await fixtures.showAtlasPreview(canvas.parentElement);
        }
    }
} catch (error) {
    status.textContent = 'Unable to load the Mahjong table. Please reload to try again.';
    console.error(error);
}
