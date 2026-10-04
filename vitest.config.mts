import { defineConfig } from 'vitest/config';

// Security-rules tests only: they talk to the Firestore emulator that
// `npm test` starts via `firebase emulators:exec`.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
