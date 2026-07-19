import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { env } from './env.js';
import { healthRoutes } from './routes/health.js';
import { generateRoutes } from './routes/generate.js';

// Path to the built frontend (LuminaStudy/dist) — same in tsx (src) and compiled (dist).
const CLIENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/**
 * Builds the Fastify app with the security stack:
 *  - helmet: hardened HTTP headers
 *  - cors: locked to the known frontend origin, credentials allowed (cookies)
 *  - rate-limit: global ceiling; hot routes tighten it further
 *  - cookie: signed cookies for httpOnly session tokens (auth phase)
 *  - a global error handler that never leaks stack traces to clients
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    // Don't trust client-provided proxy headers unless explicitly configured.
    trustProxy: false,
    bodyLimit: 1_000_000, // 1 MB — generous for text, stops oversized payloads.
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(cookie, { secret: env.JWT_SECRET });

  await app.register(healthRoutes);
  await app.register(generateRoutes);

  // Serve the built frontend so the whole app runs from ONE server on one port
  // (no separate frontend process, no proxy). HashRouter means all client
  // routes live under '/#/…', so serving index.html at '/' is enough.
  if (existsSync(CLIENT_DIR)) {
    await app.register(fastifyStatic, { root: CLIENT_DIR, prefix: '/' });
  } else {
    app.log.warn(`Frontend build not found at ${CLIENT_DIR} — run "npm run build" in the project root.`);
  }

  // Any uncaught error becomes a generic 500 — internals stay server-side.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) request.log.error(error);
    reply.code(status).send({
      error: status >= 500 ? 'internal' : 'request_error',
      message: status >= 500 ? 'Something went wrong.' : error.message,
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'not_found', message: 'Route not found.' });
  });

  return app;
}
