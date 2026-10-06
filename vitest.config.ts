import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The rules tests share one emulator; run files one after another.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
