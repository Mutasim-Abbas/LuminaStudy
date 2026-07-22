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
  // --- Password-reset email ---
  // Optional: with no key the reset link is logged to the server console
  // instead of emailed, so local development works with nothing to configure.
  RESEND_API_KEY: cleanSecret,
  MAIL_FROM: z.string().default('Lumina Study <onboarding@resend.dev>'),
  // Base URL the reset link points at — must be where the app is served from.
  APP_URL: z.string().url().default('http://localhost:3001'),
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

// GROQ_API_KEY is an accepted alias for OPENAI_COMPAT_API_KEY.
const compatKey = raw.OPENAI_COMPAT_API_KEY ?? raw.GROQ_API_KEY;

export const env = {
  ...raw,
  OPENAI_COMPAT_API_KEY: compatKey,
  JWT_SECRET: jwtSecret,
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
} as const;
