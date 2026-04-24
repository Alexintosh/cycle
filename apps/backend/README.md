# Habit Tracker Backend

Elysia + SQLite backend for the rebuilt habit tracker.

## Run

```bash
cd apps/backend
bun install
bun run dev
```

The API boots with a local SQLite database at `apps/backend/data/habit-tracker.db` by default and exposes Swagger docs at `/swagger`.

For Docker, the backend image copies that database into a persistent volume on first boot so redeploys keep the same data.
