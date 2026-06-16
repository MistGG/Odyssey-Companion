import { rmSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import pkg from './package.json';
// Wiki JSON does not send Access-Control-Allow-Origin — same fix as digimon-hub.
var wikiProxy = {
    '/api/wiki': {
        target: 'https://thedigitalodyssey.com',
        changeOrigin: true,
        secure: true,
    },
    '/api/market': {
        target: 'https://thedigitalodyssey.com',
        changeOrigin: true,
        secure: true,
    },
    '/api/raid-timer': {
        target: 'https://thedigitalodyssey.com',
        changeOrigin: true,
        secure: true,
    },
};
export default defineConfig(function (_a) {
    var _b, _c;
    var command = _a.command;
    rmSync('dist-electron', { recursive: true, force: true });
    var isServe = command === 'serve';
    var isBuild = command === 'build';
    var sourcemap = isServe || !!process.env.VSCODE_DEBUG;
    return {
        resolve: {
            alias: {
                '@': path.join(__dirname, 'src'),
            },
        },
        server: {
            proxy: wikiProxy,
        },
        preview: {
            proxy: wikiProxy,
        },
        plugins: [
            react(),
            electron({
                main: {
                    entry: 'electron/main/index.ts',
                    onstart: function (_a) {
                        var startup = _a.startup;
                        startup();
                    },
                    vite: {
                        build: {
                            sourcemap: sourcemap,
                            minify: isBuild,
                            outDir: 'dist-electron/main',
                            rollupOptions: {
                                external: Object.keys((_b = pkg.dependencies) !== null && _b !== void 0 ? _b : {}),
                            },
                        },
                    },
                },
                preload: {
                    input: 'electron/preload/index.ts',
                    vite: {
                        build: {
                            sourcemap: sourcemap ? 'inline' : undefined,
                            minify: isBuild,
                            outDir: 'dist-electron/preload',
                            rollupOptions: {
                                external: Object.keys((_c = pkg.dependencies) !== null && _c !== void 0 ? _c : {}),
                                output: {
                                    // package.json has "type":"module" → plugin emits .mjs but Rollup format is CJS (`require`).
                                    // Electron loads .mjs as ESM where `require` is undefined — preload never exposes `odysseyCompanion`.
                                    entryFileNames: 'index.cjs',
                                    chunkFileNames: '[name].cjs',
                                },
                            },
                        },
                    },
                },
                renderer: {},
            }),
        ],
        clearScreen: false,
    };
});
