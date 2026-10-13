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
