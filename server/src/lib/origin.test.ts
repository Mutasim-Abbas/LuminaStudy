import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

/**
 * The cross-site check on a Vercel deployment. The env is read at import, so
 * each case loads a fresh copy of the module with Vercel's variables set.
 */
async function checkOnVercel() {
  vi.resetModules();
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'lumina-study.vercel.app');
  vi.stubEnv('VERCEL_URL', 'lumina-study-abc123.vercel.app');
  vi.stubEnv('VERCEL_BRANCH_URL', 'lumina-study-git-main.vercel.app');
  try {
    return (await import('./origin.js')).isCrossSiteWrite;
  } finally {
    vi.unstubAllEnvs();
  }
}

function signInFrom(origin: string): FastifyRequest {
  return { method: 'POST', url: '/api/auth/login', headers: { origin } } as unknown as FastifyRequest;
}

describe('the cross-site check on Vercel', () => {
  it('accepts sign-ins from the production site and this deployment\'s preview addresses', async () => {
    const isCrossSiteWrite = await checkOnVercel();
    for (const origin of [
      'https://lumina-study.vercel.app',
      'https://lumina-study-abc123.vercel.app',
      'https://lumina-study-git-main.vercel.app',
    ]) {
      expect(isCrossSiteWrite(signInFrom(origin)), origin).toBe(false);
    }
  });

  it('still refuses every other site, including other Vercel apps', async () => {
    const isCrossSiteWrite = await checkOnVercel();
    for (const origin of ['https://evil.example', 'https://someone-else.vercel.app']) {
      expect(isCrossSiteWrite(signInFrom(origin)), origin).toBe(true);
    }
  });
});
