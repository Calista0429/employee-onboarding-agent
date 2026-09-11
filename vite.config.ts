import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: apiTarget } } },
  test: {
    environment: 'jsdom',
    execArgv: ['--no-experimental-webstorage'],
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    restoreMocks: true,
  },
});
