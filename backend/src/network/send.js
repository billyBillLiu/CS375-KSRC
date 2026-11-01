export function send(socket, type, payload = {}) {
    socket.send(JSON.stringify({ type, payload }));
}
