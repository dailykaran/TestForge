import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig({
  plugins: [
    react(),
    electron([
      { 
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['uiohook-napi', 'screenshot-desktop', 'electron', 'fs', 'path', 'uuid']
            },
            target: 'esnext',
            minify: false,
          },
          resolve: {
            alias: {
              '@': '/src',
            },
          }
        }
      },
      { 
        entry: 'electron/preload.ts',
        onstart: (options) => options.reload(),
      },
    ]),
  ],
});
