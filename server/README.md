# Lumina Study — Backend

The Fastify server behind Lumina Study: accounts, cloud-synced study sets, and
the AI generation proxy. The AI provider key lives **server-side only** — the
browser talks to `/api/*` and never to the provider directly.

## API

**Auth**

| Endpoint                 | Method | Description                                     |
| ------------------------ | ------ | ----------------------------------------------- |
| `/api/auth/captcha`      | GET    | Fresh CAPTCHA image + single-use token          |
| `/api/auth/signup`       | POST   | Create an account (name, email, password, CAPTCHA) |
| `/api/auth/login`        | POST   | Sign in (5 attempts, then 15-minute lockout)    |
| `/api/auth/logout`       | POST   | Clear the session cookie                        |
| `/api/auth/me`           | GET    | Current session, or `null`                      |
| `/api/auth/me`           | DELETE | Delete the account and everything it owns       |
| `/api/auth/forgot`       | POST   | Request a reset link (same reply for any email) |
| `/api/auth/reset`        | POST   | Redeem a reset token and set a new password     |

**Study sets** (session required)

| Endpoint             | Method | Description                                  |
| -------------------- | ------ | -------------------------------------------- |
| `/api/sets`          | GET    | List the account's sets                      |
| `/api/sets/:id`      | PUT    | Create or update a set                       |
| `/api/sets/sync`     | POST   | Bulk-push local sets into the account        |
| `/api/sets/:id`      | DELETE | Delete a set                                 |

**AI generation** (session required)

| Endpoint              | Method | Description                                        |
| --------------------- | ------ | -------------------------------------------------- |
| `/api/generate`       | POST   | Notes → flashcards + quiz + summary + highlights   |
| `/api/generate/quota` | GET    | Free generations remaining (3 per rolling 24h)     |

**Misc**

| Endpoint      | Method | Description                                 |
| ------------- | ------ | ------------------------------------------- |
| `/api/health` | GET    | Liveness + whether AI is configured         |

In production builds the server also serves the compiled frontend from `/`, so
the whole app runs from one process on one port.

## Storage

SQLite via Node's built-in `node:sqlite` (no native compilation), WAL mode,
foreign keys on. Tables: `users`, `study_sets`, `ai_usage` (sliding-window
generation quota), `login_attempts` (per-account lockout), `password_resets`
(hashed single-use reset tokens). Additive schema
changes are applied as migrations at startup, so existing databases upgrade in
place.

## Security

- **Key isolation** — the provider key is read from `.env` (git-ignored) on the
  server only.
- **Passwords** — scrypt with a per-user salt, constant-time verification.
- **Sessions** — JWTs (pinned algorithm, 7-day expiry) in httpOnly,
  SameSite=Lax cookies.
- **Sign-up** — server-generated image CAPTCHA with single-use, server-held
  answers, plus a honeypot field.
- **Sign-in** — per-account lockout after 5 failures; identical responses and
  matched hashing work for unknown emails, so the endpoint reveals nothing
  about which accounts exist.
- **Password reset** — tokens are 32 CSPRNG bytes stored only as a SHA-256
  hash, single-use, 30-minute expiry, and invalidated when a newer link is
  issued. The request endpoint answers identically for every address, so it
  reveals nothing about which emails have accounts, and a successful reset
  clears any outstanding sign-in lockout.
- **Isolation** — every study-set query is scoped by the session's user id;
  cross-account access is covered by dedicated tests.
- **Validation & limits** — Zod on every body, per-route rate limits, a
  per-account AI usage quota, Helmet headers, CORS locked to the app origin,
  and an error handler that never leaks internals.

## Setup

```bash
cd server
cp .env.example .env   # then paste your Groq key into server/.env
npm install
npm run dev            # http://localhost:3001
```

Get a free Groq API key at https://console.groq.com/keys.

## Scripts

| Command             | What it does                     |
| ------------------- | -------------------------------- |
| `npm run dev`       | Start with hot-reload            |
| `npm run build`     | Compile TypeScript to `dist/`    |
| `npm start`         | Run the compiled server          |
| `npm test`          | Test suite (in-memory database)  |
| `npm run typecheck` | Type-check without emitting      |
