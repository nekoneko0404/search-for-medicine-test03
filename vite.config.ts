import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                search: resolve(__dirname, 'search.html'),
                hiyari: resolve(__dirname, 'hiyari_app/index.html'),
                infection: resolve(__dirname, 'infection-surveillance-app/index.html'),
                pollen: resolve(__dirname, 'pollen-app/index.html'),
                pakkun: resolve(__dirname, 'Okusuri_pakkun/index.html'),
                recipe: resolve(__dirname, 'recipe-app/index.html'),
                supply: resolve(__dirname, 'supply-status/index.html'),
                update: resolve(__dirname, 'update/index.html'),
            },
        },
    },
    server: {
        open: true,
        proxy: {
            '/hiyari-proxy': {
                target: 'https://hiyari-proxy-708146219355.asia-east1.run.app',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/hiyari-proxy/, ''),
            },
        },
    },
});
