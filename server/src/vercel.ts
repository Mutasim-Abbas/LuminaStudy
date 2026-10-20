import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from './app.js';

/**
 * The API as a Vercel function. Vercel calls the returned handler with plain
 * Node request/response objects for every `/api/*` request (see vercel.json);
 * Fastify takes it from there exactly as it does behind `listen()`.
 *
 * The app is built once per function instance and reused across requests, so
 * only a cold start pays for setup — including the check that the database
 * schema is current.
 */
export async function vercelHandler(): Promise<
  (req: IncomingMessage, res: ServerResponse) => void
> {
  const app = await buildApp();
  await app.ready();
  return (req, res) => {
    app.server.emit('request', req, res);
  };
}
