import { CLIENT_MESSAGES, SERVER_MESSAGES, createMessage, parseMessage } from '../../../shared/protocol.js';

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

// Opens the /ws connection and reopens it after drops, backing off up to 4 seconds.
// onStatus receives 'connecting', 'open' or 'closed' each time the state changes.
export function connectToServer({ onMessage, onStatus }) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    let socket = null;
    let failedAttempts = 0;

    function open() {
        onStatus('connecting');
        socket = new WebSocket(`${protocol}://${location.host}/ws`);
        socket.addEventListener('open', () => {
            socket.send(createMessage(CLIENT_MESSAGES.IDENTIFY, {
                token: sessionStorage.getItem('mahjong-player-token'),
            }));
        });
        socket.addEventListener('close', () => {
            onStatus('closed');
            const delay = RETRY_DELAYS_MS[Math.min(failedAttempts, RETRY_DELAYS_MS.length - 1)];
            failedAttempts += 1;
            setTimeout(open, delay);
        });
        socket.addEventListener('message', (event) => {
            const message = parseMessage(event.data);
            if (!message) {
                console.warn('Ignored a malformed server message:', event.data);
                return;
            }
            if (message.type === SERVER_MESSAGES.PLAYER_SESSION) {
                sessionStorage.setItem('mahjong-player-token', message.payload.token);
                failedAttempts = 0;
                onStatus('open');
                return;
            }
            onMessage(message);
        });
    }

    open();

    return {
        send(type, payload) {
            if (socket.readyState !== WebSocket.OPEN) return false;
            socket.send(createMessage(type, payload));
            return true;
        },
    };
}
