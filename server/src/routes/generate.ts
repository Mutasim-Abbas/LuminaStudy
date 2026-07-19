import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateStudySet, GeminiError } from '../services/gemini.js';

const bodySchema = z.object({
  // Cap length: protects cost and blocks abuse. ~40k chars ≈ a long lecture.
  text: z.string().min(20, 'Please provide at least a paragraph of material.').max(40000),
  hint: z.string().max(200).optional(),
  cards: z.number().int().min(1).max(30).optional(),
  questions: z.number().int().min(1).max(20).optional(),
});

export async function generateRoutes(app: FastifyInstance) {
  app.post(
    '/api/generate',
    {
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

      try {
        const set = await generateStudySet(parsed.data);
        return reply.send({ set });
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
