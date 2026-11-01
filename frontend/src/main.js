import './styles.css';
import { CLIENT_MESSAGES, SERVER_MESSAGES } from '../../shared/protocol.js';
import { initializeRenderer } from './canvas/renderer.js';
import { connectToServer } from './network/client.js';

const canvas = document.querySelector('#game');
const status = document.querySelector('.status');
const connectionStatus = document.querySelector('.connection-status');

const connection = connectToServer({
    onStatus(state) {
        if (state === 'connecting') connectionStatus.textContent = 'Connecting to server…';
        if (state === 'open') connection.send(CLIENT_MESSAGES.LIST_ROOMS);
        if (state === 'closed') connectionStatus.textContent = 'Connection lost. Reload the page to reconnect.';
    },
    onMessage({ type, payload }) {
        if (type === SERVER_MESSAGES.ROOM_LIST) {
            connectionStatus.textContent = `Connected · ${payload.rooms.length} room(s) open`;
        } else if (type === SERVER_MESSAGES.ERROR) {
            connectionStatus.textContent = `Server error: ${payload.reason}`;
        }
    },
});

try {
    await initializeRenderer(canvas);
    status.textContent = 'Table ready — lobby and gameplay coming next.';
} catch (error) {
    status.textContent = 'Unable to load the Mahjong table. Please reload to try again.';
    console.error(error);
}
