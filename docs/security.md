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

### Second round, after an outside review

An outside review of this report (written without access to the code) raised
the gaps below. Each was checked against the code; the ones that held up were
fixed, with tests that fail on the old code.

| Area | Change | Why |
| --- | --- | --- |
| Sessions | Server-side session records; the cookie's JWT names one, and every request checks it still exists | A password reset or sign-out couldn't end a stolen session, and a deleted account's cookie still worked on protected routes for up to 7 days |
| Sign-out | Ends this browser's session on the server; "sign out of all devices" ends them everywhere | Clearing the cookie left any copy of it working |
| Password reset | Ends every session in the same transaction as the new password | A reset is often the response to a stolen login |
| Account deletion | Needs the password again, or a Google confirmation within five minutes | Anyone at an unlocked, signed-in browser could delete the account |
| AI quota | A slot is reserved atomically before the AI call and returned if it fails | Checking first and recording after let five simultaneous requests all through a limit of three (found by the review) |
| Tokens | The JWT carries only the account and session ids | A JWT is signed, not encrypted: the email and name were readable by whoever held it |
| Cross-site requests | State-changing API requests from another site's Origin, or marked cross-site, are refused | A second CSRF defence that doesn't rely on SameSite cookies |
| Reset links | The token is removed from the address bar once read | So it doesn't linger in history, bookmarks or screenshots |
| CI | gitleaks scans every commit on every push; Dependabot proposes updates weekly | A clean audit is only true on the day it ran |

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
- Sessions: a server-side session record (only a SHA-256 hash of its id is
  stored), named by an HS256 JWT with the algorithm pinned (no `alg: none` or
  algorithm confusion) that carries only the account and session ids. 7-day
  expiry, in an `httpOnly`, `SameSite=Lax` cookie that is `Secure` in
  production. Every authenticated request checks that the session still
  exists and its account too, so sessions end immediately on sign-out, on
  "sign out of all devices", on a password reset (all of them, in the same
  transaction as the new password) and on account deletion.
- Deleting the account needs the password again — counted towards the sign-in
  lockout — or, for an account with no password, a Google confirmation by the
  same Google account within the last five minutes.
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
itself. An AI generation reserves its slot in the daily quota atomically
before calling the AI, so simultaneous requests can't all slip under the
limit; a failed call gives the slot back.

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
- Helmet sets hardened HTTP headers (including `Referrer-Policy: no-referrer`);
  CORS is locked to the app's own origin.
- Cross-site request forgery: besides the SameSite cookie, every POST, PUT,
  PATCH or DELETE to the API whose `Origin` names another site — or whose
  `Sec-Fetch-Site` is `cross-site` — gets a 403 before any route runs.

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
- CI scans every commit with gitleaks 8.30.1 (pinned by image digest); only
  two exact test-only fake values are allowlisted (`.gitleaks.toml`). The
  Pages deploy waits for the scan.
- Dependabot proposes updates weekly for both npm packages, the workflow's
  actions and the Docker images.
- Node 24 pinned for Vercel and CI.

### 2.9 How it is tested

- 179 server tests, run on both database backends: local SQLite and libSQL
  (Turso's client), and 88 frontend tests. They cover token forgery (expired,
  unsigned, wrong secret, `alg: none`), session revocation (sign-out, sign out
  everywhere, password reset, deleted accounts), re-authentication before
  deletion, account isolation, lockout, the AI quota under simultaneous
  requests, reset-token replay, CAPTCHA races, cross-site writes, Google token
  forgery (wrong key, wrong audience or issuer, unsigned, HMAC confusion,
  expired, wrong nonce, unverified email), login CSRF on the Google callback,
  and AI error leaks.
- For key protections the tests were also run against deliberately broken
  code, to confirm they fail when the protection is missing: the proxy trust,
  the transaction queue on both backends, the atomic CAPTCHA check, explicit
  account deletion, AI error hiding, session revocation on sign-out and
  reset, the atomic AI quota (the old code let five of five simultaneous
  requests through) and the reset-link clean-up. This caught one test that
  wasn't testing anything; it was rewritten.

## 3. Leak audit (2026-10-20)

| Checked | Result |
| --- | --- |
| All 180 commits, for API keys (Groq, Resend, Google, AWS, OpenAI, GitHub, Backblaze), private keys, JWTs and hard-coded secrets | None found |
| Env or key files ever committed | Only the empty `server/.env.example` |
| Project folder, tracked or not | No keys; `server/.env` is ignored and holds no API keys |
| Built frontend and the live GitHub Pages site | No keys, no source maps; `/.env` returns 404 |
| Server logs and responses | Two issues, fixed in §1: AI error text and query strings in logs |

## 4. Known gaps

Closed since the first version of this report: stateless sessions, deletion
without re-authentication, the AI quota race, and the missing secret scan
(see the second round in §1).

| Gap | Risk | Plan |
| --- | --- | --- |
| No Content-Security-Policy | A future XSS bug would have no second line of defence; it could act as the user even though it can't read the cookie | Map the frontend's needs, ship a strict policy in report-only mode, then enforce it |
| Per-IP limits are per instance on Vercel | Spread over many instances, the IP limits loosen; per-account limits (lockout, AI quota) are in the database and unaffected | Move the IP counters to a shared store if abuse appears |
| Email addresses aren't verified at sign-up | Someone can register an address they don't own (Google linking is already protected against this) | Verification email once a sending domain is set up |
| The hosting platform keeps its own request logs | They may record full URLs, including Google's one-time callback code, which is useless without the PKCE verifier but still sensitive | Check what Vercel records on first deploy; restrict who can read the logs |
| Dev tooling (vitest, vite, tailwind) has advisories that need major upgrades | Development only; nothing ships to users | Upgrade in a dedicated change, now proposed by Dependabot |
| Live services not yet exercised: a real Turso database, the Vercel deploy, Google sign-in and the secret scan's first CI run | Configuration mistakes would show only after deploy | The deploy-day checklist in §5 |

## 5. Deploy-day security checklist

None of these can be proven before the app runs on the real services. Do
them on the first deploy, and again after any change to the hosting setup.

1. **Secrets live only in Vercel's environment variables**, scoped to
   Production, and are different from any used locally. `JWT_SECRET` is newly
   generated for production.
2. **The build is clean:** the CI run for the deployed commit is green,
   including the secret scan.
3. **Headers, from outside:** `curl -I https://<app>/` shows Helmet's headers
   and `Referrer-Policy: no-referrer`; the session cookie is `HttpOnly`,
   `Secure` and `SameSite=Lax`.
4. **Client IPs:** sign in with a wrong password from two networks (e.g. Wi-Fi
   and a phone's data) and check that each network gets its own rate limit.
5. **Sessions end:** sign in on two browsers; "sign out of all devices" on one
   signs the other out on its next request. Repeat with a password reset.
6. **Isolation:** with two accounts, one can't see or change the other's sets.
7. **Deletion:** deleting an account asks for the password (or a Google
   confirmation) and leaves nothing behind in Turso.
8. **Cross-site writes:** a POST to `/api/auth/login` with
   `Origin: https://example.com` gets a 403.
9. **Google sign-in:** sign in, link, confirm and cancel all land where they
   should; Vercel's request logs show what they record for the callback URL.
10. **Nothing private is served:** `/.env`, `/server/.env` and `/data/` return
    404.
