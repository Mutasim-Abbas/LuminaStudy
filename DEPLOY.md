# Deploying Lumina Study

There are two ways to run the full app — accounts, sync and AI generation:

- **Vercel + Turso** (recommended, both free): the frontend is served as static
  files and the API runs as a stateless function. Nothing lives on a server's
  disk; the database is Turso, hosted SQLite reached over the network.
- **One container with a volume** (Railway or any Docker host): one Node
  process serves the API and the frontend, with SQLite on the volume and
  Litestream copying it to a bucket. See the second half of this guide.

The GitHub Pages build is neither: a static, guest-only copy with no accounts
and no AI, deployed by CI on every push.

## Vercel + Turso

### 1. Create the database on Turso

1. [turso.tech](https://turso.tech) → sign up (free plan, no card).
2. Create a database. Pick the location closest to Vercel's default function
   region (Washington, D.C., `iad1`) — for example AWS `us-east-1`.
3. Copy its URL (`libsql://…turso.io`) and create a token for it. These become
   `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.

The tables are created on the first request: the server runs its migrations
whenever a function instance starts and finds the schema behind.

### 2. Import the project on Vercel

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → import
   `Mutasim-Abbas/LuminaStudy`.
2. Leave the build settings alone — `vercel.json` sets them: it installs both
   packages, builds the frontend and the server, serves `dist`, and sends every
   `/api/*` request to the single function in `api/index.js`.

### 3. Set the environment variables

Vercel → the project → **Settings** → **Environment Variables**:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Turso URL |
| `DATABASE_AUTH_TOKEN` | the Turso token |
| `JWT_SECRET` | 32+ random characters, e.g. from `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `GROQ_API_KEY` | your Groq key |
| `RESEND_API_KEY` | your Resend key |
| `APP_URL` | `https://<your-project>.vercel.app` |
| `CORS_ORIGIN` | the same URL |
| `TRUST_PROXY` | `all` — Vercel overwrites `X-Forwarded-For` with the real client address, so it is safe to trust here |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional, see "Sign in with Google" below |

No Litestream variables: backups are Turso's job on this setup.

### 4. Deploy and verify

Redeploy so the variables apply, then:

```
curl https://<your-project>.vercel.app/api/health
```

Expect `{"ok":true,"aiEnabled":true,...}`. Sign up, sign out, sign back in,
then redeploy and sign in again — the account surviving a redeploy proves the
data is in Turso, not on a function's disk.

## Alternative: one container on Railway

The app runs as one Node process that serves both the API and the built
frontend, so this needs a host with a **long-lived server and a persistent
disk**. Railway is the reference below; a `Dockerfile` is included, so anything
that runs a container works the same way.

### 1. Create the service

1. railway.app → **New Project** → **Deploy from GitHub repo** →
   `Mutasim-Abbas/LuminaStudy`.
2. Railway detects the `Dockerfile` and builds it. No build settings to fill in.

### 2. Add a volume — do this before the first real use

Railway → your service → **Variables/Settings** → **Volumes** → add one mounted
at **`/data`**.

Without it the container filesystem resets on every deploy, taking all accounts
and study sets with it. The image sets `DATABASE_PATH=/data/lumina.db`, so the
mount path has to match.

### 3. Create the backup bucket

The volume is one disk. Litestream (built into the image) copies every write
to an S3-compatible bucket within a second or so, keeps a week of history, and
restores the database automatically if the container ever starts on an empty
volume. Without a bucket the container refuses to start in production; set
`ALLOW_NO_BACKUP=1` only for a throwaway deployment.

Backblaze B2 is the reference below — its defaults work with Litestream as-is.
AWS S3 or any S3-compatible store works too.

1. Backblaze → **B2 Cloud Storage** → **Create a Bucket**. Make it **private**.
   Note the bucket's S3 endpoint, e.g. `s3.us-west-004.backblazeb2.com`: the
   region is the middle part (`us-west-004`).
2. **Application Keys** → **Add a New Application Key**, restricted to this one
   bucket with read and write access. Copy the key ID and the key — the key is
   shown only once.
3. Fill in the `LITESTREAM_*` variables in the next step from these values.

A key scoped to one bucket means a leaked key exposes the backups, not the
rest of the account.

### 4. Set the environment variables

| Variable | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables secure cookies; makes the server fail fast on a weak `JWT_SECRET` |
| `JWT_SECRET` | 32+ random chars | Signs sessions. **The server refuses to boot without it in production** |
| `GROQ_API_KEY` | your key | AI generation. Server-side only — never reaches the browser |
| `CORS_ORIGIN` | your deployed URL | Locks the API to your own origin |
| `APP_URL` | your deployed URL | Base for emailed password-reset links |
| `RESEND_API_KEY` | your key | Password reset. **Required in production** — the console fallback is refused there |
| `MAIL_FROM` | `Lumina Study <onboarding@resend.dev>` | Resend's shared sender only delivers to your own signup address; a verified domain is needed to email anyone else |
| `LITESTREAM_BUCKET` | your bucket's name | Continuous database backup. **The container refuses to start in production without it** |
| `LITESTREAM_ENDPOINT` | e.g. `https://s3.us-west-004.backblazeb2.com` | The provider's S3 endpoint. Leave unset for AWS S3 |
| `LITESTREAM_REGION` | e.g. `us-west-004` | The bucket's region |
| `LITESTREAM_ACCESS_KEY_ID` | the bucket key's ID | Read by Litestream only |
| `LITESTREAM_SECRET_ACCESS_KEY` | the bucket key | Read by Litestream only |
| `GOOGLE_CLIENT_ID` | from Google Cloud | Optional — Sign in with Google (see the section below) |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud | Optional — server-side only |

`PORT` is injected by the platform — do not set it.

`TRUST_PROXY` defaults in production to the private address ranges a
platform's internal proxy connects from. Only set it if step 5 shows it is
wrong.

Generate a secret with:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`CORS_ORIGIN` and `APP_URL` are chicken-and-egg: deploy once to learn the
generated domain, set both to it, redeploy.

### 5. Verify

```
curl https://<your-domain>/api/health
```

Expect `{"ok":true,"aiEnabled":true,...}`. Then sign up, sign out, sign back in,
and confirm the account survives a redeploy — that last step is what proves the
volume is actually mounted.

Then check the server sees real client IPs, since every rate limit is keyed on
them. In Railway's logs, the `remoteAddress` on your own requests should be your
public IP (compare with https://ifconfig.me). If it is the same address on
every request no matter where you connect from, that is Railway's proxy and it
is not in the trusted ranges: set `TRUST_PROXY` to that address (or its range)
and redeploy. Left wrong, all users share one sign-in rate limit.

Finally, prove the backup restores — an untested backup is not a backup. The
first log lines should come from Litestream, reporting that it is replicating
the database to the bucket. Then, from a shell in the running
container (`railway ssh`), restore a copy next to the live database and count
the accounts in it:

```
cd /app/server
litestream restore -config litestream.yml -o /tmp/restore-check.db "$DATABASE_PATH"
node -e "const {DatabaseSync}=require('node:sqlite'); console.log(new DatabaseSync('/tmp/restore-check.db').prepare('SELECT count(*) AS users FROM users').get())"
```

The count should match the live one. This touches nothing in use. Before real
users arrive, also run the full drill once: attach a fresh, empty volume at
`/data` and redeploy. The start script should restore the database from the
bucket on boot, and the test account should still sign in.

## Optional: Sign in with Google

Without these two variables the app works as before and simply doesn't show
the Google button. With them, students can sign up and sign in with one tap.

1. [Google Cloud console](https://console.cloud.google.com) → create a project.
2. **Google Auth Platform** → **Branding**: app name `Lumina Study`, a support
   email and a developer contact email. **Audience**: External. The default
   `openid`, `email` and `profile` scopes are all it needs — Google treats them
   as non-sensitive, so no app review is required.
3. **Clients** → **Create client** → **Web application**. Add one authorized
   redirect URI, exactly: `https://<your-domain>/api/auth/google/callback` —
   your `APP_URL` plus that path. Google matches it character for character.
4. Copy the client ID and secret (the secret is shown only once) into
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and redeploy.
   `/api/health` should now report `"googleSignIn":true`.
5. **Audience** → **Publish app**. Until then only listed test users (up to 100)
   can sign in.
6. To show "Lumina Study" and its logo on Google's consent screen, Google
   checks the brand: verify the domain in Google Search Console, and have a
   public homepage that describes the app with a privacy policy on the same
   domain, linked from both the homepage and the consent screen.

How accounts behave: signing in with Google creates an account with no
password. If an email already has a password account, Google sign-in does not
join it automatically — the owner signs in with the password, then connects
Google from the account page. That stops someone who registered an address they
don't own from sharing the real owner's account.

## Notes

- **Node 24 is required**, not a preference: `node:sqlite` is stable there and
  only available behind `--experimental-sqlite` on 22.x. The Dockerfile pins it.
- **No secrets live in the repo.** `.env` is git-ignored and `.dockerignore`
  keeps it out of the build context; set everything in the host's variable store.
- **Free-tier limits change.** Confirm current terms before relying on them, and
  note that a host without a persistent disk will silently lose data rather than
  fail loudly.
