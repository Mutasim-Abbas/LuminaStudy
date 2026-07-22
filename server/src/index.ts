import { buildApp } from './app.js';
import { env } from './env.js';

const app = await buildApp();

/**
 * Loopback in development so a dev server is never exposed to the local
 * network. In production the process sits behind the host's proxy inside a
 * container, where binding to loopback would accept only connections
 * originating inside that container — the platform could never route traffic
 * to it, and the deploy would look healthy while being unreachable.
 */
const host = env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

try {
  await app.listen({ port: env.PORT, host });
  app.log.info(`AI ${env.aiEnabled ? 'enabled' : 'disabled (set GROQ_API_KEY to enable)'}`);
  app.log.info(`Mail ${env.mailEnabled ? 'enabled' : 'disabled (reset links go to this log)'}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
