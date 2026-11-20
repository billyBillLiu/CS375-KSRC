import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMenuItemAt, isFocusable, layoutMenu } from '../src/canvas/menu.js';
import { TABLE_HEIGHT, TABLE_WIDTH } from '../src/canvas/layout.js';

const baseMenu = { screen: 'home', connected: true, name: '', code: '', rooms: [], room: null, message: '' };
const center = (item) => [item.x + item.w / 2, item.y + item.h / 2];

test('clicking the centre of each menu button hits that button on every screen', () => {
    const room = { roomId: '3', you: 1, inviteUrl: 'http://x/?room=3', seats: [{ name: 'A', ready: true }, { name: 'B', ready: false }, null, null] };
    const rooms = [{ id: '3', playerNames: ['A'], isFull: false }, { id: '4', playerNames: ['A', 'B', 'C', 'D'], isFull: true }];
    for (const menu of [baseMenu, { ...baseMenu, screen: 'join', code: '3', rooms }, { ...baseMenu, screen: 'room', room }]) {
        const items = layoutMenu(menu);
        for (const item of items.filter(isFocusable)) {
            assert.equal(findMenuItemAt(items, ...center(item))?.id, item.id);
            assert.ok(item.x >= 0 && item.x + item.w <= TABLE_WIDTH && item.y >= 0 && item.y + item.h <= TABLE_HEIGHT);
        }
    }
});

test('menu controls are disabled while disconnected and full rooms cannot be joined', () => {
    const offline = layoutMenu({ ...baseMenu, connected: false });
    assert.equal(offline.filter(isFocusable).length, 0);
    const join = layoutMenu({ ...baseMenu, screen: 'join', rooms: [{ id: '4', playerNames: ['A', 'B', 'C', 'D'], isFull: true }] });
    const fullRoom = join.find((item) => item.id === 'room:4');
    assert.equal(findMenuItemAt(join, ...center(fullRoom)), null);
    assert.equal(join.find((item) => item.id === 'joinCode').disabled, true);
});
