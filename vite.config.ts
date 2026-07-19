/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from the root of the backend (one server), so base is always '/'.
export default defineConfig(() => ({
  base: '/',
  plugins: [react()],
  // In dev, forward /api calls to the backend so the browser only ever talks
  // to one origin (no CORS surprises, and the API key stays server-side).
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}));
