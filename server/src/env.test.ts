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

describe('the app\'s address on Vercel', () => {
  it('comes from Vercel\'s production URL when APP_URL and CORS_ORIGIN are unset', async () => {
    const env = await loadEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'lumina-study.vercel.app' });
    expect(env.APP_URL).toBe('https://lumina-study.vercel.app');
    expect(env.CORS_ORIGIN).toBe('https://lumina-study.vercel.app');
    expect(env.googleRedirectUri).toBe('https://lumina-study.vercel.app/api/auth/google/callback');
  });

  it('lets an explicit APP_URL win, for a custom domain', async () => {
    const env = await loadEnv({
      VERCEL_PROJECT_PRODUCTION_URL: 'lumina-study.vercel.app',
      APP_URL: 'https://lumina.example',
    });
    expect(env.APP_URL).toBe('https://lumina.example');
  });

  it('knows this deployment\'s own preview addresses', async () => {
    const env = await loadEnv({
      VERCEL_URL: 'lumina-study-abc123.vercel.app',
      VERCEL_BRANCH_URL: 'lumina-study-git-main.vercel.app',
    });
    expect(env.deploymentOrigins).toEqual([
      'https://lumina-study-abc123.vercel.app',
      'https://lumina-study-git-main.vercel.app',
    ]);
  });

  it('falls back to localhost off Vercel', async () => {
    const env = await loadEnv({});
    expect(env.APP_URL).toBe('http://localhost:3001');
    expect(env.CORS_ORIGIN).toBe('http://localhost:5174');
    expect(env.deploymentOrigins).toEqual([]);
  });
});
