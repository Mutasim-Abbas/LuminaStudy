import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * AI generation when the provider fails. What the provider says can name its
 * account and limits, so none of it may reach the user.
 *
 * The env is read once at import, so the key is set before the app loads —
 * this file runs in its own process (pool: 'forks'). The provider itself is a
 * stubbed fetch; no request leaves the machine.
 */

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  vi.stubEnv('GROQ_API_KEY', 'gsk_test_key_not_a_real_one');
  const { buildApp } = await import('../app.js');
  const { signSession } = await import('../lib/auth.js');
  app = await buildApp();
  cookie = `lumina_session=${signSession({ id: 'u1', email: 'ada@example.com', name: 'Ada' })}`;
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Ask for a study set while the provider answers with `status` and `body`. */
async function generateWhileProviderSays(status: number, body: string) {
  vi.stubGlobal('fetch', async () => new Response(body, { status }));
  return app.inject({
    method: 'POST',
    url: '/api/generate',
    headers: { cookie },
    payload: { text: 'Mitochondria are the powerhouse of the cell, producing ATP.' },
  });
}

describe('when the AI provider fails', () => {
  it('hides a rate-limit error that names the provider organization', async () => {
    const res = await generateWhileProviderSays(
      429,
      '{"error":{"message":"Rate limit reached for model llama-3.3-70b in organization org_01SECRETID on tokens per minute"}}',
    );
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: 'ai_error',
      message: 'The AI is busy right now. Please try again in a minute.',
    });
    expect(res.body).not.toMatch(/org_|llama|Rate limit/);
  });

  it('does not reveal that the server key was rejected, or where it lives', async () => {
    const res = await generateWhileProviderSays(401, '{"error":{"message":"Invalid API Key"}}');
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toBe('AI generation isn’t available right now.');
    expect(res.body).not.toMatch(/key|\.env/i);
  });

  it('gives a plain message for any other failure', async () => {
    const res = await generateWhileProviderSays(500, 'upstream stack trace: at internal/worker.js');
    expect(res.statusCode).toBe(502);
    expect(res.json().message).toBe('The AI request failed. Please try again.');
    expect(res.body).not.toContain('stack trace');
  });

  it('does not spend one of the free generations', async () => {
    await generateWhileProviderSays(500, 'boom');
    const quota = await app.inject({ method: 'GET', url: '/api/generate/quota', headers: { cookie } });
    expect(quota.json()).toMatchObject({ used: 0, remaining: 3 });
  });
});
