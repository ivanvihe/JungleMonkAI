import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
      },
      output: {
        // Allow Rollup to decide how to split React dependencies while keeping
        // Three.js in its own chunk to avoid inflating the main bundle.
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }
        }
      }
    }
  },
  assetsInclude: ['**/*.wgsl'],
  json: {
    stringify: false
  },
  css: {
    modules: {
      localsConvention: 'camelCase'
    }
  }
});
