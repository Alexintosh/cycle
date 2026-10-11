# Cloudflare deployment and SQLite migration

Cycle follows [Blueprint](https://github.com/Alexintosh/blueprint)'s Elysia Worker, Drizzle/D1, runtime bindings, atomic batches, protected OTP and revocable-session conventions. The React frontend is served by Workers Static Assets on the same origin; `/api/*` reaches Elysia. No R2 binding is needed because Cycle currently stores structured data only.

## Verify locally

```sh
make install
bun run verify:cloudflare
cd apps/backend
bun run db:migrate:local
```

Verification runs TypeScript, backend and frontend tests, frontend build, Worker dry-run, and Miniflare tests with real local D1 and a mocked Cloudflare email binding. Installation and verification do not create remote resources.

For the complete frontend and Worker locally, copy `apps/backend/.dev.vars.example` to the ignored `apps/backend/.dev.vars` and configure a random `JWT_SECRET` of at least 32 characters, `NODE_ENV=development` and `FRONTEND_URL=http://localhost:8787`. Run `bun run dev:cloudflare` at the repository root. For passkeys, use `localhost`, not `127.0.0.1`. Cloudflare rejects authentication bypass.

## Passwordless accounts

New users choose **Create account**, enter an email identifier and create a discoverable passkey. No password, verification email, email service binding or paid email subscription is needed. The email is unverified and must never be used as proof of ownership. WebAuthn checks origin, RP ID, challenge and user verification. Existing emails cannot be claimed by public signup.

Registration shows eight recovery codes once. Save them before continuing. Each code has 128 bits of randomness; only its email-scoped SHA-256 hash is stored. Recovery requires the email and an unused code, then a verified replacement passkey. Successful recovery invalidates previous passkeys, sessions and recovery codes, and issues a fresh code set. Cancelling the ceremony or failing WebAuthn verification does not consume the recovery code. Settings allows adding a second passkey and generating a fresh recovery code set. Removing the last passkey is blocked when email login is disabled.

Sessions are opaque random tokens with only SHA-256 hashes in D1. Refresh is single-use and replaces both tokens; logout revokes the session. Login and recovery preserve customized habits and history.

Migrated accounts without a passkey require an operator-generated setup code; knowing the email alone is insufficient:

```sh
python3 scripts/create-setup-code.py owner@example.com --output backups/private-setup.txt
```

This uses authenticated Wrangler to create a 24-hour code for an existing account with no passkeys. The plaintext is saved only in a private, ignored local file. The owner opens `/login`, chooses **Recover / set up account**, enters their email and setup code, creates a passkey, then saves their new recovery codes. User IDs and migrated data are preserved. Do not commit or publish setup files.

Legacy OTP endpoints remain disabled by default (`EMAIL_AUTH_ENABLED=false`). To deliberately enable email login later, set `EMAIL_AUTH_ENABLED=true`, add the Cloudflare `send_email` binding named `EMAIL`, configure `EMAIL_FROM`, and onboard the sender domain. `JWT_SECRET` retains its compatibility name and protects OTP HMACs; codes are never logged. Both OTP request and verification endpoints reject requests while email auth is disabled.

Expired authentication records are cleaned in the background on API requests, at most once per hour per Worker environment. No cron trigger is required. Expiration is always checked at authentication time, even when cleanup has not run.

## Preserve the current data

1. Confirm the authoritative source. The local `apps/backend/data/habit-tracker.db` may differ from the database inside the current Docker deployment. For Docker, pause writes and use SQLite's backup API or `sqlite3 /data/habit-tracker.db '.backup /data/cycle-backup.db'` inside the backend container, then copy that consistent snapshot out. Never copy only the main database file from a running WAL database.
2. Prepare an export from the authoritative snapshot:

   ```sh
   python3 scripts/prepare-d1.py /absolute/path/to/source.db --output backups/cloudflare-cutover
   ```

   This creates an exact SQLite backup, `d1-data.sql`, and a SHA-256 manifest. It checks integrity and foreign keys and compares every persistent source row with a SQLite round-trip through the D1 schema. It never edits the source. Backups contain private data and are ignored by Git; copy them to your normal secure backup destination before cutover.
3. Users, their IDs/emails, habits, logs, installed packages and passkeys are preserved. OTPs, challenges and sessions are excluded from the import. Use an existing passkey or an operator-issued setup code for each migrated account. If the old bypass account uses a non-deliverable email, deliberately update that user's email before cutover while preserving their user ID; never merge accounts based only on email. Passkeys bound to an old RP domain require registration again on the new domain. Login no longer repairs or overwrites existing starter habits.
4. Import only into a **fresh, empty** D1 database after applying migrations. The export uses plain INSERTs so existing IDs fail rather than overwrite data. Keep writes paused throughout the final export/import/verification/cutover. Do not use the user-facing JSON import for migration: that endpoint deliberately generates fresh IDs and restricts log references to habits in its snapshot.

## Provision and deploy

Complete Cloudflare login and choose the account and public domain first:

```sh
cd apps/backend
bunx wrangler login
bunx wrangler whoami
bunx wrangler d1 create cycle
```

Set `database_id` in `wrangler.jsonc` to the returned ID and an explicit `account_id` if needed. Set `FRONTEND_URL` to the public HTTPS origin and configure the custom domain route. `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGINS` default to that origin. The default passkey deployment requires no email service. Optional OTP email delivery to arbitrary recipients requires Workers Paid; see [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/).

```sh
bunx wrangler secret put JWT_SECRET
bun run db:migrate:remote
bunx wrangler d1 execute DB --remote --command 'SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM habits) AS habits, (SELECT COUNT(*) FROM habit_logs) AS logs;'
bunx wrangler d1 execute DB --remote --file ../../backups/cloudflare-cutover/d1-data.sql
bunx wrangler d1 execute DB --remote --command 'SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM habits) AS habits, (SELECT COUNT(*) FROM installed_packages) AS packages, (SELECT COUNT(*) FROM habit_logs) AS logs;'
bunx wrangler d1 execute DB --remote --command 'PRAGMA foreign_key_check;'
bunx wrangler d1 execute DB --remote --command 'SELECT user_id, COUNT(*) AS habits FROM habits GROUP BY user_id;'
```

Check that the first counts are zero before import, then compare final counts and per-user ownership against `manifest.json`. `foreign_key_check` must return no rows. If an import fails or its outcome is uncertain, inspect the destination and use a new empty database for retry rather than running the file again over a partial import. Do not drop an existing database automatically.

From the repository root:

```sh
bun run deploy:cloudflare
```

Smoke-test `/api/health`, passkey signup/login, recovery, personal history, package installation, logout, a second account's isolation, passkey registration, and SPA reloads such as `/week`. Switch the production hostname only after these checks. Before any later remote schema change, export D1 with `wrangler d1 export DB --remote --output <private-backup.sql>`.

## Recovery

Keep the original deployment and database intact until cutover is accepted. If verification fails, continue serving the old deployment, diagnose the new database, and repeat with a fresh consistent snapshot. After users write to D1, restoring an old SQLite snapshot would discard their new changes: export D1 and reconcile those writes before a rollback. Do not delete the old Docker volume or SQLite backup as part of deployment.

References: [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).
