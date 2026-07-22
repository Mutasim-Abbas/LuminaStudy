# Deploying Lumina Study

The app is one Node process that serves both the API and the built frontend, so
it needs a host that runs a **long-lived server with a persistent disk**.

Static hosts (GitHub Pages, Netlify, Vercel's static output) cannot run it. The
page would load, but sign-in, sync and AI generation all call `/api/*`, which
would not exist. Serverless hosts are also unsuitable as-is: the SQLite database
is a file, and a platform with an ephemeral filesystem discards every account
and study set on each redeploy.

Railway is the reference target below — a `Dockerfile` is included, so anything
that runs a container works the same way.

## 1. Create the service

1. railway.app → **New Project** → **Deploy from GitHub repo** →
   `Mutasim-Abbas/LuminaStudy`.
2. Railway detects the `Dockerfile` and builds it. No build settings to fill in.

## 2. Add a volume — do this before the first real use

Railway → your service → **Variables/Settings** → **Volumes** → add one mounted
at **`/data`**.

Without it the container filesystem resets on every deploy, taking all accounts
and study sets with it. The image sets `DATABASE_PATH=/data/lumina.db`, so the
mount path has to match.

## 3. Set the environment variables

| Variable | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables secure cookies; makes the server fail fast on a weak `JWT_SECRET` |
| `JWT_SECRET` | 32+ random chars | Signs sessions. **The server refuses to boot without it in production** |
| `GROQ_API_KEY` | your key | AI generation. Server-side only — never reaches the browser |
| `CORS_ORIGIN` | your deployed URL | Locks the API to your own origin |
| `APP_URL` | your deployed URL | Base for emailed password-reset links |
| `RESEND_API_KEY` | your key | Password reset. **Required in production** — the console fallback is refused there |
| `MAIL_FROM` | `Lumina Study <onboarding@resend.dev>` | Resend's shared sender only delivers to your own signup address; a verified domain is needed to email anyone else |

`PORT` is injected by the platform — do not set it.

Generate a secret with:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`CORS_ORIGIN` and `APP_URL` are chicken-and-egg: deploy once to learn the
generated domain, set both to it, redeploy.

## 4. Verify

```
curl https://<your-domain>/api/health
```

Expect `{"ok":true,"aiEnabled":true,...}`. Then sign up, sign out, sign back in,
and confirm the account survives a redeploy — that last step is what proves the
volume is actually mounted.

## Notes

- **Node 24 is required**, not a preference: `node:sqlite` is stable there and
  only available behind `--experimental-sqlite` on 22.x. The Dockerfile pins it.
- **No secrets live in the repo.** `.env` is git-ignored and `.dockerignore`
  keeps it out of the build context; set everything in the host's variable store.
- **Free-tier limits change.** Confirm current terms before relying on them, and
  note that a host without a persistent disk will silently lose data rather than
  fail loudly.
