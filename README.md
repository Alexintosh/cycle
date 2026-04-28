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

## Package System

Cycle now includes a first package system.

- A package is a single JSON definition with package metadata plus item definitions.
- Each item includes the timeframe, emoji, title, description, goal, and section.
- Installing a package adds its items into your rituals/upkeep list.
- Updating a package refreshes package-managed titles and descriptions, and appends newly published items without touching your history.
- Removing a package deletes the items that came from that package.

For convenience, the current registry is internal to the backend. The long-term direction is to move that registry into a separate repository so packages can be curated and published independently.

## Repo Structure

- `apps/frontend`
  React + Vite app
- `apps/backend`
  Elysia + SQLite API with OTP auth, passkeys, Swagger, and the internal package registry

## Run Locally

Install dependencies:

```bash
make install
```

Run frontend and backend together from the repo root:

```bash
make dev
```

This starts:

- frontend on `http://localhost:3100`
- backend on `http://localhost:3101`
- Swagger docs on `http://localhost:3101/swagger`

## Passkeys

Cycle now supports passkeys for returning users.

- Sign in once with email OTP.
- Open Settings and register a passkey for the current device.
- Use the passkey button on the login screen on future sign-ins.

WebAuthn defaults:

- `WEBAUTHN_RP_NAME=Cycle`
- `WEBAUTHN_RP_ID` defaults to the hostname from `FRONTEND_URL`
- `WEBAUTHN_ORIGINS` defaults to `FRONTEND_URL` and accepts a comma-separated list
- For local passkey testing, use `http://localhost:3100` instead of `http://127.0.0.1:3100`

## Internal Auth Bypass

For trusted internal deployments, Cycle can skip login entirely and auto-authenticate a single default user.

- `AUTH_BYPASS_ENABLED=true`
- `AUTH_BYPASS_EMAIL=internal@cycle.local`
- `AUTH_BYPASS_DISPLAY_NAME=Internal User`

When enabled:

- the backend treats all requests as the configured default user
- the frontend auto-loads that user on startup
- the logout control is hidden

This mode is intended only for private internal networks you control.

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
