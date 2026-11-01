import { S2C } from '../../../shared/protocol.js';
import { send } from '../network/send.js';

const SEATS = 4;

// Thrown for anything the player did wrong; the message is sent back as an error.
export class GameError extends Error {}

export class Room {
    constructor(id, { engine, turnMs, autoMs, random }) {
        this.id = id;
        this.engine = engine;
        this.turnMs = turnMs;
        this.autoMs = autoMs;
        this.random = random;
        this.seats = Array(SEATS).fill(null);
        // A seat is away once its player leaves mid-game or misses the reconnect window;
        // the server then discards for it quickly.
        this.away = Array(SEATS).fill(false);
        this.phase = 'waiting';
        this.state = null;
        this.result = null;
        this.timer = null;
        this.turnDeadline = null;
    }

    seatOf(player) {
        return this.seats.indexOf(player);
    }

    isMember(player) {
        return Boolean(player) && player.gameId === this.id;
    }

    hasMembers() {
        return this.seats.some((player) => this.isMember(player));
    }

    summary() {
        return {
            id: this.id,
            players: this.seats.filter(Boolean).map((player) => player.name),
            seatsOpen: this.seats.filter((player) => player === null).length,
        };
    }

    join(player) {
        if (this.phase !== 'waiting') throw new GameError('game already started');
        const seat = this.seats.indexOf(null);
        if (seat === -1) throw new GameError('game is full');
        this.seats[seat] = player;
        player.gameId = this.id;
        if (this.seats.includes(null)) this.broadcast();
        else this.start();
    }

    leave(player) {
        const seat = this.seatOf(player);
        if (seat === -1) return;
        player.gameId = null;
        if (this.phase === 'playing') {
            this.away[seat] = true;
            if (seat === this.state.currentTurn) this.schedule();
        } else {
            this.seats[seat] = null;
        }
        this.broadcast();
    }

    start() {
        this.phase = 'playing';
        const dealer = Math.floor(this.random() * SEATS);
        this.state = this.engine.newRound({ dealer, random: this.random });
        // The dealer already holds the extra tile, so the first turn starts at the discard.
        this.schedule();
        this.broadcast();
    }

    discard(player, tile) {
        if (this.phase !== 'playing') throw new GameError('game is not in progress');
        const seat = this.seatOf(player);
        if (!Number.isInteger(tile) || !this.engine.canDiscard(this.state, seat, tile)) {
            throw new GameError('illegal discard');
        }
        this.applyDiscard(seat, tile);
    }

    // Turn timer ran out: discard the tile just drawn, or the last tile in hand.
    autoDiscard() {
        const seat = this.state.currentTurn;
        const hand = this.state.hands[seat];
        this.applyDiscard(seat, this.state.lastDrawn ?? hand[hand.length - 1]);
    }

    applyDiscard(seat, tile) {
        clearTimeout(this.timer);
        this.engine.discard(this.state, seat, tile);
        // TODO: Open a claim window here once the engine supports chi/peng/kong/win.
        if (this.engine.draw(this.state) === null) {
            this.finish({ winner: null, reason: 'wall empty' });
            return;
        }
        this.schedule();
        this.broadcast();
    }

    schedule() {
        clearTimeout(this.timer);
        const ms = this.away[this.state.currentTurn] ? this.autoMs : this.turnMs;
        this.turnDeadline = Date.now() + ms;
        this.timer = setTimeout(() => this.autoDiscard(), ms);
    }

    finish(result) {
        this.close();
        this.phase = 'over';
        this.result = result;
        this.broadcast();
        this.seats.forEach((player) => {
            if (this.isMember(player) && player.socket) send(player.socket, S2C.GAME_OVER, result);
        });
    }

    close() {
        clearTimeout(this.timer);
        this.timer = null;
        this.turnDeadline = null;
    }

    broadcast() {
        this.seats.forEach((player, seat) => {
            if (this.isMember(player) && player.socket) send(player.socket, S2C.GAME_STATE, this.viewFor(seat));
        });
    }

    // Only the viewer's own hand is included; everyone else is a tile count.
    viewFor(seat) {
        const state = this.state;
        return {
            gameId: this.id,
            phase: this.phase,
            seat,
            hand: state ? [...state.hands[seat]].sort((a, b) => a - b) : [],
            lastDrawn: state && state.currentTurn === seat ? state.lastDrawn : null,
            players: this.seats.map((player, i) => ({
                seat: i,
                name: player?.name ?? null,
                connected: this.isMember(player) && Boolean(player.socket),
                away: this.away[i],
                handCount: state ? state.hands[i].length : 0,
                discards: state ? [...state.discards[i]] : [],
            })),
            wallCount: state ? state.wall.length : null,
            dealer: state?.dealer ?? null,
            currentTurn: this.phase === 'playing' ? state.currentTurn : null,
            turnDeadline: this.turnDeadline,
            result: this.result,
        };
    }
}
