import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

/**
 * A second line of defence against cross-site request forgery.
 *
 * The first is the session cookie's SameSite=Lax, which browsers don't attach
 * to cross-site POST, PUT or DELETE requests. This check doesn't depend on
 * that: a state-changing API request whose Origin header names another site,
 * or whose Sec-Fetch-Site says it is cross-site, is refused before any route
 * runs. Requests with neither header (curl, server-to-server) carry no
 * browser's cookies, so they have nothing to forge and pass through.
 */

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The app's own origins: the frontend in development, where the app is
 * served, and — on Vercel — this deployment's own preview addresses.
 */
function trustedOrigins(): Set<string> {
  return new Set([
    new URL(env.CORS_ORIGIN).origin,
    new URL(env.APP_URL).origin,
    ...env.deploymentOrigins.map((url) => new URL(url).origin),
  ]);
}

export function isCrossSiteWrite(request: FastifyRequest, trusted = trustedOrigins()): boolean {
  if (!STATE_CHANGING.has(request.method) || !request.url.startsWith('/api/')) return false;
  const origin = request.headers.origin;
  if (origin !== undefined && !trusted.has(origin)) return true;
  return request.headers['sec-fetch-site'] === 'cross-site';
}

/** Fastify onRequest hook: refuses cross-site writes with 403. */
export async function refuseCrossSiteWrites(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isCrossSiteWrite(request)) {
    await reply
      .code(403)
      .send({ error: 'cross_site_request', message: 'This request came from another site.' });
  }
}
