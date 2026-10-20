import { createRequire } from 'node:module';
import { sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Which libSQL client a URL gets. Its own file, so it starts in a fresh
 * process (pool: 'forks') where nothing has loaded the native driver yet —
 * and the app itself is pinned to plain local SQLite, even in the CI run that
 * otherwise puts it on a libSQL file.
 */

let libsqlClient: (typeof import('./db.js'))['libsqlClient'];

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', '');
  ({ libsqlClient } = await import('./db.js'));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const NATIVE_DRIVER = `${sep}node_modules${sep}libsql${sep}`;

function nativeDriverLoaded(): boolean {
  return Object.keys(createRequire(import.meta.url).cache).some((path) => path.includes(NATIVE_DRIVER));
}

describe('libsqlClient', () => {
  it('reaches a remote Turso database without loading the native driver', async () => {
    // A Vercel function can't load it: the binary isn't in the bundle.
    const client = await libsqlClient('libsql://example.turso.io', 'token');
    expect(nativeDriverLoaded()).toBe(false);
    client.close();
  });

  it('loads the full client, native driver included, only for a local file', async () => {
    const client = await libsqlClient('file::memory:');
    expect(client.protocol).toBe('file');
    expect(nativeDriverLoaded()).toBe(true);
    client.close();
  });
});
