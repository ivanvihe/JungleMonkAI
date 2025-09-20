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
        manualChunks: {
          react: ['react', 'react-dom'],
          three: ['three']
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
