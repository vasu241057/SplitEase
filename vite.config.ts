import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/__tests__/**/*.spec.ts', 'src/__tests__/**/*.spec.tsx'],
    exclude: ['node_modules', 'express-SplitEase-app/**']
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
