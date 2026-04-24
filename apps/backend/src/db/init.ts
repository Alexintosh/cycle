import type { Client } from "@libsql/client"

const statements = [
  "PRAGMA foreign_keys = ON;",
  "PRAGMA journal_mode = WAL;",
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS one_time_passwords (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );`,
  "CREATE INDEX IF NOT EXISTS otp_email_idx ON one_time_passwords(email);",
  "CREATE INDEX IF NOT EXISTS otp_created_at_idx ON one_time_passwords(created_at);",
  `CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'OTHER',
    frequency TEXT NOT NULL,
    goal INTEGER,
    color TEXT NOT NULL DEFAULT '#FECACA',
    emoji TEXT DEFAULT '✨',
    "order" INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );`,
  "CREATE INDEX IF NOT EXISTS habits_user_idx ON habits(user_id);",
  "CREATE INDEX IF NOT EXISTS habits_user_order_idx ON habits(user_id, \"order\");",
  `CREATE TABLE IF NOT EXISTS habit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL,
    log_date TEXT NOT NULL,
    logged_at INTEGER NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
  );`,
  "CREATE INDEX IF NOT EXISTS habit_logs_habit_idx ON habit_logs(habit_id);",
  "CREATE INDEX IF NOT EXISTS habit_logs_habit_date_idx ON habit_logs(habit_id, log_date);",
]

export async function initializeDatabase(client: Client) {
  for (const statement of statements) {
    await client.execute(statement)
  }
}
