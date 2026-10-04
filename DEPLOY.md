# Deploying Lumina Study

The app is one Node process that serves both the API and the built frontend, so
it needs a host that runs a **long-lived server with a persistent disk**.

Static hosts (GitHub Pages, Netlify, Vercel's static output) cannot run the full
app: sign-in, sync and AI generation all call `/api/*`, which would not exist.
The GitHub Pages build still works, in guest mode — no accounts, data stays in
the browser, AI generation off. Serverless hosts are also unsuitable as-is: the SQLite database
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

## 3. Create the backup bucket

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

## 4. Set the environment variables

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

## 5. Verify

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

## Notes

- **Node 24 is required**, not a preference: `node:sqlite` is stable there and
  only available behind `--experimental-sqlite` on 22.x. The Dockerfile pins it.
- **No secrets live in the repo.** `.env` is git-ignored and `.dockerignore`
  keeps it out of the build context; set everything in the host's variable store.
- **Free-tier limits change.** Confirm current terms before relying on them, and
  note that a host without a persistent disk will silently lose data rather than
  fail loudly.
