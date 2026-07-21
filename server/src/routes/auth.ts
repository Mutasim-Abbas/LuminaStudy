import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { db, type UserRow } from '../db.js';
import {
  clearLoginFailures,
  formatWait,
  loginLockout,
  pruneLoginAttempts,
  recordLoginFailure,
} from '../lib/limits.js';
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

/**
 * Bot signals sent with every sign-up. Neither is a CAPTCHA — they're the cheap
 * checks that cost a real person nothing:
 *
 *  - `website` is a honeypot: hidden from view, so only a form-filling script
 *    puts anything in it.
 *  - `elapsedMs` is how long the form was on screen. A human cannot read three
 *    labels and type an email and password in under a second and a half.
 *
 * Both are advisory — a determined bot forges them trivially. They exist to
 * stop the volume of dumb automated sign-ups, with the per-email lockout and
 * per-IP rate limit behind them for the rest. Swap in Turnstile/hCaptcha here
 * if this ever needs to hold against a targeted attack.
 */
const MIN_FORM_TIME_MS = 1500;

const botSignals = z.object({
  website: z.string().max(200).optional(),
  elapsedMs: z.number().int().nonnegative().optional(),
});

const signupBody = credentials.extend({
  name: z.string().trim().min(1, 'Tell us your name.').max(80),
}).merge(botSignals);

/** Returns a rejection reason, or null when the submission looks human. */
function botRejection(body: z.infer<typeof botSignals>): string | null {
  if (body.website && body.website.trim().length > 0) return 'honeypot';
  if (typeof body.elapsedMs === 'number' && body.elapsedMs < MIN_FORM_TIME_MS) return 'too_fast';
  return null;
}

/** Never let a password hash leave the server. */
function publicUser(row: Pick<UserRow, 'id' | 'email' | 'name'>) {
  return { id: row.id, email: row.email, name: row.name };
}

/**
 * A genuine hash of a random secret, computed once at boot and verified against
 * when the email is unknown. Using a real hash matters: a short placeholder
 * would finish far faster than a real verification and hand an attacker the
 * account-existence oracle the constant-time response was meant to close.
 */
const DUMMY_HASH = await hashPassword(randomBytes(32).toString('hex'));

export async function authRoutes(app: FastifyInstance) {
  // Brute-force protection on the two endpoints worth attacking. Lifted under
  // test, where dozens of sign-ups from one address are the suite, not an attack.
  const authLimit = {
    rateLimit: { max: env.NODE_ENV === 'test' ? 10_000 : 10, timeWindow: '5 minutes' },
  };

  app.post('/api/auth/signup', { config: authLimit }, async (request, reply) => {
    const parsed = signupBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Check your details.',
      });
    }

    // Checked before touching the database, so a bot costs us nothing. The
    // message is deliberately generic — naming the trap teaches the next script.
    const rejection = botRejection(parsed.data);
    if (rejection) {
      request.log.warn({ rejection, email: parsed.data.email }, 'signup rejected as automated');
      return reply.code(400).send({
        error: 'failed_verification',
        message: "That didn't look like a human submission. Please try again.",
      });
    }

    const { email, password, name } = parsed.data;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return reply
        .code(409)
        .send({ error: 'email_taken', message: 'That email already has an account.' });
    }

    const user = { id: randomUUID(), email, name };
    db.prepare(
      'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(user.id, user.email, user.name, await hashPassword(password), Date.now());

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
    const now = Date.now();

    // Per-account lockout, checked before any password work. This is the control
    // that survives an attacker rotating IPs, which the per-IP limiter cannot.
    const lock = loginLockout(email, now);
    if (lock.locked) {
      return reply.code(429).send({
        error: 'too_many_attempts',
        message: `Too many sign-in attempts. Try again in ${formatWait(lock.retryAtMs!, now)}.`,
        retryAtMs: lock.retryAtMs,
      });
    }

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;

    // Hash even when the user is unknown, so response time doesn't reveal it.
    const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) {
      recordLoginFailure(email, now);
      const after = loginLockout(email, now);
      return reply.code(401).send({
        ...invalid,
        // Telling the user how many tries remain is worth more than the little
        // it reveals: the count is identical for unknown emails, so it still
        // leaks nothing about whether the account exists.
        attemptsRemaining: after.remaining,
      });
    }

    clearLoginFailures(email);
    pruneLoginAttempts(now);

    const user = { id: row.id, email: row.email, name: row.name ?? '' };
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
