import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const target = `http://127.0.0.1:${env.PORT || 3001}`;
    return {
        root: fileURLToPath(new URL('.', import.meta.url)),
        server: {
            host: '127.0.0.1',
            port: 5173,
            strictPort: true,
            proxy: { '/api': target, '/ws': { target, ws: true } },
        },
        build: { outDir: 'dist', emptyOutDir: true },
    };
});
