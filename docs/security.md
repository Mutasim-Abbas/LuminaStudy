# Lumina Study — security report

As of 2026-10-20. What protects the app, what was added in this round of work,
what a leak audit found, and what is still open.

**Bottom line:** no key, token or password has ever been committed or shipped
to the browser. Every account, session and AI endpoint is rate-limited and
validated, all data access is scoped to the signed-in user, and the server
keeps no state of its own, so it is safe to run as many instances as Vercel
starts. The open items are listed honestly in §4.

## 1. Work done in this round

| Area | Change | Why |
| --- | --- | --- |
| Rate limiting | Client IP taken from trusted proxy addresses (`TRUST_PROXY`), not the socket or a client header | Behind a host's proxy every user shared one sign-in limit; a header-based fix would let a client pick its own IP |
| CI | Server type-check, tests and build run on every push; tests run on both database backends; ShellCheck on the container script | A broken or insecure backend could previously ship with a green build |
| Dependencies | `npm audit fix` on both packages; production dependencies audit clean | High-severity issues in `fastify`, `find-my-way`, `react-router`, `pdfjs-dist` |
| Database | Versioned migrations; the server refuses a schema written by a newer build | Rolling back a deploy can't write old code's assumptions into a newer schema |
| Backups (container setup) | Litestream continuous backup, restore on an empty volume, refusal to start in production without a bucket | One disk was the only copy of every account |
| Sign in with Google | Full OpenID Connect flow with state, nonce and PKCE; see §2.3 | Added securely from the start |
| Accounts | Password sign-in refuses password-less (Google) accounts with the same timing and answer as a wrong password | No way to learn how an account was created |
| Stateless server | CAPTCHA answers moved from memory into the database, spent atomically (`DELETE … RETURNING`) | On many instances, two racing sign-ups could otherwise share one solved image |
| Account deletion | Every table cleared explicitly, in one transaction | Turso ships with foreign keys off; `ON DELETE CASCADE` alone would leave data behind |
| Transactions | Other calls wait while a transaction is open (both backends) | A concurrent request's write could otherwise be rolled back with it |
| AI errors | Users see a plain message; the provider's text goes to the server log | Groq's rate-limit errors name the organization; errors also hinted at how keys are configured |
| Deploy hygiene | `.vercelignore` for env files and local databases | Vercel's CLI skips `.env.local` but not `.env` |
| Logs | Request logs record the path only, no query string | Google's one-time authorization code arrives in the callback's query string |
| Local secrets | `server/.env` readable by the owner only (`chmod 600`) | Other accounts on the machine could read it |

## 2. Controls in place

### 2.1 Secrets and configuration

- All secrets come from environment variables. `.env` files are ignored by
  git, excluded from Docker builds (`.dockerignore`) and from Vercel CLI
  uploads (`.vercelignore`); only the empty `server/.env.example` is committed.
- The AI provider key exists only on the server. The browser calls `/api/*`
  and never the provider.
- In production the server refuses to boot without a strong `JWT_SECRET`
  (32+ characters), refuses a Turso URL without its token, and the container
  refuses to start without a backup bucket. Password-reset email has no
  console fallback in production.
- The key-check script prints only a key's first five characters.

### 2.2 Accounts and sessions

- Passwords: scrypt with a per-user salt, constant-time comparison, 8–200
  characters. Never stored or returned in plain text.
- Sessions: HS256 JWT with the algorithm pinned (no `alg: none` or algorithm
  confusion), 7-day expiry, in an `httpOnly`, `SameSite=Lax` cookie that is
  `Secure` in production. `/api/auth/me` reads the account from the database,
  so a deleted account stops looking signed in.
- Sign-up: server-drawn image CAPTCHA (answer held server-side, single-use,
  5-minute expiry) plus a hidden honeypot field.
- Sign-in: 5 failures per email, then a 15-minute lockout that survives IP
  changes. Unknown emails and wrong passwords get identical answers and the
  same hashing time, so the endpoint reveals nothing about which accounts
  exist.
- Password reset: 32 random bytes, stored only as a SHA-256 hash, single use,
  30-minute expiry, earlier links retired in the same transaction a new one is
  issued in. The request endpoint answers identically for every address. The
  token travels in the URL fragment, which browsers never send to the server.

### 2.3 Sign in with Google

