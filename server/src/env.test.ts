import { describe, expect, it, vi } from 'vitest';

/** The env is read once at import, so each case loads a fresh copy of it. */
async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  try {
    return (await import('./env.js')).env;
  } finally {
    vi.unstubAllEnvs();
  }
}

describe('TRUST_PROXY', () => {
  it('trusts every hop when set to all, for hosts that overwrite X-Forwarded-For', async () => {
    expect((await loadEnv({ TRUST_PROXY: 'all' })).trustProxy).toBe(true);
  });

  it('trusts the listed addresses only', async () => {
    expect((await loadEnv({ TRUST_PROXY: ' 10.0.0.0/8 , 192.168.1.1 ' })).trustProxy).toEqual([
      '10.0.0.0/8',
      '192.168.1.1',
    ]);
  });

  it('trusts nothing in development by default', async () => {
    expect((await loadEnv({ TRUST_PROXY: '' })).trustProxy).toBe(false);
  });
});
