import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  optimizeDeps: {
    include: ['dagre'],
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'x6': ['@antv/x6'],
          'x6-plugins': [
            '@antv/x6-plugin-selection',
            '@antv/x6-plugin-snapline',
            '@antv/x6-plugin-history',
            '@antv/x6-plugin-clipboard',
            '@antv/x6-plugin-minimap',
          ],
          'element-plus': ['element-plus'],
        },
      },
    },
  },
})
