import { createMessage, parseMessage } from '../../../shared/protocol.js';

// Opens the /ws connection. onStatus receives 'connecting', 'open' or 'closed'.
export function connectToServer({ onMessage, onStatus }) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    onStatus('connecting');

    socket.addEventListener('open', () => onStatus('open'));
    socket.addEventListener('close', () => onStatus('closed'));
    socket.addEventListener('message', (event) => {
        const message = parseMessage(event.data);
        if (!message) {
            console.warn('Ignored a malformed server message:', event.data);
            return;
        }
        onMessage(message);
    });

    return {
        send(type, payload) {
            if (socket.readyState !== WebSocket.OPEN) return false;
            socket.send(createMessage(type, payload));
            return true;
        },
    };
}
