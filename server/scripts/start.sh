#!/bin/sh
# Container entrypoint: runs the server under Litestream, so every write to
# the SQLite database is continuously copied to a bucket.
#
#   scripts/start.sh <server command...>     e.g. scripts/start.sh node dist/index.js
#
# Backups are configured by environment variables (see DEPLOY.md). Without
# LITESTREAM_BUCKET the server runs on its own, with no backup.
set -eu

db="${DATABASE_PATH:?DATABASE_PATH must be set}"
config="${LITESTREAM_CONFIG:-$(dirname "$0")/../litestream.yml}"

if [ -z "${LITESTREAM_BUCKET:-}" ]; then
  # In production a missing bucket means every account lives on one disk with
  # no copy. Fail the deploy loudly rather than run that way unnoticed.
  if [ "${NODE_ENV:-}" = "production" ]; then
    echo "start: LITESTREAM_BUCKET is not set, so the database would have no backup." >&2
    echo "start: set the backup variables described in DEPLOY.md." >&2
    exit 1
  fi
  echo "start: LITESTREAM_BUCKET is not set; running without backups." >&2
  exec "$@"
fi

mkdir -p "$(dirname "$db")"

# A new volume — the first deploy, or after losing one — starts from the
# latest backup instead of an empty database. Skipped when the file already
# exists, and harmless while the bucket is still empty.
litestream restore -config "$config" -if-db-not-exists -if-replica-exists "$db"

# Replicate for as long as the server runs. Litestream starts the server
# itself and exits when it does, so the container stops with the server.
exec litestream replicate -config "$config" -exec "$*"
