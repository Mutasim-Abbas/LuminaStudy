# Lumina Study — Full Build Plan

> This file is the starting brief for a new Claude Code session in this folder.
> Nothing has been built yet — this is planning only. When ready, open a session
> here and say "start" to begin.

## What it is

An AI-powered study platform for university students, merging two ideas:

1. **AI Study Tools** — upload notes/slides/PDFs → AI generates flashcards,
   practice quizzes, and summaries.
2. **Grade & Degree Planner** — per-course "what do I need on my final to get a
   B?" reverse calculator, plus multi-semester GPA tracking, cumulative GPA,
   graduation projection, and what-if scenarios.

## Design system (from the user's screenshots — locked in)

- **Colors:** Primary indigo `#2E3192`, Secondary mint `#98FFD9`, Tertiary
  `#F0F4FF`, Neutral `#64748B` (+ full tint/shade ramps).
- **Fonts:** Plus Jakarta Sans (headlines), Inter (body/labels).
- **Style:** Clay UI — soft rounded cards, layered shadows, pill buttons,
  rounded search bars.
- **Logo:** tree/leaf mark in a shield, indigo + mint — already designed by
  the user.
- **Screens the user supplied as prototype references:**
  - Dashboard — greeting, recent study sets with mastery bars, an "AI Insight"
    tip card, a weekly-progress ring.
  - Practice Quiz — multiple choice with a timer.
  - Upload & AI Processing — drag-and-drop document upload, live "analyzing"
    state, generated flashcards / practice questions / summary.
  - Flashcard Deck — flip-card review view.

## Decisions already made

- Palette stays as-is — it already reads gender-neutral, no changes needed.
- **One** 3D interactive moment on the dashboard hero only — not used
  everywhere; 3D must serve the content, never bury it.
- Motion language: same DNA as the user's other project VisSort (word-blur-in
  headlines, smooth transitions) but softened for a light clay UI instead of a
  dark cinematic one.
- Delivery: **PWA** (installable website) — one codebase, instant reach via a
  link, no app-store friction; can be wrapped as a native app later if it
  takes off.
- Audience: any university (configurable), not hard-coded to one school.

## Tech stack

- Vite + React + TypeScript (strict) + Tailwind CSS
- Framer Motion for the entrance/transition motion
- React Three Fiber for the one 3D hero piece
- PWA manifest + service worker for installability
- **Backend: undecided.** Options on the table: Supabase (fast, managed
  Postgres + auth — default recommendation) vs. a custom Node backend (more
  backend skill demonstrated, more work). To be confirmed when the user says
  "start backend."

## Team & process

Same 5-agent team used on VisSort (agents live globally in
`~/.claude/agents/`):

1. **team-leader** — runs a short interview to close the remaining open items
   below, then writes `docs/PLAN.md` and `docs/TODO.md` for this project.
2. **ui-ux-designer** — extends this brief into a full `docs/DESIGN.md`
   (interaction states, spacing scale, component specs, the 3D hero spec,
   motion spec), using the user's screenshots as source of truth. Should use
   the `ui-ux-pro-max` skill and ask the user for the actual screenshot files
   if they are not yet in this repo.
3. **frontend-developer** — builds the app.
4. **qa-tester** — full sweep at the end (browser-driven, not just a green
   build), like the VisSort QA pass.
5. **backend-developer** — held back until the user explicitly says "start
   backend."

**Process note:** the team-leader agent is configured to always interview the
user before planning/building — a lot of that interview already happened in
the chat that produced this file, so the leader should treat the answers below
as given and only ask about the "Open questions" section.

## Build order (frontend phase)

1. Scaffold (Vite / React / TS / Tailwind / PWA manifest) + import the design
   tokens and logo asset from the user.
2. **Grade Calculator** — the core "useful" feature: course grade tracking +
   the reverse "what do I need on the final" calculator.
3. **Degree Planner** — multi-semester GPA, cumulative GPA, what-if scenarios.
4. **Dashboard** shell matching the reference screenshot (placeholder data).
5. **Flashcard + Quiz UI** matching the reference screenshots (sample/seed
   data — real AI generation needs the backend).
6. **Upload & AI Processing** screen — UI only for now (no real analysis until
   backend phase).
7. Motion + 3D hero pass.
8. Mobile responsive + PWA install pass.
9. QA sweep.

## Explicitly deferred to the backend phase

- Real AI document analysis (needs an LLM API).
- Accounts / login, cloud sync across devices.
- Server-side saved grades/courses (the frontend phase uses `localStorage` so
  the app is fully usable before any backend exists).

## Open questions for the next session

- **Grading scale:** the user's university uses 100-point percentages with
  letter grades (A/B/C/D/F). Need either (a) the exact cutoff table, or
  (b) a configurable scale editor so any university's cutoffs work — leaning
  toward (b) since the app should work for "anyone."
- **Backend choice:** Supabase vs. custom Node backend — confirm when backend
  phase starts.
- **AI provider** for flashcard/quiz generation from uploaded documents —
  not yet chosen.
- The reference screenshots (design system + prototype mockups) should be
  saved into this project folder (e.g. `docs/references/`) so the
  ui-ux-designer agent can read them directly instead of relying on a
  description.
