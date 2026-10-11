#!/usr/bin/env python3
"""Snapshot SQLite and produce a checked, data-only import for a fresh D1 database."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
TABLES = ("users", "packages", "package_items", "habits", "installed_packages", "habit_logs", "passkeys")


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def prepare(source, destination):
    source = pathlib.Path(source).resolve(strict=True)
    destination = pathlib.Path(destination)
    destination.mkdir(parents=True, mode=0o700, exist_ok=False)
    backup = destination / "habit-tracker.db"
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as original:
        with sqlite3.connect(backup) as snapshot:
            original.backup(snapshot)
            if snapshot.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Source integrity check failed")
            if snapshot.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("Source has orphaned records")
    os.chmod(backup, 0o600)
    schema = "\n".join(path.read_text() for path in sorted((ROOT / "apps/backend/migrations").glob("*.sql")))
    statements = []
    counts = {}
    with sqlite3.connect(backup) as snapshot, sqlite3.connect(":memory:") as target:
        target.execute("PRAGMA foreign_keys=ON")
        target.executescript(schema)
        for table in TABLES:
            exists = snapshot.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
            if not exists:
                counts[table] = 0
                continue
            columns = [row[1] for row in snapshot.execute(f"PRAGMA table_info({identifier(table)})")]
            target_columns = {row[1] for row in target.execute(f"PRAGMA table_info({identifier(table)})")}
            if set(columns) - target_columns:
                raise ValueError(f"Unrecognized columns in {table}; review migration before proceeding")
            selection = ', '.join(identifier(column) for column in columns)
            rows = snapshot.execute(f"SELECT {selection} FROM {identifier(table)} ORDER BY id").fetchall()
            counts[table] = len(rows)
            for row in rows:
                values = ', '.join(snapshot.execute("SELECT quote(?)", (value,)).fetchone()[0] for value in row)
                statement = f"INSERT INTO {identifier(table)} ({selection}) VALUES ({values});"
                statements.append(statement)
                target.execute(statement)
            imported = target.execute(f"SELECT {selection} FROM {identifier(table)} ORDER BY id").fetchall()
            if imported != rows:
                raise ValueError(f"Round-trip mismatch in {table}")
        if target.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Import would contain orphaned records")
        ownership = dict(target.execute("SELECT user_id, count(*) FROM habits GROUP BY user_id").fetchall())
    # Auth challenges, codes and sessions are deliberately excluded; users sign in again.
    payload = "-- Import once into an empty D1 database AFTER applying schema migrations.\n" + '\n'.join(statements) + '\n'
    (destination / "d1-data.sql").write_text(payload)
    manifest = {
        "source": str(source), "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "schema_sha256": hashlib.sha256(schema.encode()).hexdigest(),
        "backup_sha256": hashlib.sha256(backup.read_bytes()).hexdigest(),
        "sql_sha256": hashlib.sha256(payload.encode()).hexdigest(),
        "counts": counts, "habits_by_user": ownership,
        "excluded": ["one_time_passwords", "webauthn_challenges", "sessions", "auth_enrollments", "recovery_codes"],
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + '\n')
    for file in destination.iterdir():
        os.chmod(file, 0o600)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "backups" / datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = parser.parse_args()
    manifest = prepare(args.source, args.output)
    print(f"Verified backup and D1 import: {args.output.resolve()}")
    print(json.dumps(manifest["counts"]))
