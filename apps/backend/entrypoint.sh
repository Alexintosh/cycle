#!/bin/sh
set -eu

DATA_DIR="${DATA_DIR:-/app/apps/backend/data}"
SEED_DB="${SEED_DB:-/app/apps/backend/seed/habit-tracker.db}"
TARGET_DB="$DATA_DIR/habit-tracker.db"

mkdir -p "$DATA_DIR"

if [ ! -f "$TARGET_DB" ] && [ -f "$SEED_DB" ]; then
  cp "$SEED_DB" "$TARGET_DB"
fi

exec bun run start
