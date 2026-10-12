import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { vercelHandler } from './vercel.js';

/**
 * The Vercel handler behind a real Node HTTP server, the way Vercel calls it:
 * plain request and response objects, real sockets, no Fastify inject.
 */

let server: Server;
let base: string;

beforeAll(async () => {
  const handler = await vercelHandler();
  server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('the API as a Vercel function', () => {
  it('answers the health check', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('serves a sign-up CAPTCHA from the database-backed store', async () => {
    const res = await fetch(`${base}/api/auth/captcha`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; svg: string };
    expect(body.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.svg).toContain('<svg');
  });

  it('keeps unknown routes as JSON 404s', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });
});
