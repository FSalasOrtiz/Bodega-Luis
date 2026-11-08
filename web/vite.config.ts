import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], exclude: ['tests/rules/**', 'node_modules/**'] },
});
