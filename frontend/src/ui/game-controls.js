import { ACTION_KINDS, CLIENT_MESSAGES } from '../../../shared/protocol.js';

// Action buttons and tile selection. Buttons follow the server's legalActions;
// tiles only move when a new snapshot arrives, never when a button is clicked.
export function createGameControls(root, { send, onSelectionChange }) {
    const buttons = Object.fromEntries(ACTION_KINDS.map((kind) => [kind, root.querySelector(`[data-action="${kind}"]`)]));
    const selectedText = root.querySelector('.selected-tile');
    const actionStatus = root.querySelector('.action-status');
    let view = null;
    let selectedTileId = null;
    let pendingRequestId = null;
    let nextRequest = 0;

    for (const [kind, button] of Object.entries(buttons)) {
        button.addEventListener('click', () => act(kind));
    }

    document.addEventListener('keydown', (event) => {
        if (!view || root.hidden || event.target.closest?.('input, textarea, button, select')) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            moveSelection(event.key === 'ArrowLeft' ? -1 : 1);
        } else if (event.key === 'Enter' && view.legalActions.discard) {
            event.preventDefault();
            act('discard');
        }
    });

    function act(kind) {
        if (!view || pendingRequestId !== null || !view.legalActions[kind]) return;
        const payload = { requestId: `${Date.now().toString(36)}-${nextRequest++}`, roundId: view.roundId, kind };
        if (kind === 'discard') {
            if (selectedTileId === null) return;
            payload.tileId = selectedTileId;
        }
        if (kind === 'claim' || kind === 'pass') {
            payload.windowId = view.phase === 'claims' ? view.claimWindowId : view.retainedChi?.windowId;
        }
        if (!send(CLIENT_MESSAGES.ACTION, payload)) {
            actionStatus.textContent = 'Not connected to the server.';
            return;
        }
        pendingRequestId = payload.requestId;
        actionStatus.textContent = '';
        render();
    }

    function moveSelection(step) {
        const hand = view.ownHand;
        if (hand.length === 0) return;
        const current = hand.findIndex((tile) => tile.id === selectedTileId);
        const next = current === -1 ? (step > 0 ? 0 : hand.length - 1)
            : (current + step + hand.length) % hand.length;
        select(hand[next].id);
    }

    function select(tileId) {
        if (!view?.ownHand.some((tile) => tile.id === tileId)) return;
        selectedTileId = tileId;
        render();
        onSelectionChange(selectedTileId);
    }

    function render() {
        const legal = view?.legalActions ?? {};
        for (const [kind, button] of Object.entries(buttons)) {
            button.disabled = pendingRequestId !== null || !legal[kind]
                || (kind === 'discard' && selectedTileId === null);
        }
        buttons.claim.textContent = legal.claim ? `Claim (${legal.claim})` : 'Claim';
        const selected = view?.ownHand.find((tile) => tile.id === selectedTileId);
        selectedText.textContent = selected
            ? `Selected: ${selected.identity}${selected.identity === view.goldIndicator?.identity ? ' (Gold)' : ''}`
            : 'Click a tile in your hand, or use ← and →, to select it.';
    }

    return {
        setView(nextView) {
            if (view?.roundId !== nextView.roundId) {
                selectedTileId = null;
                actionStatus.textContent = '';
            }
            view = nextView;
            if (!view.ownHand.some((tile) => tile.id === selectedTileId)) selectedTileId = null;
            root.hidden = false;
            render();
            return selectedTileId;
        },
        handleResult({ requestId, accepted, reason }) {
            if (requestId !== pendingRequestId) return;
            pendingRequestId = null;
            actionStatus.textContent = accepted ? '' : `Not allowed: ${reason}`;
            render();
        },
        select,
        clear() {
            view = null;
            selectedTileId = null;
            pendingRequestId = null;
            actionStatus.textContent = '';
            root.hidden = true;
        },
    };
}
