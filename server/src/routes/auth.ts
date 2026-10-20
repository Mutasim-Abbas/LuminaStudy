import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { database, type UserRow } from '../db.js';
import {
  clearLoginFailures,
  formatWait,
  loginLockout,
  pruneLoginAttempts,
  recordLoginFailure,
} from '../lib/limits.js';
import { createCaptcha, verifyCaptcha } from '../lib/captcha.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { sendPasswordResetEmail } from '../lib/mailer.js';
import {
  consumeResetToken,
  createResetToken,
  pruneResetTokens,
  resolveResetToken,
  RESET_TTL_MINUTES,
} from '../lib/passwordReset.js';
import {
  clearSessionCookie,
  currentSession,
  requireAuth,
  SESSION_COOKIE,
  startSession,
  verifySession,
} from '../lib/auth.js';
import {
  endAllSessions,
  endSession,
  pruneSessions,
  recentlyReauthenticated,
} from '../lib/sessions.js';

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
 * Bot defence on sign-up, in layers:
 *
 *  - A real CAPTCHA (`captchaToken` + `captcha`): the server drew a distorted
 *    code, and the client must send back what a human read off the image. This
 *    is the actual gate — the answer lives only on the server, so it can't be
 *    scraped, and each challenge is single-use so a solved image can't be
 *    replayed.
 *  - `website` is a honeypot: hidden from view, so only a form-filling script
 *    fills it. A free extra signal, checked before the CAPTCHA.
 *
 * Behind both sit the per-email lockout and per-IP rate limit.
 */
const signupBody = credentials.extend({
  name: z.string().trim().min(1, 'Tell us your name.').max(80),
  captchaToken: z.string().min(1, 'Please complete the verification.').max(100),
  captcha: z.string().min(1, 'Enter the characters from the image.').max(20),
  website: z.string().max(200).optional(),
});

