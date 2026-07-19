# Lumina Study — Backend

A small, secure Fastify server that powers the AI features. It holds the Gemini
API key **server-side only** — the key never reaches the browser.

## What it does

- `GET /api/health` — liveness + whether AI is configured (never exposes the key)
- `POST /api/generate` — turns study material (text) into flashcards + a quiz +
  a summary using Gemini, with structured JSON output
- SQLite database (`node:sqlite`, no native build) with `users` + `study_sets`
  tables, ready for the auth/cloud-sync phase
- Password hashing via `node:crypto` scrypt (for the upcoming auth)

## Security

- **Key isolation** — the Gemini key lives in `.env` (git-ignored) and is only
  read on the server. The browser talks to `/api/*`, never to Google directly.
- Input validation with **zod** (length caps to control cost/abuse)
- **Rate limiting** — 100 req/min globally, 10 req/min on `/api/generate`
- **Helmet** security headers, **CORS** locked to the frontend origin
- A global error handler that returns generic messages — no stack traces leak

## Setup

1. **Get a Gemini API key** (free): https://aistudio.google.com/apikey
2. **Create your `.env`** (copy the example):
   ```bash
   cd server
   cp .env.example .env
   ```
3. **Open `server/.env`** and paste your key after `GEMINI_API_KEY=`.
   (Optional but recommended: set a long random `JWT_SECRET` — the example
   file shows the command to generate one.)
4. **Install & run** (from the `server/` folder):
   ```bash
   npm install
   npm run dev        # starts on http://127.0.0.1:3001
   ```

## Running the whole app

Two terminals:

```bash
# terminal 1 — backend
cd server && npm run dev

# terminal 2 — frontend (project root)
npm run dev -- --port 5180
```

The frontend proxies `/api` to the backend automatically, so you just open
`http://localhost:5180` and use it.

## Scripts

| Command           | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Start with hot-reload                 |
| `npm run build`   | Compile TypeScript to `dist/`         |
| `npm start`       | Run the compiled server               |
| `npm run typecheck` | Type-check without emitting         |
