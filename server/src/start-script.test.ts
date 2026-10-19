import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * scripts/start.sh, the container entrypoint. A stand-in `litestream` on the
 * PATH records how it is called, so these run without the real binary or a
 * bucket. The "server" is `echo`, which shows whether the script started it.
 */

const SCRIPT = fileURLToPath(new URL('../scripts/start.sh', import.meta.url));

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function start(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-start-'));
  dirs.push(dir);
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'litestream-calls');
  writeFileSync(join(bin, 'litestream'), `#!/bin/sh\necho "$*" >> "${log}"\n`, { mode: 0o755 });

  const dbPath = join(dir, 'data', 'lumina.db');
  const result = spawnSync('sh', [SCRIPT, 'echo', 'server started'], {
    // A clean environment, so nothing from the machine running the tests leaks in.
    env: { PATH: `${bin}:/usr/bin:/bin`, DATABASE_PATH: dbPath, ...env },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    dbPath,
    litestream: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [],
  };
}

describe('start script', () => {
  it('runs the server directly when backups are not configured in development', () => {
    const run = start({ NODE_ENV: 'development' });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('server started\n');
    expect(run.stderr).toContain('running without backups');
    expect(run.litestream).toEqual([]);
  });
});
