import { CLIENT_MESSAGES, MAX_NAME_LENGTH, SEAT_COUNT } from '../../../shared/protocol.js';

// Room list before joining; seats with Ready/Leave after joining. Every view is
// redrawn from the latest server message, so all windows show the same membership.
export function createLobby(root, send) {
    const roomListView = root.querySelector('.lobby-rooms');
    const roomView = root.querySelector('.lobby-room');
    const nameInput = root.querySelector('#player-name');
    const roomList = root.querySelector('#room-list');
    const roomTitle = root.querySelector('#room-title');
    const seatList = root.querySelector('#seat-list');
    const readyStatus = root.querySelector('#ready-status');
    const readyButton = root.querySelector('#ready-toggle');
    let isReady = false;

    nameInput.maxLength = MAX_NAME_LENGTH;

    root.querySelector('.lobby-create').addEventListener('submit', (event) => {
        event.preventDefault();
        send(CLIENT_MESSAGES.CREATE_ROOM, { name: nameInput.value });
    });
    readyButton.addEventListener('click', () => send(CLIENT_MESSAGES.READY, { ready: !isReady }));
    root.querySelector('#leave-room').addEventListener('click', () => send(CLIENT_MESSAGES.LEAVE_ROOM));

    function roomListItem(room) {
        const item = document.createElement('li');
        const label = document.createElement('span');
        const names = room.playerNames.join(', ');
        label.textContent = `Room ${room.id} · ${room.playerNames.length}/${SEAT_COUNT} · ${names}`;

        const joinButton = document.createElement('button');
        joinButton.type = 'button';
        joinButton.textContent = room.isFull ? 'Full' : 'Join';
        joinButton.disabled = room.isFull;
        joinButton.addEventListener('click', () => {
            send(CLIENT_MESSAGES.JOIN_ROOM, { roomId: room.id, name: nameInput.value });
        });

        item.append(label, joinButton);
        return item;
    }

    function showRoomList(rooms) {
        roomListView.hidden = false;
        roomView.hidden = true;
        if (rooms.length === 0) {
            const empty = document.createElement('li');
            empty.textContent = 'No open rooms yet. Create one to start.';
            roomList.replaceChildren(empty);
        } else {
            roomList.replaceChildren(...rooms.map(roomListItem));
        }
    }

    function showRoomState({ roomId, you, seats }) {
        roomListView.hidden = true;
        roomView.hidden = false;
        roomTitle.textContent = `Room ${roomId}`;

        isReady = seats[you]?.ready === true;
        readyButton.textContent = isReady ? 'Not ready' : 'Ready';
        readyButton.setAttribute('aria-pressed', String(isReady));

        seatList.replaceChildren(...seats.map((seat, index) => {
            const item = document.createElement('li');
            if (!seat) {
                item.textContent = 'Empty seat';
                item.className = 'seat-empty';
            } else {
                const youLabel = index === you ? ' (you)' : '';
                item.textContent = `${seat.name}${youLabel} — ${seat.ready ? 'Ready' : 'Not ready'}`;
                if (seat.ready) item.className = 'seat-ready';
            }
            return item;
        }));

        const readyCount = seats.filter((seat) => seat?.ready).length;
        // Starting a round is implemented in M18; this only reports readiness.
        readyStatus.textContent = readyCount === SEAT_COUNT
            ? 'All four players are ready.'
            : `${readyCount}/${SEAT_COUNT} ready. Starting a round is not available yet.`;
    }

    // Blocks lobby input while the socket is not open, so clicks are never silently dropped.
    function setConnected(connected) {
        root.inert = !connected;
    }

    return { showRoomList, showRoomState, setConnected };
}
