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

