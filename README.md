# Cycle

Cycle is a recurring life tracker built around timeframes instead of calendar dates.

The premise is simple:

- putting rituals on a calendar often breaks the mental model
- a lot of life works in buckets instead: two times a week, once a month, once a year
- modern life comes with too many recommendations, chores, health ideas, and maintenance tasks to remember without a system

Cycle is built for that reality. It helps you track recurring life, organized by timeframe.

## Language

- `Rituals` are the personal recurring things you want in your life
  examples: stretching twice a week, reading every day, yearly checkups
- `Upkeep` is recurring maintenance for your home, car, gear, and general life admin
  examples: deep-cleaning tasks, changing filters, cleaning the car, replacing consumables

## Product Vision

Cycle is meant to grow beyond a personal tracker.

Long term, the product can support installable packages of rituals and upkeep. A package could bundle:

- suggested recurring items
- the right timeframe for each one
- instructions on how to do them
- tags and categories for visualization

Examples:

- a deep-clean house package
- a new apartment upkeep package
- a longevity rituals package
- a car care package

The goal is to help people install working life systems, not just collect disconnected ritual ideas from the internet.

## Repo Structure

- `apps/frontend`
  React + Vite app
- `apps/backend`
  Elysia + SQLite API with OTP auth and Swagger

## Run Locally

Install dependencies:

```bash
make install
```

Run frontend and backend together from the repo root:

```bash
make dev
```

Or run them separately:

```bash
make frontend
make backend
```

## Quality Checks

```bash
make typecheck
make test
```

## Docker

For a hostable setup with persistent SQLite storage:

```bash
docker compose up --build
```

The frontend is served on `http://localhost:3000`.

The backend data lives in the named Docker volume `habit_tracker_data`, so the SQLite database survives redeploys unless you explicitly remove that volume.
