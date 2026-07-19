// NOTE: the database (node:sqlite) is not wired into any active feature yet —
// it's reserved for the auth/cloud-sync phase. It's intentionally NOT imported
// here so the server boots on any Node version without experimental flags.
import { buildApp } from './app.js';
import { env } from './env.js';

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: '127.0.0.1' });
  app.log.info(`AI ${env.aiEnabled ? 'enabled' : 'disabled (set GEMINI_API_KEY to enable)'}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