- Authorization-code flow with `state` (stops login CSRF), PKCE (an intercepted
  code is useless) and `nonce` (a token can't be replayed into another
  sign-in). The three values live in a signed, `httpOnly`, 10-minute cookie
  scoped to the two Google routes and cleared after one use.
- The ID token is fully verified: Google's RS256 signature against its
  published keys, issuer, audience, expiry and nonce, and the email must be
  Google-verified. Key fetches are cached and refreshed at most once a minute,
  so forged key ids can't cause a flood of requests.
- Accounts are keyed on Google's permanent account id, not the email.
- An email that already has a password account is never joined automatically
  (pre-account-hijacking defence). Linking happens from the account page after
  a password sign-in, only if the same account is still signed in when Google
  returns, and one Google account can open only one Lumina account.
- The redirect URI is built from configuration, never from the request's Host
  header.

### 2.4 Abuse and rate limiting

| Endpoint | Limit per client IP |
| --- | --- |
| Everything | 100 per minute |
| Sign-up, sign-in | 10 per 5 minutes |
| CAPTCHA image | 30 per minute |
| Password-reset request | 5 per 15 minutes |
| Password-reset redeem | 10 per 15 minutes |
| Google sign-in | 20 per minute |
| AI generation | 10 per minute, and 3 per account per rolling 24 hours |

Client IPs come only from trusted proxies: private address ranges by default in
production, or `TRUST_PROXY=all` on Vercel, which overwrites `X-Forwarded-For`
itself. A failed AI request doesn't spend the user's daily quota.

### 2.5 Data access and integrity

- Every query uses bound `?` parameters; no user input is ever spliced into
  SQL.
- Every study-set query is scoped by the session's user id, never by an id
  from the request. An update `WHERE` clause stops one account overwriting
  another's set even with a guessed id. Covered by isolation tests.
- Zod validates every request body; bodies are capped at 1 MB.
- Writes that must happen together (bulk sync, account deletion, issuing a
  reset link, each migration) run in one transaction.

### 2.6 Errors, logs and responses

- A global error handler turns every unexpected error into a generic 500; stack
  traces stay server-side.
- AI provider failures show a plain sentence; the provider's message is logged.
- Request logs record method, path, host and IP — no query strings, cookies or
  bodies.
- Helmet sets hardened HTTP headers; CORS is locked to the app's own origin.

### 2.7 Frontend

- Reads no environment values and contains no keys; no source maps are
  shipped.
- The only raw HTML insertion is the CAPTCHA image, which the server itself
  generates.
- Session cookies are invisible to page scripts, so an XSS bug can't steal a
  login.

### 2.8 Infrastructure and supply chain

- Production dependencies audit clean. The one new runtime dependency,
  `@libsql/client` 0.18.0, was a release more than two weeks old when added.
- The Litestream binary in the Docker image is pinned by image digest, not
  just tag, since it reads every byte of user data.
- CI runs with minimal permissions and uses no secrets.
- Node 24 pinned for Vercel and CI.

### 2.9 How it is tested

- 151 server tests, run on both database backends: local SQLite and libSQL
  (Turso's client). They cover token forgery (expired, unsigned, wrong
  secret, `alg: none`), account isolation, lockout, quota, reset-token
  replay, CAPTCHA races, Google token forgery (wrong key, wrong audience or
  issuer, unsigned, HMAC confusion, expired, wrong nonce, unverified email),
  login CSRF on the Google callback, and AI error leaks.
- For key protections the tests were also run against deliberately broken
  code, to confirm they fail when the protection is missing: the proxy trust,
  the transaction queue on both backends, the atomic CAPTCHA check, explicit
  account deletion and AI error hiding. This caught one test that wasn't
  testing anything; it was rewritten.

## 3. Leak audit (2026-10-20)

| Checked | Result |
| --- | --- |
| All 180 commits, for API keys (Groq, Resend, Google, AWS, OpenAI, GitHub, Backblaze), private keys, JWTs and hard-coded secrets | None found |
| Env or key files ever committed | Only the empty `server/.env.example` |
| Project folder, tracked or not | No keys; `server/.env` is ignored and holds no API keys |
| Built frontend and the live GitHub Pages site | No keys, no source maps; `/.env` returns 404 |
| Server logs and responses | Two issues, fixed in §1: AI error text and query strings in logs |
