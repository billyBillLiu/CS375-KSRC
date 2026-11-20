import './styles.css';
import { CLIENT_MESSAGES, SERVER_MESSAGES } from '../../shared/protocol.js';
import { initializeRenderer } from './canvas/renderer.js';
import { connectToServer } from './network/client.js';
import { createLobby } from './ui/lobby.js';
import { createGameControls } from './ui/game-controls.js';
import { findHandTileAt, toLogicalPoint } from './canvas/input.js';
import { createTableView, findDrawnSpecialIds, findDrawnTileId } from './game/view.js';
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

const controls = createGameControls(document.querySelector('.game-controls'), {
    send: (type, payload) => connection.send(type, payload),
    onSelectionChange: (selectedTileId) => drawTable(selectedTileId),
});

function drawTable(selectedTileId) {
    renderer?.setView(tableView && { ...tableView, selectedTileId });
}

canvas.addEventListener('click', (event) => {
    const { x, y } = toLogicalPoint(canvas, event);
    if (lobby.click(x, y) || !tableView) return;
    const tileId = findHandTileAt(tableView, x, y);
    if (tileId !== null) controls.select(tileId);
});

canvas.addEventListener('mousemove', (event) => {
    const { x, y } = toLogicalPoint(canvas, event);
    canvas.style.cursor = lobby.hover(x, y) ? 'pointer' : '';
});

function showSnapshot(snapshot) {
    const nextView = createTableView(snapshot);
    nextView.drawnTileId = findDrawnTileId(tableView, nextView);
    nextView.drawnSpecialIds = findDrawnSpecialIds(tableView, nextView);
    tableView = nextView;
    waitingFor = snapshot.waitingFor ?? [];
    serverClockOffsetMs = Date.now() - snapshot.serverNow;
    drawTable(controls.setView(tableView));
    updateBanner();
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
    waitingFor = [];
    updateBanner();
    controls.clear();
    renderer?.setView(null);
    roundSummary.textContent = '';
    seatSummary.textContent = '';
    roundDetails.replaceChildren();
}

const lobby = createLobby({
    canvas,
    nameInput: document.querySelector('#player-name'),
    codeInput: document.querySelector('#room-code'),
    send: (type, payload) => connection.send(type, payload),
    onChange: (menu) => renderer?.setMenu(menu),
});
if (samplePreview || params.has('atlas')) lobby.hide();

// Each room has its own ?room= URL, so an invite link opens straight into that room.
function roomInUrl() {
    return new URLSearchParams(window.location.search).get('room');
}

function setRoomInUrl(roomId) {
    const url = new URL(window.location.href);
    if (roomId === null) url.searchParams.delete('room');
    else url.searchParams.set('room', roomId);
    window.history.replaceState(null, '', url);
}

// Seat tokens live in sessionStorage, so a reload or dropped connection in this
// tab can reclaim the seat while the server holds it, without sharing it with other tabs.
function seatTokenKey(roomId) {
    return `mahjong-seat-${roomId}`;
}

let isConnected = false;
let pendingRoom = null; // { roomId, resuming } while a join or resume request is in flight
let waitingFor = [];
let serverClockOffsetMs = 0;

function enterRoomFromUrl() {
    const roomId = roomInUrl();
    if (!roomId) {
        connection.send(CLIENT_MESSAGES.LIST_ROOMS);
        return;
    }
    const token = sessionStorage.getItem(seatTokenKey(roomId));
    pendingRoom = { roomId, resuming: token !== null };
    if (token) connection.send(CLIENT_MESSAGES.RESUME_SEAT, { roomId, token });
    else lobby.joinRoom(roomId);
}

// Shown over the table during a round: our own lost connection, or a held seat's countdown.
function updateBanner() {
    let banner = null;
    if (tableView && !isConnected) {
        banner = 'Connection lost — reconnecting…';
    } else if (tableView && waitingFor.length > 0) {
        const serverNow = Date.now() - serverClockOffsetMs;
        const deadline = Math.min(...waitingFor.map((seat) => seat.reconnectDeadline));
        const seconds = Math.max(0, Math.ceil((deadline - serverNow) / 1000));
        const names = waitingFor.map((seat) => seat.name).join(', ');
        banner = `Waiting for ${names} to reconnect… ${seconds}s`;
    }
    renderer?.setBanner(banner);
}
setInterval(updateBanner, 500);

const connection = connectToServer({
    onStatus(state) {
        isConnected = state === 'open';
        lobby.setConnected(isConnected);
        if (state === 'connecting') connectionStatus.textContent = 'Connecting to server…';
        if (state === 'open') {
            connectionStatus.textContent = 'Connected';
            enterRoomFromUrl();
        }
        if (state === 'closed') {
            connectionStatus.textContent = 'Connection lost. Reconnecting…';
            controls.cancelPending();
        }
        updateBanner();
    },
    onMessage({ type, payload }) {
        if (samplePreview) return;
        if (type === SERVER_MESSAGES.ROOM_LIST) {
            // Other rooms' changes can arrive while a join or resume is pending.
            if (!pendingRoom && roomInUrl()) {
                sessionStorage.removeItem(seatTokenKey(roomInUrl()));
                setRoomInUrl(null);
            }
            lobby.showRoomList(payload.rooms);
            clearRound();
        } else if (type === SERVER_MESSAGES.ROOM_STATE) {
            pendingRoom = null;
            sessionStorage.setItem(seatTokenKey(payload.roomId), payload.token);
            setRoomInUrl(payload.roomId);
            lobby.showRoomState(payload, window.location.href);
            if (payload.notice) lobby.showMessage(payload.notice);
            if (!payload.roundId) clearRound();
        } else if (type === SERVER_MESSAGES.SNAPSHOT) {
            showSnapshot(payload);
        } else if (type === SERVER_MESSAGES.ACTION_RESULT) {
            controls.handleResult(payload);
        } else if (type === SERVER_MESSAGES.ERROR) {
            connectionStatus.textContent = `Server error: ${payload.reason}`;
            if (pendingRoom?.resuming) {
                // The seat is gone (the hold expired or the room reset); try an ordinary join.
                sessionStorage.removeItem(seatTokenKey(pendingRoom.roomId));
                pendingRoom.resuming = false;
                lobby.joinRoom(pendingRoom.roomId);
            } else if (pendingRoom) {
                lobby.showMessage(`Could not join room ${pendingRoom.roomId}: ${payload.reason}`);
                pendingRoom = null;
                connection.send(CLIENT_MESSAGES.LIST_ROOMS);
            } else {
                lobby.showMessage(payload.reason);
            }
        }
    },
});

try {
    renderer = await initializeRenderer(canvas);
    // A snapshot can arrive while the artwork is still loading.
    renderer.setView(tableView);
    renderer.setMenu(lobby.menuState());
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
