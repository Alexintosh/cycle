# Frontend

Pure React + Vite frontend for the rebuilt habit tracker.

For local development:

```bash
cd apps/frontend
bun install
bun run dev
```

For Dockerized hosting, the frontend image serves the built app through nginx and proxies `/api` to the backend container.