/** Never let a password hash leave the server. */
function publicUser(row: Pick<UserRow, 'id' | 'email' | 'name'> & { google_sub?: string | null }) {
  return { id: row.id, email: row.email, name: row.name, google: Boolean(row.google_sub) };
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

  // Hands out a fresh CAPTCHA image + token for the sign-up form. Rate limited
  // so it can't be hammered to churn memory. The token pairs with the answer
  // the server holds; only the image comes back here.
  app.get(
    '/api/auth/captcha',
    { config: { rateLimit: { max: env.NODE_ENV === 'test' ? 100_000 : 30, timeWindow: '1 minute' } } },
    async (_request, reply) => {
      const { token, svg } = await createCaptcha(Date.now());
      return reply.send({ token, svg });
    },
  );

  app.post('/api/auth/signup', { config: authLimit }, async (request, reply) => {
    const parsed = signupBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Check your details.',
      });
    }

    const now = Date.now();

    // Honeypot first — a filled hidden field is a bot, no need to spend a
    // CAPTCHA check on it. The message stays generic so we don't teach the trap.
    if (parsed.data.website && parsed.data.website.trim().length > 0) {
      request.log.warn({ email: parsed.data.email }, 'signup rejected: honeypot');
      return reply
        .code(400)
        .send({ error: 'failed_verification', message: 'That didn’t look like a human submission.' });
    }

    // The real gate. Wrong or expired answer -> the client must fetch a new
    // image, since the token is consumed on this check either way.
    if (!(await verifyCaptcha(parsed.data.captchaToken, parsed.data.captcha, now))) {
      return reply.code(400).send({
        error: 'captcha_failed',
        message: 'The verification code was incorrect. Please try the new image.',
      });
    }

    const { email, password, name } = parsed.data;

    const existing = await database.get('SELECT id FROM users WHERE email = ?', email);
    if (existing) {
      return reply
        .code(409)
        .send({ error: 'email_taken', message: 'That email already has an account.' });
    }

    const user = { id: randomUUID(), email, name };
    await database.run(
      'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      user.id,
      user.email,
      user.name,
      await hashPassword(password),
      Date.now(),
    );

    await startSession(reply, user.id, Date.now());
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
    const lock = await loginLockout(email, now);
    if (lock.locked) {
      return reply.code(429).send({
        error: 'too_many_attempts',
        message: `Too many sign-in attempts. Try again in ${formatWait(lock.retryAtMs!, now)}.`,
        retryAtMs: lock.retryAtMs,
      });
    }

    const row = await database.get<UserRow>('SELECT * FROM users WHERE email = ?', email);

    // Hash even when the user is unknown, so response time doesn't reveal it.
    // Accounts made through Google have no password (an empty hash); they get
    // the same hashing work and the same answer as a wrong password, so this
    // reveals nothing about how an account was created.
    const ok =
      (await verifyPassword(password, row?.password_hash || DUMMY_HASH)) &&
      Boolean(row?.password_hash);
    if (!row || !ok) {
      await recordLoginFailure(email, now);
      const after = await loginLockout(email, now);
      return reply.code(401).send({
        ...invalid,
        // Telling the user how many tries remain is worth more than the little
        // it reveals: the count is identical for unknown emails, so it still
        // leaks nothing about whether the account exists.
        attemptsRemaining: after.remaining,
      });
    }

    await clearLoginFailures(email);
    await pruneLoginAttempts(now);
    await pruneSessions(now);

    await startSession(reply, row.id, now);
    return reply.send({ user: publicUser(row) });
  });

  /**
   * Ends this browser's session on the server, not just its cookie: a copy of
   * the cookie taken earlier stops working too.
   */
  app.post('/api/auth/logout', async (request, reply) => {
    const token = verifySession(request.cookies?.[SESSION_COOKIE]);
    if (token) await endSession(token.sessionId);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  /**
   * Sign out everywhere: ends every session of the account, this one
   * included. For a lost phone, a shared computer, or a suspicion that someone
   * else is signed in.
   */
  app.post('/api/auth/logout-all', { preHandler: requireAuth }, async (request, reply) => {
    await endAllSessions(request.user!.id);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  /** Who am I? Returns null rather than 401 so the client can boot either way. */
  app.get('/api/auth/me', async (request, reply) => {
    // The account as stored now, so the answer reflects changes since sign-in
    // (such as linking Google), and an ended session or deleted account stops
    // looking signed in.
    const current = await currentSession(request);
    return reply.send({ user: current ? publicUser(current.user) : null });
  });

  /**
   * Deletes the account and everything it owns. Each table is cleared
   * explicitly rather than left to ON DELETE CASCADE: Turso, like SQLite,
   * ships with foreign-key enforcement off, and a deleted account must not
   * leave its study sets behind on any backend. One transaction, so it is
   * all gone or all still there.
   */
  app.delete('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const { id, email } = request.user!;

    // Irreversible, so a signed-in browser alone isn't enough: whoever is at
    // the keyboard has to prove they own the account again — with the
    // password, or by confirming with Google in the last few minutes (the only
    // way for an account that has no password). The password counts towards
    // the same lockout as sign-in, so this can't be used to guess it.
    const now = Date.now();
    const current = await currentSession(request);
    const confirmedWithGoogle = current ? recentlyReauthenticated(current.session, now) : false;

    if (!confirmedWithGoogle) {
      const body = z
        .object({ password: z.string().max(200).optional() })
        .safeParse(request.body ?? {});
      const password = body.success ? body.data.password : undefined;
      const account = current?.user;
      if (!account?.password_hash) {
        return reply.code(403).send({
          error: 'reauth_required',
          message: 'Confirm with Google to delete your account.',
        });
      }
      if (!password) {
        return reply
          .code(403)
          .send({ error: 'reauth_required', message: 'Enter your password to delete your account.' });
      }
      const lock = await loginLockout(email, now);
      if (lock.locked) {
        return reply.code(429).send({
          error: 'too_many_attempts',
          message: `Too many attempts. Try again in ${formatWait(lock.retryAtMs!, now)}.`,
        });
      }
      if (!(await verifyPassword(password, account.password_hash))) {
        await recordLoginFailure(email, now);
        return reply.code(403).send({ error: 'reauth_failed', message: 'That password is incorrect.' });
      }
    }

    await database.transaction(async (tx) => {
      for (const table of ['study_sets', 'ai_usage', 'password_resets', 'sessions']) {
        await tx.run(`DELETE FROM ${table} WHERE user_id = ?`, id);
      }
      await tx.run('DELETE FROM login_attempts WHERE email = ?', email);
      await tx.run('DELETE FROM users WHERE id = ?', id);
    });
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  /* ---------------------------------------------------------------- */
  /* Password reset                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Step one: ask for a link.
   *
   * The response is identical whether or not the address has an account —
   * otherwise this becomes the account-enumeration oracle that sign-in was
   * carefully written to avoid. That means a user who mistypes their email is
   * told "check your inbox" and nothing arrives, which is the accepted cost of
   * not confirming to a stranger who banks here.
   *
   * Limited to 5 per 15 minutes because each call sends real mail: unthrottled
   * it is both a spam cannon aimed at an arbitrary inbox and a bill.
   */
  app.post(
    '/api/auth/forgot',
    {
      config: {
        rateLimit: { max: env.NODE_ENV === 'test' ? 10_000 : 5, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const parsed = z
        .object({ email: z.string().trim().toLowerCase().email().max(200) })
        .safeParse(request.body);

      // Even a malformed address gets the generic answer — a 400 here would
      // still distinguish "not a real address" from "no account".
      const generic = {
        ok: true,
        message: 'If that email has an account, a reset link is on its way.',
      };
      if (!parsed.success) return reply.send(generic);

      const { email } = parsed.data;
      const now = Date.now();
      const row = await database.get<Pick<UserRow, 'id' | 'email'>>(
        'SELECT id, email FROM users WHERE email = ?',
        email,
      );

      if (row) {
        const token = await createResetToken(row.id, now);
        // HashRouter: the client route lives after the '#'.
        const resetUrl = `${env.APP_URL}/#/reset?token=${encodeURIComponent(token)}`;
        try {
          const delivery = await sendPasswordResetEmail(row.email, resetUrl, RESET_TTL_MINUTES);
          request.log.info({ email, delivery }, 'password reset link issued');
        } catch (err) {
          // Still answer generically: a delivery failure must not become a way
          // to probe which addresses exist. Logged loudly for the operator.
          request.log.error({ err, email }, 'failed to deliver password reset email');
        }
      }

      await pruneResetTokens(now);
      return reply.send(generic);
    },
  );

  /**
   * Step two: redeem the link and set a new password.
   *
   * Deliberately *not* returned to the caller anywhere: the raw token. It is
   * only ever printed to the server console (dev) or mailed (production). An
   * earlier draft returned it in this response when mail was unconfigured,
   * which would have handed anyone a reset link for any address on a server
   * deployed without NODE_ENV set — since that variable defaults to
   * 'development', a single missing env var would have meant total takeover.
   */
  app.post(
    '/api/auth/reset',
    {
      config: {
        rateLimit: { max: env.NODE_ENV === 'test' ? 10_000 : 10, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const parsed = z
        .object({
          token: z.string().min(1).max(200),
          password: z
            .string()
            .min(8, 'Use at least 8 characters.')
            .max(200, 'That password is too long.'),
        })
        .safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: parsed.error.issues[0]?.message ?? 'Check your details.',
        });
      }

      const now = Date.now();
      const userId = await resolveResetToken(parsed.data.token, now);
      if (!userId) {
        return reply.code(400).send({
          error: 'invalid_token',
          message: 'This reset link is invalid or has expired. Please request a new one.',
        });
      }

      const row = await database.get<UserRow>('SELECT * FROM users WHERE id = ?', userId);
      if (!row) {
        return reply.code(400).send({
          error: 'invalid_token',
          message: 'This reset link is invalid or has expired. Please request a new one.',
        });
      }

      const passwordHash = await hashPassword(parsed.data.password);
      // One transaction: the new password, the spent link, and the end of every
      // existing session. A reset is often a response to a stolen login, and a
      // stolen cookie must stop working the moment the password changes.
      await database.transaction(async (tx) => {
        await tx.run('UPDATE users SET password_hash = ? WHERE id = ?', passwordHash, userId);
        await consumeResetToken(parsed.data.token, now, tx);
        await endAllSessions(userId, tx);
      });

      // Someone who just proved control of the inbox shouldn't still be serving
      // out a lockout earned by forgetting the old password.
      await clearLoginFailures(row.email);

      // Sign them straight in: they've demonstrated ownership, and bouncing
      // them to a login form to retype the password they just chose is friction
      // for no security gain.
      await startSession(reply, row.id, now);
      return reply.send({ user: publicUser(row) });
    },
  );
}
