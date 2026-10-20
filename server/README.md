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
| `/api/auth/logout`       | POST   | End this browser's session                      |
| `/api/auth/logout-all`   | POST   | End every session of the account, everywhere    |
| `/api/auth/me`           | GET    | Current session, or `null`                      |
| `/api/auth/me`           | DELETE | Delete the account and everything it owns — needs `{ password }`, or a Google confirmation in the last 5 minutes |
| `/api/auth/forgot`       | POST   | Request a reset link (same reply for any email) |
| `/api/auth/reset`        | POST   | Redeem a reset token and set a new password     |
| `/api/auth/google`       | GET    | Start Sign in with Google (`?link=1` connects it to the signed-in account; `?confirm=1` re-confirms it before deleting) |
| `/api/auth/google/callback` | GET | Where Google returns; signs in, creates or links the account |

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

All database access goes through one async interface (`src/lib/database.ts`)
with two backends that pass the same contract test suite:

- **Turso** (`libsqlDatabase.ts`, `@libsql/client`) when `DATABASE_URL` is set —
  the production setup on Vercel, where the API is a stateless function with no
  disk of its own.
- **Local SQLite** (`sqliteDatabase.ts`, Node's built-in `node:sqlite`)
  otherwise — development, tests, and the Docker image. WAL mode, foreign keys
  on, `synchronous = NORMAL`, and a 5-second busy timeout so writes wait out
  Litestream's checkpoints instead of failing.

On both, a transaction makes this process's other database calls wait until
it finishes, so a concurrent request's write can never be rolled back with it.
Account deletion clears every table explicitly instead of relying on
`ON DELETE CASCADE`, because Turso ships with foreign keys off.

Tables: `users`, `study_sets`, `ai_usage` (sliding-window generation quota),
`login_attempts` (per-account lockout), `password_resets` (hashed single-use
reset tokens), `captcha_challenges` (sign-up CAPTCHA answers — in the database
rather than memory so any instance can check them).

**Migrations.** The schema lives in `src/migrations.ts` as a numbered list, and
the database's version in SQLite's own `PRAGMA user_version`. On startup the
server applies every migration above that number, each in one transaction with
its version bump, and logs what it ran. It refuses to open a database written
by a newer build. To change the schema, append a migration with the next
number — never edit one that has shipped, because live databases will not run
it again.

**Backups.** On Turso, backups are the provider's. In the container the server runs under Litestream
(`scripts/start.sh`, configured by `litestream.yml`), which streams every write
to a bucket and restores the database on boot if the volume is empty. Setup and
a restore drill are in [DEPLOY.md](../DEPLOY.md).

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
- **Sign in with Google** — server-side authorization-code flow with state,
  nonce and PKCE; the ID token's signature, issuer, audience, expiry and nonce
  are all checked, and the email must be Google-verified. Accounts are keyed on
  Google's stable account id. An email that already has a password account is
  never joined automatically — it is linked from the account page after a
  password sign-in.
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
