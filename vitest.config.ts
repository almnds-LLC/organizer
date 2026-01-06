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
        // Business logic - high coverage required
        'src/store/*.ts': {
          statements: 80,
          branches: 65,
          functions: 85,
          lines: 80,
        },
        'src/utils/*.ts': {
          statements: 90,
          branches: 75,
          functions: 90,
          lines: 90,
        },
        // API client excluded - covered by E2E tests, mocking fetch is pointless
        // Components - catch UI regressions
        'src/components/ui/shared/*.tsx': {
          statements: 65,
          branches: 55,
          functions: 50,
          lines: 65,
        },
      },
    },
  },
});
