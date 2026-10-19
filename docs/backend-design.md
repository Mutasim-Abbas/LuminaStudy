# Lumina Study — backend, API and database design

Status: **proposal**, 2026-10-19. Builds on the server that already exists in
`server/` — this is not a rewrite. Database decision: **SQLite on a Railway
volume for now** (see §2 for when that should change).

## 1. Where it stands today

The backend already exists and is well tested (62 tests): Fastify 5, SQLite via
`node:sqlite`, Zod on every route, scrypt passwords, JWT in an httpOnly cookie,
CAPTCHA + honeypot on sign-up, per-account login lockout, a 3/day AI quota, and
password reset by email.

What it **does not** cover is most of the user's data. Only study sets reach the
server. Everything else lives in one browser's `localStorage` and is lost on a
new device, a cleared browser, or a phone:

| localStorage key           | What it is                          | On the server?                                                                    |
| -------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `lumina.studySets`         | Sets: cards, quiz, summary          | Yes                                                                               |
| `lumina.srs`               | Spaced-repetition schedule per card | **No**                                                                            |
| `lumina.activity`          | Streak, heatmap, totals             | **No**                                                                            |
| `lumina.planner.semesters` | Degree planner                      | **No**                                                                            |
| `lumina.calc.*`            | Grade calculator                    | **No**                                                                            |
| `lumina.userName`          | Display name edits                  | **No** — the sign-up name is on the server, but renaming only changes this device |

So a student who reviews on their phone and then opens their laptop sees every
card due again, a broken streak and an empty planner. That is the main thing
this design fixes.

### Bugs found while reading the code

1. **Rate limits are shared by every user once deployed.** `trustProxy: false`
   in `server/src/app.ts` means behind Railway's proxy every request carries the
   proxy's IP. The login limit (10 per 5 min) and generation limit then apply to
   _all users combined_.
2. **A password reset does not sign the attacker out.** Sessions are stateless
   JWTs valid for 7 days. Resetting a compromised password leaves the stolen
   cookie working until it expires. Same for "sign out" — it only clears the
   cookie on this device.
3. **Deleted sets can come back.** `POST /api/sets/sync` upserts whatever a
   device has locally. A set deleted on device A is re-created when device B,
   which still has it cached, signs in.
4. **Two devices silently overwrite each other.** `PUT /api/sets/:id` is
   last-write-wins on the whole document, with no version check.
5. **CI never runs the server tests.** `.github/workflows/deploy.yml` only
   type-checks and tests the frontend.

## 2. Architecture

```
 Browser (React SPA, local-first)
   │  same origin, httpOnly session cookie
   ▼
 Railway container — one Node 24 process (Fastify)
   ├── /api/*        JSON API
   ├── /             built frontend (static)
   ├── Groq          AI generation (server-side key)
   ├── Resend        password-reset email (verified domain)
   └── SQLite        /data/lumina.db on a Railway volume
          │
          └── Litestream → S3-compatible bucket (continuous backup)
```

Decisions:

- **One service serving API + frontend** stays. It keeps the cookie first-party,
  needs no CORS in production, and is one thing to deploy.
- **SQLite stays.** It is already built, tested and fast; at launch scale one
  file on one volume is plenty. What it does not give for free is backups, so
  Litestream streams every write to object storage and can restore the file on
  a fresh volume.
- **Exactly one instance.** A volume attaches to one container, so the app
  cannot scale out, and a redeploy has a few seconds of downtime while the
  volume moves to the new container. Both are acceptable at launch. The
  in-memory CAPTCHA store and rate-limit counters are fine for the same reason.
- **Local-first stays.** The app keeps working offline from localStorage. The
  server becomes the durable copy and the thing that merges devices.

**When to move to Postgres:** when a second instance is needed (traffic, or
zero-downtime deploys), or when backup/restore through Litestream becomes the
painful part. The schema below sticks to portable types so that move stays
mechanical.

## 3. Database (SQLite)

Conventions, matching what is already there: times are `INTEGER` epoch ms (the
API and frontend already speak epoch ms); JSON is stored as `TEXT`; booleans
are `INTEGER` 0/1; ids are `TEXT` — client-generated for anything a device can
create offline (sets, events), `randomUUID()` otherwise. Every user-owned table
has `user_id … ON DELETE CASCADE`, so deleting an account deletes everything.
`foreign_keys = ON` and WAL mode are already set per connection.

### Existing tables (changes marked NEW)

```sql
CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,          -- stored lower-cased
  name           TEXT NOT NULL DEFAULT '',
  password_hash  TEXT NOT NULL,
  token_version  INTEGER NOT NULL DEFAULT 0,    -- NEW: bump to revoke all sessions
  created_at     INTEGER NOT NULL
);

CREATE TABLE study_sets (
  id           TEXT PRIMARY KEY,                -- client-generated
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject      TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  data         TEXT NOT NULL,                   -- JSON: { cards, quiz, summary, highlights }
  mastery      INTEGER NOT NULL DEFAULT 0,
  version      INTEGER NOT NULL DEFAULT 1,      -- NEW: optimistic concurrency
  deleted_at   INTEGER,                         -- NEW: tombstone, so deletes sync
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_study_sets_user ON study_sets(user_id, updated_at DESC);

CREATE TABLE ai_usage (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model              TEXT NOT NULL DEFAULT '',  -- NEW
  input_chars        INTEGER NOT NULL DEFAULT 0,-- NEW
  prompt_tokens      INTEGER,                   -- NEW: cost tracking
  completion_tokens  INTEGER,                   -- NEW
  created_at         INTEGER NOT NULL
);

-- login_attempts and password_resets: unchanged.
```

Sets stay one document (`data`). The app always reads and writes a set whole,
cards are never queried on their own, and per-card state lives in
`card_schedules` below — so splitting cards into rows would add joins and buy
nothing.

### New tables

```sql
-- Spaced-repetition state, one row per card. Replaces localStorage `lumina.srs`.
CREATE TABLE card_schedules (
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id            TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
  card_id           TEXT NOT NULL,
  ease              REAL NOT NULL,
  interval_days     REAL NOT NULL,
  repetitions       INTEGER NOT NULL,
  lapses            INTEGER NOT NULL,
  due_at            INTEGER NOT NULL,
  last_reviewed_at  INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (user_id, set_id, card_id)
);
CREATE INDEX idx_card_schedules_sync ON card_schedules(user_id, updated_at);
```

