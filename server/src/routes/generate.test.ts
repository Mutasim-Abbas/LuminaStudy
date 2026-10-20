import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
let database: (typeof import('../db.js'))['database'];

beforeAll(async () => {
  vi.stubEnv('GROQ_API_KEY', 'gsk_test_key_not_a_real_one');
  const { buildApp } = await import('../app.js');
  ({ database } = await import('../db.js'));
  const { sessionCookieFor } = await import('../testing/sessions.js');
  app = await buildApp();
  await database.run(
    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u1', 'ada@example.com', 'Ada', '', 1)",
  );
  cookie = await sessionCookieFor('u1');
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await database.exec('DELETE FROM ai_usage');
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
    const quota = await app.inject({
      method: 'GET',
      url: '/api/generate/quota',
      headers: { cookie },
    });
    expect(quota.json()).toMatchObject({ used: 0, remaining: 3 });
  });
});

describe('the daily AI allowance', () => {
  it('holds under simultaneous requests: five at once, three get through', async () => {
    const content = {
      subject: 'Biology',
      title: 'Cells',
      summary: 'Cells make energy.',
      highlights: ['Mitochondria make ATP.'],
      flashcards: [{ front: 'What makes ATP?', back: 'Mitochondria' }],
      quiz: [
        {
          prompt: 'ATP is made by?',
          options: ['Mitochondria', 'Ribosomes'],
          answerIndex: 0,
          explanation: '',
        },
      ],
    };
    // A slow provider, so every request is in flight before any finishes.
    vi.stubGlobal('fetch', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/generate',
          headers: { cookie },
          payload: { text: 'Mitochondria are the powerhouse of the cell, producing ATP.' },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 200, 200, 402, 402]);
    expect(await database.get('SELECT COUNT(*) AS n FROM ai_usage')).toEqual({ n: 3 });
  });
});
