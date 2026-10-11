# Recovering the development server

The development checkout is `/home/sgroppy/code/cycle` on `sgroppy@100.84.74.34:22222`. Its SQLite database is in the named Docker volume `cycle_habit_tracker_data`, mounted at `/app/apps/backend/data/habit-tracker.db` in `cycle-backend-1`. The database uses WAL: copying only the small `.db` file misses recent data. Use a consistent SQLite snapshot, such as `Database.serialize()` from the installed Bun runtime, and verify integrity and foreign keys on the resulting local copy.

The server's previously uncommitted package authoring work was preserved in commit `d442a80` on `codex/recover-server-packages`, including its authoring skill. The integrated code uses database-backed public packages and items. Published definitions are visible in the registry; only the owner can edit them. Personal installations, rituals, and history remain per account. Package creation and replacement run atomically on both SQLite and D1. Normal startup fills missing bundled packages without overwriting recovered owners, edits, versions, or item IDs.

Recovery artifacts live in the ignored `backups/server-development-20261011/` directory with restricted permissions. They include coherent source snapshots, a complete SQLite dump, the original patch, package catalogs, authoring tools, the D1 backup, and a checked recovery plan. They contain account data and are never committed.

Export D1 before recovery, then prepare an additive plan:

```sh
python3 scripts/recover-server-data.py SOURCE.db D1-before.sql \
  --email TARGET_ACCOUNT_EMAIL --output backups/NEW_RECOVERY_PLAN
```

The target account must already exist. The script simulates pending migrations and the import in memory, checks foreign keys, and verifies that all existing records and authentication tables remain unchanged. It assigns recovered package definitions, installations, and rituals to that account. Exact matching rituals reuse current IDs, keeping offline queues valid; imported log references follow the mapping. Foreign-account ID collisions are remapped deterministically. Conflicts stop before a SQL file is produced. The resulting `recovery.sql` contains additive, replay-safe inserts; `manifest.json` records hashes, mappings and expected table contents.

Apply schema migrations first, review the manifest, then execute the SQL with Wrangler against the backed-up database. Verify every recovered row and ownership against the manifest and check that original user/session/passkey records are preserved. Deploy the merged Worker and frontend, then verify the authenticated package registry and personal installations. The development database remains a recovery source; use the Cloudflare app for subsequent activity.

The recovered snapshot contains 6 published packages, 26 package items, 4 installations, 41 rituals and 8 logs. For the initial recovery, 23 rituals exactly matched existing target rituals, so only 18 rituals were added. Existing account credentials are not imported from or replaced by the old server.
