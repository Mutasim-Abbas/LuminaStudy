import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // A fresh process per file, so each suite gets its own SQLite handle.
    pool: 'forks',
    /**
     * Tests run against a throwaway in-memory database with a fixed secret, so
     * `npm test` never touches data/lumina.db and never depends on a .env being
     * present. NODE_ENV=test also silences the request logger and lifts the
     * auth rate limit (see routes/auth.ts).
     */
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      JWT_SECRET: 'test-only-secret-not-used-anywhere-near-production',
    },
  },
});
