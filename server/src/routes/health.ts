import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';

export async function healthRoutes(app: FastifyInstance) {
  // Liveness + a safe capability flag (never exposes the key itself).
  app.get('/api/health', async () => ({
    ok: true,
    aiEnabled: env.aiEnabled,
    provider: env.aiEnabled ? env.aiProvider : null,
    model: env.aiEnabled
      ? env.aiProvider === 'openai-compat'
        ? env.OPENAI_COMPAT_MODEL
        : env.GEMINI_MODEL
      : null,
  }));
}
