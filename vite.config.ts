import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

// Wiki JSON does not send Access-Control-Allow-Origin — same fix as digimon-hub.
const wikiProxy = {
  '/api/wiki': {
    target: 'https://thedigitalodyssey.com',
    changeOrigin: true,
    secure: true,
  },
} as const

export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

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
          onstart({ startup }) {
            startup()
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: Object.keys(pkg.dependencies ?? {}),
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
                external: Object.keys(pkg.dependencies ?? {}),
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
  }
})
