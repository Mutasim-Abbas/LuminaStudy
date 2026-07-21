import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { db, type UserRow } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  clearSessionCookie,
  currentUser,
  requireAuth,
  setSessionCookie,
  signSession,
} from '../lib/auth.js';

/**
 * Email/password accounts.
 *
 * Two deliberate choices here:
 *  - Sign-in failures always return the same message whether the email is
 *    unknown or the password is wrong, so the endpoint can't be used to
 *    enumerate which addresses have accounts.
 *  - Both endpoints are rate limited far below the global ceiling, because
 *    they are the two worth brute-forcing.
 */

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(200, 'That password is too long.'),
});

/** Never let a password hash leave the server. */
function publicUser(row: Pick<UserRow, 'id' | 'email'>) {
  return { id: row.id, email: row.email };
}

export async function authRoutes(app: FastifyInstance) {
  // Brute-force protection on the two endpoints worth attacking. Lifted under
  // test, where dozens of sign-ups from one address are the suite, not an attack.
  const authLimit = {
    rateLimit: { max: env.NODE_ENV === 'test' ? 10_000 : 10, timeWindow: '5 minutes' },
  };

  app.post('/api/auth/signup', { config: authLimit }, async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Check your details.',
      });
    }
    const { email, password } = parsed.data;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return reply
        .code(409)
        .send({ error: 'email_taken', message: 'That email already has an account.' });
    }

    const user = { id: randomUUID(), email };
    db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
      user.id,
      user.email,
      await hashPassword(password),
      Date.now(),
    );

    setSessionCookie(reply, signSession(user));
    return reply.code(201).send({ user: publicUser(user) });
  });

  app.post('/api/auth/login', { config: authLimit }, async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    // Deliberately vague: a validation failure here shouldn't teach an attacker
    // anything about the password policy of an existing account.
    const invalid = { error: 'invalid_credentials', message: 'Email or password is incorrect.' };
    if (!parsed.success) return reply.code(401).send(invalid);

    const { email, password } = parsed.data;
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;

    // Hash even when the user is unknown, so response time doesn't reveal it.
    const stored = row?.password_hash ?? 'scrypt$00$00';
    const ok = await verifyPassword(password, stored);
    if (!row || !ok) return reply.code(401).send(invalid);

    const user = { id: row.id, email: row.email };
    setSessionCookie(reply, signSession(user));
    return reply.send({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  /** Who am I? Returns null rather than 401 so the client can boot either way. */
  app.get('/api/auth/me', async (request, reply) => {
    const user = currentUser(request);
    return reply.send({ user: user ? publicUser(user) : null });
  });

  /** Deletes the account and, by cascade, everything it owns. */
  app.delete('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(request.user!.id);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}
