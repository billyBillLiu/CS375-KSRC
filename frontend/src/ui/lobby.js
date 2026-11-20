import { CLIENT_MESSAGES, MAX_NAME_LENGTH } from '../../../shared/protocol.js';
import { findMenuItemAt, isFocusable, layoutMenu } from '../canvas/menu.js';

const NAME_STORAGE_KEY = 'mahjong-player-name';

// Lobby state for the Canvas menu (home, join and room screens). Typing goes to
// visually hidden inputs so native keyboards, IME and autofill still work.
// Every screen is redrawn from the latest server message, so all windows agree.
export function createLobby({ canvas, nameInput, codeInput, send, onChange }) {
    const state = {
        visible: true,
        screen: 'home',
        connected: false,
        rooms: [],
        room: null,
        message: '',
        messageIsError: false,
        focusId: null,
        hoverId: null,
    };

    nameInput.maxLength = MAX_NAME_LENGTH;
    // The saved name lets an invite link join without retyping it.
    nameInput.value = localStorage.getItem(NAME_STORAGE_KEY) ?? '';
    nameInput.addEventListener('input', () => {
        localStorage.setItem(NAME_STORAGE_KEY, nameInput.value);
        update();
    });
    codeInput.addEventListener('input', update);

    const inputsByField = { name: nameInput, code: codeInput };

    function menuState() {
        return { ...state, name: nameInput.value, code: codeInput.value };
    }

    function currentItems() {
        return layoutMenu(menuState());
    }

    function update() {
        const focused = currentItems().find((item) => item.id === state.focusId);
        canvas.setAttribute('aria-label', focused
            ? `Mahjong lobby: ${focused.label ?? focused.placeholder}`
            : 'Mahjong lobby. Press Tab to move between buttons and Enter to choose.');
        onChange(state.visible ? menuState() : null);
    }

    function setMessage(message, isError = true) {
        state.message = message;
        state.messageIsError = isError;
    }

    function showScreen(screen) {
        state.screen = screen;
        setMessage('');
        setFocus(screen === 'join' ? 'code' : null);
    }

    function setFocus(id) {
        state.focusId = id;
        const input = inputsByField[id];
        if (input) input.focus({ preventScroll: true });
        else if (document.activeElement === nameInput || document.activeElement === codeInput) {
            document.activeElement.blur();
        }
    }

    function joinRoom(roomId) {
        setMessage('');
        send(CLIENT_MESSAGES.JOIN_ROOM, { roomId, name: nameInput.value });
        update();
    }

    function activate(id) {
        if (id === 'name') return activate('create');
        if (id === 'code') return activate('joinCode');
        const item = currentItems().find((candidate) => candidate.id === id);
        if (!item || item.disabled) return;
        if (id === 'create') {
            setMessage('');
            send(CLIENT_MESSAGES.CREATE_ROOM, { name: nameInput.value });
        } else if (id === 'openJoin') {
            showScreen('join');
            send(CLIENT_MESSAGES.LIST_ROOMS);
        } else if (id === 'joinCode') {
            joinRoom(codeInput.value.trim());
        } else if (id.startsWith('room:')) {
            joinRoom(id.slice('room:'.length));
        } else if (id === 'back') {
            showScreen('home');
        } else if (id === 'ready') {
            send(CLIENT_MESSAGES.READY, { ready: state.room.seats[state.room.you]?.ready !== true });
        } else if (id === 'leave') {
            send(CLIENT_MESSAGES.LEAVE_ROOM);
        } else if (id === 'copyLink') {
            navigator.clipboard?.writeText(state.room.inviteUrl).then(
                () => setMessage('Invite link copied.', false),
                () => setMessage('Copy failed — use the address bar link.'),
            ).finally(update);
        }
        update();
    }

    function moveFocus(step) {
        const focusable = currentItems().filter(isFocusable);
        if (focusable.length === 0) return;
        const current = focusable.findIndex((item) => item.id === state.focusId);
        const next = current === -1 ? (step > 0 ? 0 : focusable.length - 1)
            : (current + step + focusable.length) % focusable.length;
        setFocus(focusable[next].id);
        update();
    }

    document.addEventListener('keydown', (event) => {
        if (!state.visible) return;
        if (event.key === 'Tab') {
            event.preventDefault();
            moveFocus(event.shiftKey ? -1 : 1);
        } else if (event.key === 'Enter' && state.focusId !== null) {
            event.preventDefault();
            activate(state.focusId);
        } else if (event.key === 'Escape' && state.screen === 'join') {
            showScreen('home');
            update();
        }
    });

    return {
        isVisible: () => state.visible,
        menuState: () => (state.visible ? menuState() : null),
        joinRoom,
        // Returns true when the click landed on the menu, which covers the whole table.
        click(x, y) {
            if (!state.visible) return false;
            const item = findMenuItemAt(currentItems(), x, y);
            setFocus(item?.id ?? null);
            if (item && item.type === 'button') activate(item.id);
            else update();
            return true;
        },
        // Returns true when the pointer is over a clickable item.
        hover(x, y) {
            if (!state.visible) return false;
            const id = findMenuItemAt(currentItems(), x, y)?.id ?? null;
            if (id !== state.hoverId) {
                state.hoverId = id;
                update();
            }
            return id !== null;
        },
        showRoomList(rooms) {
            state.rooms = rooms;
            state.visible = true;
            if (state.screen === 'room') showScreen('home');
            state.room = null;
            update();
        },
        // The menu hides while a round is in progress so the table is playable.
        showRoomState({ roomId, you, seats, roundId }, inviteUrl) {
            if (state.screen !== 'room') showScreen('room');
            state.room = { roomId, you, seats, inviteUrl };
            state.visible = !roundId;
            // A focused hidden input would swallow the game's arrow-key controls.
            if (!state.visible) setFocus(null);
            update();
        },
        showMessage(message, isError = true) {
            setMessage(message, isError);
            update();
        },
        // Blocks menu input while the socket is not open, so clicks are never silently dropped.
        setConnected(connected) {
            state.connected = connected;
            update();
        },
        hide() {
            state.visible = false;
            setFocus(null);
            update();
        },
    };
}
