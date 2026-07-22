# Lumina Study

An AI-powered study platform for university students. Upload lecture notes or a
PDF and Lumina turns them into flashcards, a practice quiz, a revision summary,
and key highlights — then schedules your reviews with spaced repetition so you
study what you're about to forget, not what you already know.

## Features

**Study tools**

- **AI study sets** — paste notes, drop a `.txt`/`.md` file, or upload a PDF
  (parsed entirely in the browser; the file never leaves your device). The AI
  produces flashcards, a multiple-choice quiz, a 2–3 paragraph summary, and
  ranked key highlights.
- **Spaced repetition** — an SM-2 scheduler gives every card an ease factor,
  interval, and due date. Grade each card (Again / Hard / Good / Easy) and the
  next review is scheduled automatically; each button shows exactly when the
  card will return.
- **Honest mastery** — the mastery percentage is derived from how far each
  card has been spaced out, never hand-set. A set only reaches 100% when every
  card survives a 21-day interval.
- **Keyboard-first review** — `Space` flips, `1–4` grade, `⌘K` searches.
- **Dashboard** — a "Due Today" queue across all sets, weekly goal ring,
  study streak, and a GitHub-style activity heatmap.

**Planning tools**

- **Grade calculator** — "what do I need on the final to get a B?" reverse
  calculation per course, with editable grade cutoffs.
- **Degree planner** — multi-semester GPA tracking, cumulative GPA, and
  graduation projection.

**Platform**

- **Accounts & sync** — email/password accounts with study sets synced to the
  server, so your library follows you across devices. The app is local-first:
  everything also works offline from local storage.
- **Password reset** — a single-use link, emailed and valid for 30 minutes,
  that also clears any sign-in lockout you earned while guessing.
- **Dark mode** — full Material Design 3 dark palette, resolved before first
  paint (no flash), following the system preference until you choose.
- **Usage limits** — 3 free AI generations per rolling 24 hours per account,
  with clear feedback on when the next one unlocks.

## Tech stack

| Layer     | Technology                                                       |
| --------- | ---------------------------------------------------------------- |
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS, React Router           |
| Backend   | Node.js, Fastify 5, SQLite (`node:sqlite`), Zod                  |
| AI        | Groq (OpenAI-compatible API), structured JSON output             |
| Auth      | scrypt password hashing, JWT sessions in httpOnly cookies        |
| PDF       | pdf.js (client-side text extraction, lazy-loaded)                |
| Testing   | Vitest + Testing Library — 128 tests across frontend and backend |

## Getting started

**Prerequisites:** Node.js 22.5+ (the backend uses the built-in `node:sqlite`).

```bash
# 1. Install dependencies (frontend + backend)
npm install
cd server && npm install && cd ..

# 2. Configure the backend
cd server
cp .env.example .env
# open server/.env and paste your Groq API key (free at console.groq.com/keys)
cd ..

# 3. Run both dev servers (two terminals)
cd server && npm run dev      # API on http://localhost:3001
npm run dev                   # app on http://localhost:5174
```

Open `http://localhost:5174`, create an account, and upload some notes.

For a production-style single-process run, build once and start the server —
it serves the compiled frontend and the API from one port:

```bash
npm run build
cd server && npm run build && npm start   # everything on http://localhost:3001
```

On Windows, `start-lumina.bat` does all of the above in one double-click: it
builds on first run, waits for the server to answer, then opens the browser.

## Deployment

The included GitHub Actions workflow type-checks, lints, tests, and builds on
every push to `main`, then publishes the static frontend to GitHub Pages.

Note that Pages serves the frontend only. Accounts, cloud sync, and AI
generation all call `/api/*`, so those features need the Node server running
and reachable — deploy `server/` to a host that can run Node 22.5+ and point
`CORS_ORIGIN` at wherever the frontend is served from.

## Environment variables

All backend configuration lives in `server/.env`, which is git-ignored and never
committed. Copy [`server/.env.example`](server/.env.example) and fill it in —
that file documents every option with empty values.

| Variable          | Required        | Purpose                                     |
| ----------------- | --------------- | ------------------------------------------- |
| `GROQ_API_KEY`    | yes             | AI provider key — server-side only          |
| `JWT_SECRET`      | in production   | Signs session cookies; 32+ chars            |
| `RESEND_API_KEY`  | in production   | Sends password-reset email                  |
| `APP_URL`         | no              | Base URL the reset link points at           |
| `CORS_ORIGIN`     | no              | Locks the API to the frontend origin        |
| `PORT`            | no              | Defaults to `3001`                          |

In development a temporary `JWT_SECRET` is generated at startup if you leave it
blank, so you can run immediately — logins just reset when the server restarts.
In production the server refuses to boot without a strong one.

Password reset behaves the same way: with no `RESEND_API_KEY` the server still
issues valid reset links but prints them to the console instead of emailing
them, so the flow is testable with nothing to configure. Production refuses that
fallback rather than pretend an email was sent.

Run `npm run check-key` inside `server/` to confirm your AI key works before
starting the app.

## Security

- The AI provider key exists **only on the server**; the browser talks to
  `/api/*` and never to the provider directly.
- Passwords are hashed with scrypt (per-user salt, constant-time comparison)
  and never leave the server in any form.
- Sessions are JWTs in httpOnly, SameSite cookies — page scripts cannot read
  the token.
- Sign-up is protected by a server-generated image CAPTCHA (single-use,
  server-held answers) plus a honeypot field.
- Sign-in is limited to 5 attempts per account before a 15-minute lockout,
  with identical responses for unknown emails and wrong passwords to prevent
  account enumeration.
- Reset tokens are 32 random bytes stored only as a SHA-256 hash, single-use,
  30-minute expiry, and superseded whenever a new link is requested. Asking for
  a reset returns the same response for every address, so it cannot be used to
  discover which emails have accounts.
- Every study-set query is scoped to the session's user id — accounts cannot
  read, overwrite, or delete each other's data (covered by dedicated tests).
- Input validation with Zod on every endpoint, rate limiting, and hardened
  headers via Helmet.

## Scripts

| Command (root)     | What it does                       |
| ------------------ | ---------------------------------- |
| `npm run dev`      | Frontend dev server with HMR       |
| `npm run build`    | Type-check + production build      |
| `npm test`         | Frontend test suite                |
| `npm run lint`     | ESLint                             |

| Command (server/)   | What it does                       |
| ------------------- | ---------------------------------- |
| `npm run dev`       | API dev server with hot reload     |
| `npm run build`     | Compile TypeScript                 |
| `npm start`         | Run the compiled server            |
| `npm test`          | Backend test suite                 |
| `npm run typecheck` | Type-check without emitting        |
| `npm run check-key` | Verify the AI key is accepted      |

## Project structure

```
├── src/                  # React frontend
│   ├── pages/            # Route components (Dashboard, Flashcards, Quiz, …)
│   ├── engine/           # Pure logic: SM-2 scheduler, grades, activity
│   ├── hooks/            # useAuth, useTheme, useLocalStorage, …
│   ├── components/       # Shared UI (heatmap, icons, …)
│   └── lib/              # API client, PDF text extraction
└── server/
    └── src/
        ├── routes/       # auth, study sets, AI generation, health
        ├── lib/          # sessions, CAPTCHA, rate/usage limits, hashing
        └── services/     # AI provider integration
```
