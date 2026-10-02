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

-- Append-only study log. Replaces the counters in `lumina.activity`.
-- The id is generated on the device, so retrying an upload can never
-- double-count (INSERT … ON CONFLICT DO NOTHING).
CREATE TABLE study_events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('card_review', 'quiz_answer', 'study_time')),
  set_id       TEXT,                            -- no FK: history outlives a deleted set
  card_id      TEXT,
  grade        TEXT CHECK (grade IN ('again', 'hard', 'good', 'easy')),
  correct      INTEGER,                         -- 0/1, quiz answers only
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  local_day    TEXT NOT NULL,                   -- 'YYYY-MM-DD', the student's own day
  occurred_at  INTEGER NOT NULL
);
CREATE INDEX idx_study_events_day ON study_events(user_id, local_day);

-- Small per-user documents edited as a whole: degree planner, grade calculator,
-- preferences. Same versioning as sets.
CREATE TABLE user_documents (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL CHECK (key IN ('planner', 'grade_calc', 'preferences')),
  data        TEXT NOT NULL,                    -- JSON
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
```

Why an event log for activity instead of synced counters: counters from two
devices cannot be merged correctly (both say "12 reviews today" — is that 12 or
24?). Events merge by union, and the streak, heatmap and totals become a
`GROUP BY local_day`. `local_day` is recorded by the device because "today"
means the student's day, not the server's UTC day.

### Migrations

Replace `CREATE TABLE IF NOT EXISTS` + `addColumnIfMissing` with an ordered list
of migrations, numbered by SQLite's built-in `PRAGMA user_version`. On boot the
server applies every migration above the stored number, each in its own
transaction, then bumps the number. No extra table, and a half-applied migration
rolls back instead of leaving the schema in between.

## 4. API

Unchanged conventions: JSON bodies, Zod validation, errors as
`{ error: <code>, message: <human text> }`, session cookie on every call, every
query scoped by the session's user id. No `/v1` prefix — frontend and API ship
in the same deploy, so they can never be out of step.

### Auth — `/api/auth`

| Method | Path          | Status   | Notes                                                                         |
| ------ | ------------- | -------- | ----------------------------------------------------------------------------- |
| GET    | `/captcha`    | existing |                                                                               |
| POST   | `/signup`     | existing |                                                                               |
| POST   | `/login`      | existing |                                                                               |
| POST   | `/logout`     | existing |                                                                               |
| POST   | `/logout-all` | **new**  | Bumps `token_version`; every other device is signed out                       |
| GET    | `/me`         | existing |                                                                               |
| PATCH  | `/me`         | **new**  | `{ name }` — replaces `lumina.userName`                                       |
| DELETE | `/me`         | changed  | Now requires `{ password }`, so an unattended laptop can't delete the account |
| POST   | `/forgot`     | existing |                                                                               |
| POST   | `/reset`      | changed  | Also bumps `token_version` — fixes bug 2                                      |
| GET    | `/export`     | **new**  | Everything the account owns as one JSON download (privacy-policy requirement) |

Session JWT gains a `ver` claim; `requireAuth` rejects a token whose `ver` is
below the user's `token_version`. That is one primary-key lookup per request —
microseconds on local SQLite.

### Sync — `/api/sync`

One pull endpoint instead of one per data type, so a device catches up in a
single request on open:

```
GET /api/sync?since=<cursor>
→ {
    cursor: 1792417460285,               // server epoch ms — pass back next time
    sets:        [ …changed sets… ],
    deletedSets: [ "set-id", … ],          // tombstones — fixes bug 3
    schedules:   [ …changed card_schedules… ],
    documents:   { planner?: {data, version}, grade_calc?: …, preferences?: … }
  }
```

No `since` means "everything" (first sign-in on a device). The cursor is the
server's own clock, never the device's.

### Study sets — `/api/sets`

| Method | Path    | Status   | Notes                                                                                                                                  |
| ------ | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`     | existing | Kept for simple reads                                                                                                                  |
| PUT    | `/:id`  | changed  | Send `If-Match: <version>`. Stale version → `409 { error: 'conflict', current }` so the client can keep both or pick one — fixes bug 4 |
| POST   | `/sync` | changed  | First-sign-in import. Skips ids that have a tombstone                                                                                  |
| DELETE | `/:id`  | changed  | Sets `deleted_at` instead of removing the row                                                                                          |

### Reviews and activity

| Method | Path                      | Notes                                                                                                                                                                                                                         |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/events`             | Batch of up to 500 `study_events`. For `card_review` events the body also carries the card's new schedule, and both are written in one transaction. Idempotent by event id, so the client can flush its offline queue blindly |
| GET    | `/api/activity?from=&to=` | Per-day counts, lifetime totals and current streak, computed from `study_events`                                                                                                                                              |

### Documents — `/api/documents/:key`

| Method | Path    | Notes                                             |
| ------ | ------- | ------------------------------------------------- |
| GET    | `/:key` | `planner`, `grade_calc` or `preferences`          |
| PUT    | `/:key` | `If-Match: <version>`; same 409 behaviour as sets |

### AI — `/api/generate` (existing, unchanged shape)

`GET /quota` and `POST /` stay. Internally each call now records model and
token counts in `ai_usage`, so cost per user is visible.

## 5. Client sync model

1. **Open the app:** render from localStorage immediately, then
   `GET /api/sync?since=<last cursor>` and merge.
2. **Change something:** write to localStorage first, then push in the
   background (`PUT /api/sets/:id`, `POST /api/events`, `PUT /api/documents/:key`).
   Failed pushes go into a queue in localStorage and retry on the next
   `online` event or app open.
3. **Merge rules:** sets and documents use versions (conflict → ask);
   schedules are per card, newest `last_reviewed_at` wins; events are a union.

## 6. Operations

- **Hosting:** Railway container (Dockerfile exists), one replica, volume at
  `/data`.
- **Client IPs:** the server trusts proxies by address (`TRUST_PROXY`, default
  private ranges in production, none otherwise) — fixes bug 1 without letting a
  client spoof its IP through `X-Forwarded-For`.
- **Backups:** Litestream runs alongside the server in the container and
  replicates `lumina.db` to an S3-compatible bucket (Cloudflare R2, Backblaze
  B2 or S3). On boot, if the volume is empty, it restores the latest copy
  first. Test a restore before launch — an untested backup is not a backup.
- **Tests:** unchanged — `node:sqlite` with `:memory:`, zero setup. CI gets a
  server job — fixes bug 5.
- **Housekeeping:** expired `login_attempts` and `password_resets` are already
  pruned on each login / reset request. The new `study_events` table grows
  forever by design; a few hundred bytes per review is fine for years.
- **Monitoring:** Sentry (or similar) for errors; Fastify's structured logs go
  to Railway's log view.

## 7. Build order

Each step is a separate, shippable change:

1. Fix proxy trust, add server tests to CI, apply the `npm audit` fixes.
2. Versioned migrations via `PRAGMA user_version`; Litestream in the image.
3. `token_version`: revoke on reset, `logout-all`, password-confirmed delete.
4. Set versions + tombstones + `GET /api/sync`.
5. `card_schedules` + `study_events` + `/api/events` + `/api/activity`, and
   switch the frontend's SRS/activity from localStorage-only to synced.
6. `user_documents` for planner, grade calculator and name.
7. `/api/auth/export`, then deploy (Railway + bucket + Resend domain).
