import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            JWT_SECRET: 'test-secret-key-for-testing-purposes-only',
            TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
          },
          d1Databases: {
            DB: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          },
          durableObjects: {
            ROOM_SYNC: 'RoomSync',
          },
        },
      },
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/**/*.d.ts'],
      thresholds: {
        // Backend API coverage thresholds
        'src/storage/**/*.ts': {
          statements: 75,
          branches: 65,
          functions: 80,
          lines: 75,
        },
        'src/routes/**/*.ts': {
          statements: 85,
          branches: 75,
          functions: 85,
          lines: 85,
        },
      },
    },
  },
});
