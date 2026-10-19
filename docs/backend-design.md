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

