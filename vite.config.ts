import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Frontend lezy w ui/, wynik budowy w dist/ (stamtad bierze go Tauri).
// Dwie strony: index.html (edytor, okno 'main') i nakladka.html (okno 'nakladka').
export default defineConfig({
  root: 'ui',
  clearScreen: false,
  server: { host: '127.0.0.1', port: 5176, strictPort: true },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'ui/index.html'),
        nakladka: resolve(import.meta.dirname, 'ui/nakladka.html'),
      },
    },
  },
});
