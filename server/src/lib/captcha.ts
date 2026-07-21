import { randomUUID } from 'node:crypto';
import svgCaptcha from 'svg-captcha';

/**
 * A real CAPTCHA: the server draws a distorted code into an SVG, keeps the
 * answer, and hands the client only an opaque token plus the image. To pass,
 * the client must send back the token and the characters a human read off the
 * picture. The answer never reaches the browser, so it can't be scraped — a
 * bot has to actually solve the image.
 *
 * Challenges live in memory with a short TTL and are single-use (consumed on
 * the first check, right or wrong), which stops one solved image from being
 * replayed across many sign-ups. In-memory is fine for a single instance; a
 * multi-instance deploy would move this to Redis.
 */

interface Challenge {
  answer: string;
  expiresAt: number;
}

const store = new Map<string, Challenge>();

const TTL_MS = 5 * 60 * 1000;
/** Cap the map so a flood of GETs can't grow memory without bound. */
const MAX_OPEN = 5000;

export interface CaptchaChallenge {
  token: string;
  svg: string;
}

function sweep(now: number): void {
  for (const [token, c] of store) {
    if (c.expiresAt <= now) store.delete(token);
  }
}

export function createCaptcha(now: number): CaptchaChallenge {
  sweep(now);
  if (store.size >= MAX_OPEN) {
    // Drop the oldest to make room rather than refuse new users.
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }

  const captcha = svgCaptcha.create({
    size: 5, // characters
    noise: 3, // interfering lines
    ignoreChars: '0o1ilI', // drop glyphs that are ambiguous to a human
    color: true,
    background: '#f2f0f7',
  });

  const token = randomUUID();
  // Compared case-insensitively, so store the answer folded once.
  store.set(token, { answer: captcha.text.toLowerCase(), expiresAt: now + TTL_MS });
  return { token, svg: captcha.data };
}

/**
 * Verify and consume a challenge. Returns true only for a live token whose
 * answer matches. The token is deleted whatever the outcome, so a wrong guess
 * forces a fresh image and a correct one can't be reused.
 */
export function verifyCaptcha(token: string | undefined, guess: string | undefined, now: number): boolean {
  if (!token || !guess) return false;
  const challenge = store.get(token);
  if (!challenge) return false;
  store.delete(token); // single-use, always
  if (challenge.expiresAt <= now) return false;
  return challenge.answer === guess.trim().toLowerCase();
}

/** Test helper — the answer for a token, without consuming it. */
export function peekCaptchaAnswer(token: string): string | undefined {
  return store.get(token)?.answer;
}
