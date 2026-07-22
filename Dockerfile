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

# The database lives on a mounted volume, not in the image: anything written
# to the container filesystem is lost on every redeploy. DATABASE_PATH must
# point inside the mount for accounts and study sets to survive.
ENV DATABASE_PATH=/data/lumina.db
VOLUME ["/data"]

# The platform injects PORT; this is only the fallback for a plain local run.
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/server
CMD ["node", "dist/index.js"]
