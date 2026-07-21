import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, type StudySetRow } from '../db.js';
import { requireAuth } from '../lib/auth.js';

/**
 * Cloud storage for study sets. Every query is scoped by `user_id` taken from
 * the session — never from the request body — so one account can't read or
 * overwrite another's sets by guessing an id.
 *
 * A set is treated as a single document: cards and quiz travel together as JSON
 * in `data`, while the fields worth querying (title, subject, mastery) are also
 * stored as columns.
 */

const flashcard = z.object({
  id: z.string().min(1).max(100),
  front: z.string().min(1).max(2000),
  back: z.string().min(1).max(4000),
});

const quizQuestion = z.object({
  id: z.string().min(1).max(100),
  prompt: z.string().min(1).max(2000),
  options: z.array(z.string().max(500)).min(2).max(6),
  answerIndex: z.number().int().min(0).max(5),
  explanation: z.string().max(2000).default(''),
});

const studySet = z.object({
  id: z.string().min(1).max(100),
  subject: z.string().max(120).default(''),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  mastery: z.number().int().min(0).max(100).default(0),
  summary: z.string().max(20000).default(''),
  highlights: z.array(z.string().max(1000)).max(20).default([]),
  lastUpdatedMs: z.number().int().nonnegative().optional(),
  cards: z.array(flashcard).max(500),
  quiz: z.array(quizQuestion).max(200),
});

type StudySetInput = z.infer<typeof studySet>;

/** DB row -> the shape the frontend already uses. */
function toClient(row: StudySetRow) {
  const data = JSON.parse(row.data) as {
    cards: unknown[];
    quiz: unknown[];
    summary?: string;
    highlights?: string[];
  };
  return {
    id: row.id,
    subject: row.subject,
    title: row.title,
    description: row.description,
    mastery: row.mastery,
    lastUpdatedMs: row.updated_at,
    // Sets written before summaries existed simply have none.
    summary: data.summary ?? '',
    highlights: data.highlights ?? [],
    cards: data.cards ?? [],
    quiz: data.quiz ?? [],
  };
}

function upsert(userId: string, set: StudySetInput, now: number) {
  const data = JSON.stringify({
    cards: set.cards,
    quiz: set.quiz,
    summary: set.summary,
    highlights: set.highlights,
  });
  // The WHERE clause on update is what stops one user overwriting another's row
  // even if they somehow guessed the id.
  db.prepare(
    `INSERT INTO study_sets (id, user_id, subject, title, description, data, mastery, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       subject = excluded.subject,
       title = excluded.title,
       description = excluded.description,
       data = excluded.data,
       mastery = excluded.mastery,
       updated_at = excluded.updated_at
     WHERE study_sets.user_id = excluded.user_id`,
  ).run(
    set.id,
    userId,
    set.subject,
    set.title,
    set.description,
    data,
    set.mastery,
    set.lastUpdatedMs ?? now,
    now,
  );
}

export async function setsRoutes(app: FastifyInstance) {
  // Everything below requires a session.
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/sets')) return;
    await requireAuth(request, reply);
  });

  app.get('/api/sets', async (request, reply) => {
    const rows = db
      .prepare('SELECT * FROM study_sets WHERE user_id = ? ORDER BY updated_at DESC')
      .all(request.user!.id) as unknown as StudySetRow[];
    return reply.send({ sets: rows.map(toClient) });
  });

  app.put('/api/sets/:id', async (request, reply) => {
    const parsed = studySet.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'That study set is not valid.',
      });
    }
    const { id } = request.params as { id: string };
    if (id !== parsed.data.id) {
      return reply
        .code(400)
        .send({ error: 'id_mismatch', message: 'The set id in the URL and body must match.' });
    }

    upsert(request.user!.id, parsed.data, Date.now());
    const row = db
      .prepare('SELECT * FROM study_sets WHERE id = ? AND user_id = ?')
      .get(id, request.user!.id) as StudySetRow | undefined;
    if (!row) {
      return reply.code(409).send({ error: 'conflict', message: 'That set belongs to someone else.' });
    }
    return reply.send({ set: toClient(row) });
  });

  /**
   * Bulk push — used once when a signed-out user with local sets signs in, so
   * their existing work follows them into the account.
   */
  app.post('/api/sets/sync', async (request, reply) => {
    const parsed = z.object({ sets: z.array(studySet).max(200) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Those study sets are not valid.',
      });
    }

    const now = Date.now();
    const userId = request.user!.id;
    // One transaction: either the whole push lands or none of it does.
    db.exec('BEGIN');
    try {
      for (const set of parsed.data.sets) upsert(userId, set, now);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const rows = db
      .prepare('SELECT * FROM study_sets WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId) as unknown as StudySetRow[];
    return reply.send({ sets: rows.map(toClient) });
  });

  app.delete('/api/sets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.prepare('DELETE FROM study_sets WHERE id = ? AND user_id = ?').run(id, request.user!.id);
    return reply.send({ ok: true });
  });
}
