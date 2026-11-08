import { backs, drawSprite, loadAtlas, loadImage, tiles } from './atlas.js';

import { layoutHand, TABLE_WIDTH, TABLE_HEIGHT } from './layout.js';

export async function initializeRenderer(canvas) {
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas rendering is unavailable.');
    }

    const [table, border, atlas] = await Promise.all([
        loadImage(`${import.meta.env.BASE_URL}assets/background_table.png`),
        loadImage(`${import.meta.env.BASE_URL}assets/background_border.png`),
        loadAtlas(),
    ]);

    let view = null;

    function draw() {
        const { width, height } = canvas.getBoundingClientRect();
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(width * pixelRatio));
        canvas.height = Math.max(1, Math.round(height * pixelRatio));
        context.setTransform(canvas.width / TABLE_WIDTH, 0, 0,
            canvas.height / TABLE_HEIGHT, 0, 0);
        context.imageSmoothingEnabled = false;
        context.drawImage(table, 0, 0, TABLE_WIDTH, TABLE_HEIGHT);
        context.drawImage(border, 0, 0, TABLE_WIDTH, TABLE_HEIGHT);
        if (view) {
            for (const player of view.players) {
                const isLocal = player.seat === view.viewerSeat;
                const positions = layoutHand(player.seat, view.viewerSeat, player.concealedCount);
                positions.forEach(({ x, y, direction }, index) => {
                    const sprite = isLocal ? tiles[view.ownHand[index].identity].hand : backs[direction];
                    drawSprite(context, atlas, sprite, x, y);
                });
            }
        }
    }

    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    window.addEventListener('resize', draw);
    draw();

    return {
        setView(nextView) {
            view = nextView;
            draw();
        },
        destroy() {
            resizeObserver.disconnect();
            window.removeEventListener('resize', draw);
        },
    };
}
