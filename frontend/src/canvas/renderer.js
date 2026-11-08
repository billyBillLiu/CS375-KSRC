import { backs, drawSprite, loadAtlas, loadImage, tiles } from './atlas.js';

import { layoutPlayerHand, layoutDiscards, SPECIAL_CAPACITY, TABLE_WIDTH, TABLE_HEIGHT } from './layout.js';

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
                const melds = player.melds ?? [];
                const positions = layoutPlayerHand(player.seat, view.viewerSeat, player.concealedCount, melds);
                positions.forEach(({ x, y, scale, direction, tileIndex, meldIndex }) => {
                    const isMeld = meldIndex !== null;
                    const tile = isMeld ? melds[meldIndex].tiles[tileIndex] : view.ownHand[tileIndex];
                    const sprite = isMeld ? tiles[tile.identity].revealed[direction]
                        : isLocal ? tiles[tile.identity].hand : backs[direction];
                    context.save();
                    context.translate(x, y);
                    context.scale(scale, scale);
                    drawSprite(context, atlas, sprite, 0, 0);
                    context.restore();
                });
                const discards = player.discards ?? [];
                layoutDiscards(player.seat, view.viewerSeat, discards.length).forEach(({ x, y }, index) => {
                    drawScaled(tiles[discards[index].identity].discardLeft, x, y, 0.7);
                });
                if (isLocal) {
                    (player.specials ?? []).slice(0, SPECIAL_CAPACITY).forEach((tile, index) => {
                        drawScaled(tiles[tile.identity].revealed.south, 12 + index * 9, 199, 0.4);
                    });
                }

            }
            if (view.goldIndicator) {
                drawScaled(tiles[view.goldIndicator.identity].gold, 139.5, 97, 1);
                label('GOLD', 139.5, 119);
            }
            if (view.pendingDiscard) {
                drawScaled(tiles[view.pendingDiscard.tile.identity].current, 192, 142, 0.88);
                label(`Seat ${view.pendingDiscard.seat} discard`, 192, 119);
            }
        }
    }

    function drawScaled(sprite, x, y, scale) {
        context.save();
        context.translate(x, y);
        context.scale(scale, scale);
        drawSprite(context, atlas, sprite, 0, 0);
        context.restore();
    }

    function label(text, x, y) {
        context.font = '5px sans-serif';
        context.textAlign = 'center';
        context.fillStyle = '#fff4cb';
        context.fillText(text, x, y);
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
