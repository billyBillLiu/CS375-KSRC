const TABLE_WIDTH = 384;
const TABLE_HEIGHT = 216;

function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Could not load ${source}`));
        image.src = source;
    });
}

export async function initializeRenderer(canvas) {
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas rendering is unavailable.');
    }

    const [table, border] = await Promise.all([
        loadImage(`${import.meta.env.BASE_URL}assets/background_table.png`),
        loadImage(`${import.meta.env.BASE_URL}assets/background_border.png`),
    ]);

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
    }

    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    window.addEventListener('resize', draw);
    draw();

    return () => {
        resizeObserver.disconnect();
        window.removeEventListener('resize', draw);
    };
}
