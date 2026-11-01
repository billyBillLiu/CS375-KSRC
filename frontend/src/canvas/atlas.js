export const tiles = {
    '1WAN': {
        hand: { sx: 0, sy: 32, sw: 20, sh: 31 },
    },
};

export const backs = {
    north: { sx: 137, sy: 482, sw: 14, sh: 25 },
};

export function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Could not load ${source}`));
        image.src = source;
    });
}

export function loadAtlas() {
    return loadImage(`${import.meta.env.BASE_URL}assets/tile_sheet.png`);
}

// Positions and crop sizes use logical pixels, with the tile centered at x/y.
export function drawSprite(context, image, crop, x, y) {
    const { sx, sy, sw, sh } = crop;
    context.drawImage(image, sx, sy, sw, sh, x - sw / 2, y - sh / 2, sw, sh);
}
