import './styles.css';
import { initializeRenderer } from './canvas/renderer.js';

const canvas = document.querySelector('#game');
const status = document.querySelector('.status');

try {
    await initializeRenderer(canvas);
    status.textContent = 'Table ready — lobby and gameplay coming next.';
} catch (error) {
    status.textContent = 'Unable to load the Mahjong table. Please reload to try again.';
    console.error(error);
}
