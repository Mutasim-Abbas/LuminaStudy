# Node 24: `node:sqlite` is stable here. On 22.x it exists only behind
# --experimental-sqlite, so pinning the major version is load-bearing, not
# housekeeping.
FROM node:24-slim AS build
WORKDIR /app

# Frontend dependencies first, so a source-only change reuses this layer.
COPY package.json package-lock.json ./
RUN npm ci

# Server dependencies.
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server

COPY . .

# The server serves the built frontend from ../../dist relative to its own
# compiled output, so both builds have to run and both are kept below.
RUN npm run build
RUN npm run build --prefix server


FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only — no toolchain, no test runners in the image.
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server

COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist

# Litestream, for continuous backup of the database (see server/scripts/start.sh).
# Copied from the official image and pinned by digest, not just tag: this
# binary reads every byte of user data and holds the bucket credentials.
COPY --from=litestream/litestream:0.5.17@sha256:4b02b9859a6b6b4087d8b8944e15f7e984bd7957cba322bbeee38b0e27b9656a \
  /usr/local/bin/litestream /usr/local/bin/litestream
COPY server/litestream.yml ./server/
COPY server/scripts/start.sh ./server/scripts/

# The database lives on a mounted volume, not in the image: anything written
# to the container filesystem is lost on every redeploy. DATABASE_PATH must
# point inside the mount for accounts and study sets to survive.
ENV DATABASE_PATH=/data/lumina.db
VOLUME ["/data"]

# The platform injects PORT; this is only the fallback for a plain local run.
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/server
# The start script restores the database if the volume is empty, then runs
# the server under Litestream. It refuses to start in production without a
# backup bucket unless ALLOW_NO_BACKUP=1 (see DEPLOY.md).
CMD ["sh", "scripts/start.sh", "node", "dist/index.js"]
