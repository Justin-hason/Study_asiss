import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/v1/admin': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api/v1/knowledge': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/api/v1/generate': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/api/v1/search': {
        target: 'http://localhost:8010',
        changeOrigin: true,
      },
      '/api/v1/reranker': {
        target: 'http://localhost:8011',
        changeOrigin: true,
      },
      '/api/v1/pipeline': {
        target: 'http://localhost:8020',
        changeOrigin: true,
      },
      '/api/v1/learn': {
        target: 'http://localhost:8030',
        changeOrigin: true,
      },
    },
  },
})
