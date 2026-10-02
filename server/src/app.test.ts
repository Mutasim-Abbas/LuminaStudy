import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Client IPs behind the host's proxy. Every rate limit is keyed on the IP, so
 * getting it wrong either puts all users in one bucket (proxy not trusted) or
 * lets anyone pick their own bucket (client header trusted).
 *
 * The env is read once at import, so it is set before the app is loaded — this
 * file runs in its own process (pool: 'forks'). The list mirrors the
 * production default in env.ts.
 */

const PROXY = '10.0.0.1';

let app: FastifyInstance;

beforeAll(async () => {
  vi.stubEnv('TRUST_PROXY', 'loopback,linklocal,uniquelocal,100.64.0.0/10');
  const { buildApp } = await import('./app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

/** Rate-limit allowance left for a request from `from`, carrying `forwardedFor`. */
async function remaining(forwardedFor: string, from = PROXY): Promise<number> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/health',
    remoteAddress: from,
    headers: { 'x-forwarded-for': forwardedFor },
  });
  expect(res.statusCode).toBe(200);
  return Number(res.headers['x-ratelimit-remaining']);
}

describe('client IP behind the proxy', () => {
  it('gives each client its own rate-limit bucket', async () => {
    const first = await remaining('203.0.113.7');
    expect(await remaining('203.0.113.7')).toBe(first - 1);
    // A different user behind the same proxy is untouched.
    expect(await remaining('198.51.100.9')).toBe(first);
  });
});
