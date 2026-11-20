import { drawSprite, tiles } from './atlas.js';
import { TABLE_HEIGHT, TABLE_WIDTH } from './layout.js';

// The lobby screens are drawn on the table in logical coordinates. layoutMenu
// is shared by drawing and hit testing, so a click always matches what is drawn.
const PANEL = { x: 72, y: 30, w: 240, h: 164 };
const MAX_LISTED_ROOMS = 4;

const COLORS = {
    wash: 'rgb(24 6 4 / 55%)',
    panel: '#4d1712',
    panelEdge: '#8a5a1e',
    gold: '#e8bd55',
    goldText: '#f6d47a',
    cream: '#f3e7c6',
    creamHighlight: '#fffaf0',
    disabledFace: '#a99f88',
    tileGreen: '#4e8a3c',
    tileGreenDark: '#2f5e27',
    ink: '#8c1c13',
    outline: '#2a140c',
    focus: '#ffd34d',
    fieldFill: '#2a0f0b',
    muted: '#c7b8a0',
    ready: '#9fdc9f',
    error: '#ffb59c',
};

function text(value, x, y, options = {}) {
    return { type: 'text', text: value, x, y, size: 6, align: 'center', color: COLORS.cream, ...options };
}

function button(id, label, x, y, w, h, disabled = false) {
    return { type: 'button', id, label, x, y, w, h, disabled };
}

function messageItem(menu, x, y) {
    if (!menu.connected) return text('Connecting to the server…', x, y, { color: COLORS.muted });
    if (!menu.message) return null;
    return text(menu.message, x, y, { color: menu.messageIsError ? COLORS.error : COLORS.ready, maxWidth: 220 });
}

function layoutHome(menu) {
    const offline = !menu.connected;
    return [
        { type: 'tile', identity: 'DRGN_RED', x: 104, y: 60, scale: 0.8 },
        { type: 'tile', identity: 'DRGN_GREEN', x: 280, y: 60, scale: 0.8 },
        text('Fuzhou Mahjong', 192, 60, { size: 15, color: COLORS.goldText, bold: true, shadow: true }),
        text('Four players · one table', 192, 73, { color: COLORS.muted }),
        text('Your name', 122, 85, { align: 'left', color: COLORS.muted }),
        { type: 'field', id: 'name', x: 122, y: 91, w: 140, h: 16, value: menu.name, placeholder: 'Player', disabled: offline },
        button('create', 'Create Game', 122, 115, 140, 20, offline),
        button('openJoin', 'Join Game', 122, 141, 140, 20, offline),
        messageItem(menu, 192, 180),
    ].filter(Boolean);
}

function layoutJoin(menu) {
    const offline = !menu.connected;
    const items = [
        text('Join a Game', 192, 48, { size: 12, color: COLORS.goldText, bold: true, shadow: true }),
        text('Room code', 96, 60, { align: 'left', color: COLORS.muted }),
        { type: 'field', id: 'code', x: 96, y: 66, w: 120, h: 16, value: menu.code, placeholder: 'e.g. 3', disabled: offline },
        button('joinCode', 'Join', 222, 66, 66, 16, offline || menu.code.trim() === ''),
        text('Open games', 96, 98, { align: 'left', color: COLORS.muted }),
    ];
    if (menu.rooms.length === 0) {
        items.push(text('No open games yet. Create one from the main menu.', 192, 120, { color: COLORS.muted }));
    }
    menu.rooms.slice(0, MAX_LISTED_ROOMS).forEach((room, index) => {
        const players = `${room.playerNames.length}/4`;
        const label = `Room ${room.id}  ·  ${players}  ·  ${room.isFull ? 'Full' : room.playerNames.join(', ')}`;
        items.push({ ...button(`room:${room.id}`, label, 96, 102 + index * 18, 192, 15, offline || room.isFull), small: true });
    });
    if (menu.rooms.length > MAX_LISTED_ROOMS) {
        items.push(text(`+${menu.rooms.length - MAX_LISTED_ROOMS} more — join by code`, 192, 178, { size: 5, color: COLORS.muted }));
    }
    items.push(button('back', 'Back', 96, 178, 60, 14));
    const message = messageItem(menu, 288, 187);
    if (message) items.push({ ...message, align: 'right', maxWidth: 125 });
    return items;
}

function layoutRoom(menu) {
    const { roomId, you, seats, inviteUrl } = menu.room;
    const offline = !menu.connected;
    const isReady = seats[you]?.ready === true;
    const readyCount = seats.filter((seat) => seat?.ready).length;
    const items = [
        text(`Room ${roomId}`, 192, 46, { size: 12, color: COLORS.goldText, bold: true, shadow: true }),
        text(`Invite link: ${inviteUrl}`, 192, 58, { size: 5, color: COLORS.muted, maxWidth: 224 }),
        { ...button('copyLink', 'Copy invite link', 152, 63, 80, 13, offline), small: true },
    ];
    seats.forEach((seat, index) => {
        items.push({ type: 'seat', x: 81 + index * 58, y: 84, w: 48, h: 58, seatNumber: index + 1, seat, isYou: index === you });
    });
    items.push(text(`${readyCount}/4 ready · the round starts when everyone is ready`, 192, 156, { color: COLORS.muted }));
    items.push(button('ready', isReady ? 'Not Ready' : 'Ready', 112, 165, 76, 18, offline));
    items.push(button('leave', 'Leave', 196, 165, 76, 18, offline));
    const message = messageItem(menu, 192, 191);
    if (message) items.push(message);
    return items;
}

