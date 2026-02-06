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
                update: resolve(__dirname, 'update/index.html'),
            },
        },
    },
    server: {
        open: true,
    },
});
