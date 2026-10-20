import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Which libSQL client a URL gets, judged by whether the full client's native
 * driver ends up loaded. Each check runs in a brand-new Node process: test
 * files can share one (the single-process CI run does), and a driver loaded
 * by an earlier file would make this pass or fail for the wrong reason.
 */

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

function nativeDriverLoadedFor(url: string): boolean {
  const script = `
    import { createRequire } from 'node:module';
    const { libsqlClient } = await import('./src/db.ts');
    const client = await libsqlClient(${JSON.stringify(url)}, 'token');
    const cache = createRequire(process.cwd() + '/').cache;
    client.close();
    console.log(Object.keys(cache).some((p) => p.includes('/node_modules/libsql/')));
  `;
  const run = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: SERVER_DIR,
    // The app itself on plain local SQLite, whatever this test run uses.
    env: { ...process.env, DATABASE_URL: '' },
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stdout.trim().split('\n').at(-1) === 'true';
}

describe('libsqlClient', () => {
  it('reaches a remote Turso database without loading the native driver', () => {
    // A Vercel function can't load it: the binary isn't in the bundle.
    expect(nativeDriverLoadedFor('libsql://example.turso.io')).toBe(false);
  });

  it('loads the full client, native driver included, only for a local file', () => {
    expect(nativeDriverLoadedFor('file::memory:')).toBe(true);
  });
});
