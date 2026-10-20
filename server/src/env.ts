import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import { z } from 'zod';

config();

// Users paste keys into Notepad — tolerate stray spaces/quotes around them.
const cleanSecret = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim().replace(/^["']|["']$/g, '').trim();
    return t && t.length > 0 ? t : undefined;
  });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().url().default('http://localhost:5174'),
  // Addresses of the reverse proxies in front of the server (see `trustProxy`).
  TRUST_PROXY: z.string().optional(),
  GEMINI_API_KEY: cleanSecret,
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  // Fallback: any OpenAI-compatible provider (Groq, OpenRouter, …).
  OPENAI_COMPAT_API_KEY: cleanSecret,
  // Common alias people use for the same thing.
  GROQ_API_KEY: cleanSecret,
  OPENAI_COMPAT_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  OPENAI_COMPAT_MODEL: z.string().default('llama-3.3-70b-versatile'),
  JWT_SECRET: z.string().optional(),
  DATABASE_PATH: z.string().default('data/lumina.db'),
  // A Turso database (libsql://…) for when the server runs as stateless
  // functions with no disk of its own, e.g. on Vercel. Leave empty to use the
  // local SQLite file at DATABASE_PATH.
  DATABASE_URL: cleanSecret,
  DATABASE_AUTH_TOKEN: cleanSecret,
  // --- Password-reset email ---
  // Optional: with no key the reset link is logged to the server console
  // instead of emailed, so local development works with nothing to configure.
  RESEND_API_KEY: cleanSecret,
  MAIL_FROM: z.string().default('Lumina Study <onboarding@resend.dev>'),
  // Base URL the reset link points at — must be where the app is served from.
  // On Vercel it can be left unset: see `appUrl` below.
  APP_URL: z.string().url().optional(),
  // Set by Vercel itself on every deployment: bare hostnames, no https://.
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  // --- Sign in with Google (optional) ---
  // An OAuth client of type "Web application" from Google Cloud. Without both,
  // the Google button is simply not offered.
  GOOGLE_CLIENT_ID: cleanSecret,
  GOOGLE_CLIENT_SECRET: cleanSecret,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

// JWT secret is required to sign sessions. In production we refuse to start
// without a strong one (fail closed). In dev we generate an ephemeral secret
// so you can run immediately — sessions just won't survive a restart.
let jwtSecret = raw.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (raw.NODE_ENV === 'production') {
    console.error('JWT_SECRET must be set to a strong value (32+ chars) in production.');
    process.exit(1);
  }
  jwtSecret = randomBytes(48).toString('base64url');
  console.warn('[env] JWT_SECRET not set — using an ephemeral dev secret (logins reset on restart).');
}

/**
 * Proxies to trust when working out the client's IP, which every rate limit is
 * keyed on. Behind the host's proxy the socket address is the proxy's, so
 * trusting none puts every user in one shared bucket; trusting everything lets
 * a client pick its own IP by sending X-Forwarded-For.
 *
 * Trust is by the proxy's *address*: Fastify walks X-Forwarded-For from the
 * right and stops at the first address outside these ranges, which is the
 * client. A client can prepend whatever it likes; the walk never reaches it.
 * (A hop count can't work — Fastify 5.12 ignores one, since it cannot check
 * that the immediate peer really is a proxy.)
 *
 * Production defaults to the private ranges a platform's internal proxy
 * connects from, CGNAT included. Nothing on the public internet can reach the
 * container from one of those. Development trusts nothing.
 */
const PRIVATE_RANGES = ['loopback', 'linklocal', 'uniquelocal', '100.64.0.0/10'];
const trustProxyList = raw.TRUST_PROXY?.split(',')
  .map((v) => v.trim())
  .filter(Boolean);
// `all` is only for hosts whose edge overwrites X-Forwarded-For with the real
// client address, so no client value ever reaches the server — Vercel does
// this. Anywhere else it would let a client choose its own IP.
const trustProxy: string[] | boolean =
  trustProxyList?.[0] === 'all'
    ? true
    : trustProxyList?.length
      ? trustProxyList
      : raw.NODE_ENV === 'production'
        ? PRIVATE_RANGES
        : false;

// A remote Turso database refuses every query without its token. Fail at boot
// with a clear message rather than on the first request.
if (raw.DATABASE_URL?.startsWith('libsql://') && !raw.DATABASE_AUTH_TOKEN) {
  console.error('DATABASE_AUTH_TOKEN must be set to use the Turso database in DATABASE_URL.');
  process.exit(1);
}

/** `https://` plus a hostname Vercel provides, or undefined off Vercel. */
function vercelOrigin(host: string | undefined): string | undefined {
  return host ? `https://${host}` : undefined;
}

/**
 * Where the app is served from: reset links, Google's redirect and the
 * cross-site check all depend on it. An explicit APP_URL wins; on Vercel the
 * project's production address is known without being told, so a first deploy
 * works before anyone has seen the URL it will get.
 */
const appUrl =
  raw.APP_URL ?? vercelOrigin(raw.VERCEL_PROJECT_PRODUCTION_URL) ?? 'http://localhost:3001';

// GROQ_API_KEY is an accepted alias for OPENAI_COMPAT_API_KEY.
const compatKey = raw.OPENAI_COMPAT_API_KEY ?? raw.GROQ_API_KEY;

export const env = {
  ...raw,
  APP_URL: appUrl,
  OPENAI_COMPAT_API_KEY: compatKey,
  JWT_SECRET: jwtSecret,
  trustProxy,
  /** Which provider to use: OpenAI-compatible wins when its key is set. */
  aiProvider: (compatKey ? 'openai-compat' : 'gemini') as 'openai-compat' | 'gemini',
  /** True when any provider has a usable key. */
  aiEnabled: Boolean(
    (compatKey && compatKey.length > 10) ||
      (raw.GEMINI_API_KEY && raw.GEMINI_API_KEY.length > 10),
  ),
  /**
   * True when reset emails can actually be sent. When false the server still
   * issues valid reset links — it just prints them to the console instead of
   * mailing them, which keeps local development working with no signup.
   */
  mailEnabled: Boolean(raw.RESEND_API_KEY && raw.RESEND_API_KEY.length > 10),
  /** True when Sign in with Google is configured. */
  googleSignIn: Boolean(raw.GOOGLE_CLIENT_ID && raw.GOOGLE_CLIENT_SECRET),
  /**
   * Where Google sends the browser back. Built from APP_URL, never from the
   * request's Host header, which the client controls. Google matches it
   * character for character against the client's registered redirect URIs.
   */
  googleRedirectUri: new URL('/api/auth/google/callback', appUrl).toString(),
} as const;
