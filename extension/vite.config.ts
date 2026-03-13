import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpSync } from 'fs';
import { build as viteBuild } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Plugin to build background and content as separate IIFE bundles after the main build
function buildExtensionScripts() {
  return {
    name: 'build-extension-scripts',
    async closeBundle() {
      // Copy static files
      cpSync(resolve(__dirname, 'static'), resolve(__dirname, 'dist'), {
        recursive: true,
      });

      // Build background.js as IIFE
      await viteBuild({
        configFile: false,
        build: {
          outDir: resolve(__dirname, 'dist'),
          emptyOutDir: false,
          lib: {
            entry: resolve(__dirname, 'src/background/index.ts'),
            name: 'background',
            formats: ['iife'],
            fileName: () => 'background.js',
          },
          rollupOptions: {
            output: {
              extend: true,
            },
          },
        },
        logLevel: 'warn',
      });

      // Build content.js as IIFE
      await viteBuild({
        configFile: false,
        build: {
          outDir: resolve(__dirname, 'dist'),
          emptyOutDir: false,
          lib: {
            entry: resolve(__dirname, 'src/content/index.ts'),
            name: 'content',
            formats: ['iife'],
            fileName: () => 'content.js',
          },
          rollupOptions: {
            output: {
              extend: true,
            },
          },
        },
        logLevel: 'warn',
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), buildExtensionScripts()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
