import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/__tests__/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      thresholds: {
        'src/store/*.ts': {
          statements: 68,
          branches: 58,
          functions: 72,
          lines: 68,
        },
        'src/utils/*.ts': {
          statements: 90,
          branches: 75,
          functions: 90,
          lines: 90,
        },
        'src/components/ui/shared/*.tsx': {
          statements: 60,
          branches: 48,
          functions: 88,
          lines: 57,
        },
      },
    },
  },
});
