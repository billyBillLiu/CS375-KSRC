import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the built frontend (frontend/dist) in production, where there is no Vite proxy.
const distDir = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
};

export async function serveStatic(request, response) {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    } catch {
        return false;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';

    const file = normalize(join(distDir, pathname));
    if (!file.startsWith(distDir + sep)) return false;

    try {
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
        response.end(body);
        return true;
    } catch {
        return false;
    }
}