// menu: { screen: 'home' | 'join' | 'room', connected, name, code, rooms, room, message, messageIsError, focusId, hoverId }
export function layoutMenu(menu) {
    if (menu.screen === 'room' && menu.room) return layoutRoom(menu);
    if (menu.screen === 'join') return layoutJoin(menu);
    return layoutHome(menu);
}

export function isFocusable(item) {
    return (item.type === 'button' || item.type === 'field') && !item.disabled;
}

export function findMenuItemAt(items, x, y) {
    return items.find((item) => isFocusable(item)
        && x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h) ?? null;
}

export function drawMenu(context, atlas, menu) {
    context.save();
    context.fillStyle = COLORS.wash;
    context.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    drawFrame(context, PANEL.x, PANEL.y, PANEL.w, PANEL.h, COLORS.panel, COLORS.gold);
    for (const item of layoutMenu(menu)) {
        const highlighted = item.id !== undefined && (item.id === menu.focusId || item.id === menu.hoverId);
        if (item.type === 'text') drawText(context, item);
        if (item.type === 'tile') drawTile(context, atlas, item.identity, item.x, item.y, item.scale);
        if (item.type === 'button') drawButton(context, item, highlighted);
        if (item.type === 'field') drawField(context, item, item.id === menu.focusId);
        if (item.type === 'seat') drawSeat(context, atlas, item);
    }
    context.restore();
}

// A gold double border like the table's trim.
function drawFrame(context, x, y, w, h, fill, edge) {
    context.fillStyle = edge;
    context.fillRect(x - 2, y - 2, w + 4, h + 4);
    context.fillStyle = COLORS.panelEdge;
    context.fillRect(x - 1, y - 1, w + 2, h + 2);
    context.fillStyle = fill;
    context.fillRect(x, y, w, h);
}

// Buttons look like face-up tiles: a cream face over the green tile back.
function drawButton(context, item, highlighted) {
    const { x, y, w, h, disabled } = item;
    const edge = 3;
    context.fillStyle = COLORS.outline;
    context.fillRect(x - 1, y - 1, w + 2, h + 2);
    context.fillStyle = disabled ? COLORS.tileGreenDark : COLORS.tileGreen;
    context.fillRect(x, y + h - edge, w, edge);
    context.fillStyle = disabled ? COLORS.disabledFace : COLORS.cream;
    context.fillRect(x, y, w, h - edge);
    if (!disabled) {
        context.fillStyle = COLORS.creamHighlight;
        context.fillRect(x + 1, y + 1, w - 2, 1);
    }
    if (highlighted) outline(context, x, y, w, h, COLORS.focus);
    drawText(context, {
        text: item.label,
        x: x + w / 2,
        y: y + (h - edge) / 2 + 0.5,
        size: item.small ? 6 : 8,
        bold: true,
        align: 'center',
        color: disabled ? '#6b6253' : COLORS.ink,
        maxWidth: w - 6,
    });
}

function drawField(context, item, focused) {
    const { x, y, w, h, value, placeholder, disabled } = item;
    context.fillStyle = focused ? COLORS.focus : COLORS.gold;
    context.fillRect(x - 1, y - 1, w + 2, h + 2);
    context.fillStyle = COLORS.fieldFill;
    context.fillRect(x, y, w, h);
    const shown = value || placeholder;
    drawText(context, {
        text: shown,
        x: x + 4,
        y: y + h / 2 + 0.5,
        size: 7,
        align: 'left',
        color: value && !disabled ? COLORS.cream : '#8a7a68',
        maxWidth: w - 8,
    });
    if (focused) {
        setFont(context, 7, false);
        const caretX = x + 4 + (value ? Math.min(context.measureText(value).width, w - 8) : 0) + 1;
        context.fillStyle = COLORS.cream;
        context.fillRect(caretX, y + 3, 0.75, h - 6);
    }
}

function drawSeat(context, atlas, { x, y, w, h, seatNumber, seat, isYou }) {
    drawFrame(context, x, y, w, h, seat ? '#5e2219' : '#3d120e', isYou ? COLORS.focus : COLORS.panelEdge);
    const centerX = x + w / 2;
    context.save();
    if (!seat) context.globalAlpha = 0.4;
    drawTile(context, atlas, `FLO_${seatNumber}`, centerX, y + 17, 0.75);
    context.restore();
    if (!seat) {
        drawText(context, text('Empty seat', centerX, y + 42, { color: COLORS.muted }));
        return;
    }
    drawText(context, text(isYou ? `${seat.name} (you)` : seat.name, centerX, y + 39, { bold: true, maxWidth: w - 4 }));
    drawText(context, text(seat.ready ? 'Ready' : 'Not ready', centerX, y + 49,
        { size: 5.5, color: seat.ready ? COLORS.ready : COLORS.muted }));
}

function drawTile(context, atlas, identity, x, y, scale) {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    drawSprite(context, atlas, tiles[identity].hand, 0, 0);
    context.restore();
}

function outline(context, x, y, w, h, color) {
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
}

function setFont(context, size, bold) {
    context.font = `${bold ? 'bold ' : ''}${size}px Georgia, 'Times New Roman', serif`;
}

function drawText(context, { text: value, x, y, size, align, color, bold = false, shadow = false, maxWidth }) {
    setFont(context, size, bold);
    context.textAlign = align;
    context.textBaseline = 'middle';
    const shown = maxWidth ? ellipsize(context, value, maxWidth) : value;
    if (shadow) {
        context.fillStyle = COLORS.outline;
        context.fillText(shown, x + 1, y + 1);
    }
    context.fillStyle = color;
    context.fillText(shown, x, y);
}

function ellipsize(context, value, maxWidth) {
    if (context.measureText(value).width <= maxWidth) return value;
    let shortened = value;
    while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
        shortened = shortened.slice(0, -1);
    }
    return `${shortened}…`;
}
