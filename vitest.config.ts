import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// الاختبارات تعمل على TEST_DATABASE_URL فقط — قاعدة التطوير لا تُلمس.
const env = loadEnv('test', process.cwd(), '');

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    env: { DATABASE_URL: env.TEST_DATABASE_URL ?? '', STORAGE_DIR: '.test-storage', APP_TZ: 'Asia/Aden', COUNTRY_CODE: '967' },
  },
});
