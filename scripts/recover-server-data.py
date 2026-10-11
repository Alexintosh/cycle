#!/usr/bin/env python3
"""Prepare a checked, additive recovery into an existing D1 account. No network writes."""
import argparse
import hashlib
import json
import os
import pathlib
import sqlite3
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
TABLES = ("packages", "package_items", "habits", "installed_packages", "habit_logs")
HABIT_FIELDS = ("name", "description", "category", "frequency", "goal", "color", "emoji", "source_type", "package_id", "package_item_id")

def records(db, table):
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    return [dict(row) for row in db.execute('SELECT * FROM "' + table + '" ORDER BY id')] if exists else []

def prepare(source_path, target_dump, email, destination):
    source_path, target_dump, destination = map(pathlib.Path, (source_path, target_dump, destination))
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    source = sqlite3.connect(source_path.resolve().as_uri() + "?mode=ro", uri=True)
    target = sqlite3.connect(":memory:")
    source.row_factory = target.row_factory = sqlite3.Row
    statements, reused, mapping = [], {table: 0 for table in TABLES}, {}
    try:
        present = {row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not set(TABLES).issubset(present):
            raise ValueError("Incomplete source snapshot; expected rituals, logs and package tables")
        if source.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or source.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Invalid source snapshot")
        target.executescript(target_dump.read_text())
        applied = {row[0] for row in target.execute("SELECT name FROM d1_migrations")}
        for path in sorted((ROOT / "apps/backend/migrations").glob("*.sql")):
            if path.name not in applied: target.executescript(path.read_text())
        target.execute("PRAGMA foreign_keys=ON")
        users = target.execute("SELECT id FROM users WHERE email=?", (email.strip().lower(),)).fetchall()
        if len(users) != 1:
            raise ValueError("Target account must already exist exactly once")
        owner = users[0][0]
        untouched_tables = [row[0] for row in target.execute("SELECT name FROM sqlite_master WHERE type='table'") if row[0] not in TABLES]
        untouched = {table: list(target.execute('SELECT * FROM "'+table+'"')) for table in untouched_tables}
        original = {table: records(target, table) for table in TABLES}
        inserted = {table: 0 for table in TABLES}

        def insert(table, row):
            columns = {item[1] for item in target.execute('PRAGMA table_info("'+table+'")')}
            if set(row) - columns:
                raise ValueError("Unrecognized source columns in " + table)
            existing = target.execute('SELECT * FROM "'+table+'" WHERE id=?', (row['id'],)).fetchone()
            if existing:
                if dict(existing) != row:
                    raise ValueError("Conflicting existing record in " + table)
                reused[table] += 1
                return
            names = ', '.join('"'+key+'"' for key in row)
            values = ', '.join(target.execute("SELECT quote(?)", (value,)).fetchone()[0] for value in row.values())
            statement = 'INSERT INTO "'+table+'" ('+names+') VALUES ('+values+') ON CONFLICT(id) DO NOTHING;'
            target.execute(statement)
            statements.append(statement)
            inserted[table] += 1

        def available_id(table, source_id):
            row = target.execute('SELECT * FROM "'+table+'" WHERE id=?', (source_id,)).fetchone()
            if not row or ("user_id" in row.keys() and row['user_id'] == owner):
                return source_id
            return str(uuid.uuid5(uuid.NAMESPACE_URL, 'cycle-recovery/'+owner+'/'+table+'/'+source_id))

        for row in records(source, "packages"):
            row['user_id'] = owner
            insert("packages", row)
        for row in records(source, "package_items"):
            insert("package_items", row)

        candidates = records(target, "habits")
        for row in records(source, "habits"):
            source_id = row['id']
            matches = [candidate for candidate in candidates if candidate['user_id'] == owner and all(candidate[field] == row[field] for field in HABIT_FIELDS)]
            if len(matches) > 1:
                raise ValueError("Ambiguous duplicate ritual; review before importing")
            if matches:
                mapping[source_id] = matches[0]['id']
                reused['habits'] += 1
                continue
            row['id'] = available_id("habits", source_id)
            row['user_id'] = owner
            mapping[source_id] = row['id']
            insert("habits", row)
            candidates.append(row)

        for row in records(source, "installed_packages"):
            existing = target.execute("SELECT * FROM installed_packages WHERE user_id=? AND package_id=?", (owner, row['package_id'])).fetchone()
            if existing:
                if existing['installed_version'] != row['installed_version']:
                    raise ValueError("Conflicting installed package version")
                reused['installed_packages'] += 1
                continue
            row['id'] = available_id("installed_packages", row['id'])
            row['user_id'] = owner
            insert("installed_packages", row)

        for row in records(source, "habit_logs"):
            row['habit_id'] = mapping[row['habit_id']]
            existing = target.execute("SELECT * FROM habit_logs WHERE id=?", (row['id'],)).fetchone()
            if existing and dict(existing) != row:
                row['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, 'cycle-recovery/'+owner+'/habit_logs/'+row['id']))
            insert("habit_logs", row)

        if target.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Recovery has orphaned records")
        for table, rows in untouched.items():
            if list(target.execute('SELECT * FROM "'+table+'"')) != rows:
                raise ValueError("Recovery altered authentication or unrelated data")
        for table, rows in original.items():
            for row in rows:
                if dict(target.execute('SELECT * FROM "'+table+'" WHERE id=?', (row['id'],)).fetchone()) != row:
                    raise ValueError("Recovery altered existing rows")
        expected = {table: records(target, table) for table in TABLES}
        payload = '-- Apply AFTER schema migrations to the backed-up D1 database. Additive, replay-safe inserts only.\n'+'\n'.join(statements)+'\n'
        (destination / 'recovery.sql').write_text(payload)
        manifest = {'targetEmail': email, 'targetUserId': owner, 'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(), 'targetBackupSha256': hashlib.sha256(target_dump.read_bytes()).hexdigest(), 'sqlSha256': hashlib.sha256(payload.encode()).hexdigest(), 'inserted': inserted, 'reused': reused, 'habitIdMapping': mapping, 'expectedTables': expected}
        (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
        for path in destination.iterdir(): os.chmod(path, 0o600)
        return manifest
    finally:
        source.close(); target.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=pathlib.Path)
    parser.add_argument('target_backup', type=pathlib.Path)
    parser.add_argument('--email', required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    result = prepare(args.source, args.target_backup, args.email, args.output)
    print(json.dumps({key: result[key] for key in ('targetEmail', 'inserted', 'reused')}, indent=2))
