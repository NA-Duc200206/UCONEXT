import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/services/**/*.ts', 'src/middleware/**/*.ts'],
      thresholds: {
        'src/services/**': {
          lines: 80,
          branches: 70,
        },
        'src/middleware/**': {
          lines: 80,
          branches: 70,
        },
      },
    },
  },
});
