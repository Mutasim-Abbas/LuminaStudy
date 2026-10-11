import { randomUUID } from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import { database } from '../db.js';

/**
 * A real CAPTCHA: the server draws a distorted code into an SVG, keeps the
 * answer, and hands the client only an opaque token plus the image. To pass,
 * the client must send back the token and the characters a human read off the
 * picture. The answer never reaches the browser, so it can't be scraped — a
 * bot has to actually solve the image.
 *
 * Answers live in the database (captcha_challenges), not in memory: on a
 * stateless deploy the image and the sign-up can be served by different
 * instances. Each challenge is short-lived and single-use — consumed by the
 * first check, right or wrong — so one solved image can't be replayed across
 * many sign-ups, even by two requests racing on two instances.
 */

const TTL_MS = 5 * 60 * 1000;

export interface CaptchaChallenge {
  token: string;
  svg: string;
}

export async function createCaptcha(now: number): Promise<CaptchaChallenge> {
  const captcha = svgCaptcha.create({
    size: 5, // characters
    noise: 3, // interfering lines
    ignoreChars: '0o1ilI', // drop glyphs that are ambiguous to a human
    color: true,
    background: '#f2f0f7',
  });

  const token = randomUUID();
  // Compared case-insensitively, so store the answer folded once.
  await database.run(
    'INSERT INTO captcha_challenges (token, answer, expires_at) VALUES (?, ?, ?)',
    token,
    captcha.text.toLowerCase(),
    now + TTL_MS,
  );
  // Housekeeping on the way: drop challenges nobody answered in time.
  await database.run('DELETE FROM captcha_challenges WHERE expires_at <= ?', now);
  return { token, svg: captcha.data };
}

/**
 * Verify and consume a challenge. Returns true only for a live token whose
 * answer matches. The row is deleted whatever the outcome, in the same
 * statement that reads it, so of two simultaneous checks only one can see it.
 */
export async function verifyCaptcha(
  token: string | undefined,
  guess: string | undefined,
  now: number,
): Promise<boolean> {
  if (!token || !guess) return false;
  const challenge = await database.get<{ answer: string; expires_at: number }>(
    'DELETE FROM captcha_challenges WHERE token = ? RETURNING answer, expires_at',
    token,
  );
  if (!challenge) return false;
  if (challenge.expires_at <= now) return false;
  return challenge.answer === guess.trim().toLowerCase();
}

/** Test helper — the answer for a token, without consuming it. */
export async function peekCaptchaAnswer(token: string): Promise<string | undefined> {
  const row = await database.get<{ answer: string }>(
    'SELECT answer FROM captcha_challenges WHERE token = ?',
    token,
  );
  return row?.answer;
}
