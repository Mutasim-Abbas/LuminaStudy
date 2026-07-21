import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateStudySet, GeminiError } from '../services/gemini.js';
import { requireAuth } from '../lib/auth.js';
import { AI_FREE_PER_DAY, aiQuota, formatWait, recordAiUse } from '../lib/limits.js';

const bodySchema = z.object({
  // Cap length: protects cost and blocks abuse. ~40k chars ≈ a long lecture.
  text: z.string().min(20, 'Please provide at least a paragraph of material.').max(40000),
  hint: z.string().max(200).optional(),
  cards: z.number().int().min(1).max(30).optional(),
  questions: z.number().int().min(1).max(20).optional(),
});

export async function generateRoutes(app: FastifyInstance) {
  /**
   * Generation costs real money on a third-party API, so it is gated twice:
   * a session is required (no anonymous access to a paid endpoint), and each
   * account gets a small free daily allowance. The per-IP limiter below is a
   * blunt backstop; the per-account quota is the control that actually holds,
   * since an attacker can change IP but not their account.
   */
  app.get('/api/generate/quota', { preHandler: requireAuth }, async (request, reply) => {
    const now = Date.now();
    const quota = aiQuota(request.user!.id, now);
    return reply.send({
      ...quota,
      resetIn: quota.resetAtMs ? formatWait(quota.resetAtMs, now) : null,
    });
  });

  app.post(
    '/api/generate',
    {
      preHandler: requireAuth,
      // Generation is expensive — a tighter limit than the global one.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: parsed.error.issues[0]?.message ?? 'Invalid request body.',
        });
      }

      const userId = request.user!.id;
      const now = Date.now();
      const quota = aiQuota(userId, now);
      if (quota.remaining <= 0) {
        // 402 rather than 429: this isn't "slow down", it's "the free tier is
        // spent". The client uses this to show the upgrade prompt.
        return reply.code(402).send({
          error: 'quota_exceeded',
          message: `You've used all ${AI_FREE_PER_DAY} free study sets for today. Your next one unlocks in ${formatWait(quota.resetAtMs!, now)}.`,
          used: quota.used,
          limit: quota.limit,
          resetAtMs: quota.resetAtMs,
        });
      }

      try {
        const set = await generateStudySet(parsed.data);
        // Only count a generation that actually produced something — a failed
        // upstream call shouldn't burn one of the user's three.
        recordAiUse(userId, now);
        const after = aiQuota(userId, Date.now());
        return reply.send({ set, quota: { used: after.used, limit: after.limit, remaining: after.remaining } });
      } catch (err) {
        if (err instanceof GeminiError) {
          return reply.code(err.status).send({ error: 'ai_error', message: err.message });
        }
        request.log.error(err);
        return reply.code(500).send({ error: 'internal', message: 'Something went wrong.' });
      }
    },
  );
}
