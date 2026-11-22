export function createLeaderboard(root, resultRoot) {
    const message = root.querySelector('.leaderboard-status');
    const body = root.querySelector('tbody');
    const periodButtons = [...root.querySelectorAll('[data-period]')];
    const saveStatus = resultRoot.querySelector('.score-save-status');
    const checkButton = resultRoot.querySelector('.check-score');
    let period = 'daily';
    let requestNumber = 0;
    let roundId = null;
    let saveTimer = null;

    async function refresh() {
        const request = ++requestNumber;
        message.textContent = 'Loading scores…';
        periodButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.period === period)));
        try {
            const response = await fetch(`/api/leaderboard?period=${period}`);
            if (!response.ok) throw new Error('Leaderboard unavailable');
            const data = await response.json();
            if (request !== requestNumber) return;
            body.replaceChildren();
            for (const entry of data.entries) {
                const row = document.createElement('tr');
                for (const value of [entry.rank, entry.name, entry.score]) {
                    const cell = document.createElement('td');
                    cell.textContent = String(value);
                    row.append(cell);
                }
                body.append(row);
            }
            message.textContent = data.entries.length ? 'Best winning hand per player. Equal scores share a rank.'
                : 'No winning scores yet for this period.';
        } catch {
            if (request !== requestNumber) return;
            body.replaceChildren();
            message.textContent = 'Leaderboard unavailable. Use Refresh to try again.';
        }
    }

    async function checkSaved(attempt = 0) {
        clearTimeout(saveTimer);
        const checkedRound = roundId;
        if (!checkedRound) return;
        try {
            const response = await fetch(`/api/score-status?roundId=${encodeURIComponent(checkedRound)}`);
            if (!response.ok) throw new Error('Status unavailable');
            const { saved } = await response.json();
            if (roundId !== checkedRound) return;
            if (saved) {
                saveStatus.textContent = 'Winning score saved.';
                checkButton.hidden = true;
                refresh();
                return;
            }
            saveStatus.textContent = 'Score not saved yet. The server will retry while it is running.';
        } catch {
            if (roundId !== checkedRound) return;
            saveStatus.textContent = 'Could not confirm that the score was saved.';
        }
        checkButton.hidden = false;
        if (attempt < 4) saveTimer = setTimeout(() => checkSaved(attempt + 1), 1500);
    }

    for (const button of periodButtons) {
        button.addEventListener('click', () => { period = button.dataset.period; refresh(); });
    }
    root.querySelector('.refresh-leaderboard').addEventListener('click', refresh);
    checkButton.addEventListener('click', () => checkSaved());
    refresh();

    return {
        showResult(snapshot) {
            if (snapshot.phase !== 'over') {
                this.clear();
                return;
            }
            resultRoot.hidden = false;
            const score = snapshot.score;
            resultRoot.querySelector('.score-heading').textContent = score
                ? `Seat ${snapshot.winner}${snapshot.you === snapshot.winner ? ' (you)' : ''} wins — ${score.total} points`
                : snapshot.endReason === 'wall_exhausted' ? 'Wall exhausted — no score awarded' : 'Round ended — no score awarded';
            resultRoot.querySelector('.score-breakdown').textContent = score
                ? `${score.runs} runs × 1 + ${score.triplets} triplets × 2 + ${score.kongs} Kongs × 4 = ${score.basePoints}. `
                    + `${score.specials} specials: ×${score.specialMultiplier}. `
                    + `${score.winMultiplier === 2 ? 'Self-draw' : 'Discard win'}: ×${score.winMultiplier}. Only the winner scores.`
                : '';
            resultRoot.querySelector('.winning-hand').textContent = snapshot.revealedWinnerHand
                ? `Winning concealed hand: ${snapshot.revealedWinnerHand.map((tile) => tile.tileId).join(', ')}` : '';
            if (score && roundId !== snapshot.roundId) {
                clearTimeout(saveTimer);
                roundId = snapshot.roundId;
                saveStatus.textContent = 'Saving winning score…';
                checkButton.hidden = true;
                checkSaved();
            }
        },
        clear() {
            roundId = null;
            clearTimeout(saveTimer);
            resultRoot.hidden = true;
            saveStatus.textContent = '';
            checkButton.hidden = true;
        },
    };
}
