import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC keeps decorator metadata, which NestJS dependency injection needs.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://masar:masar@localhost:5432/masar_test',
      JWT_SECRET: 'test-secret-that-is-long-enough-for-tests-only',
      DEMO_MODE: 'true',
      WEB_ORIGIN: 'http://localhost:3000',
    },
  },
});
