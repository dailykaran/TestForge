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
              external: [
                // Native modules
                'uiohook-napi',
                'screenshot-desktop',
                'electron',
                'keytar',
                // SDK packages
                '@anthropic-ai/sdk',
                '@google/genai',
                // Node.js built-in modules
                'fs',
                'path',
                'uuid',
                'child_process',
                'os',
                'util',
                'stream',
                'buffer',
                'zlib',
                'http',
                'https'
              ],
              output: {
                format: 'es'
              }
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
        vite: {
          build: {
            lib: {
              entry: 'electron/preload.ts',
              name: 'preload',
              formats: ['cjs']
            },
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].js'
              }
            },
            target: 'esnext',
            minify: false,
          }
        }
      },
    ]),
  ],
});
