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
  `CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    webauthn_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT NOT NULL DEFAULT '[]',
    device_type TEXT NOT NULL,
    backed_up INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );`,
  "CREATE INDEX IF NOT EXISTS passkeys_user_idx ON passkeys(user_id);",
  "CREATE INDEX IF NOT EXISTS passkeys_webauthn_user_idx ON passkeys(webauthn_user_id);",
  `CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    purpose TEXT NOT NULL,
    challenge TEXT NOT NULL,
    webauthn_user_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );`,
  "CREATE INDEX IF NOT EXISTS webauthn_challenges_purpose_idx ON webauthn_challenges(purpose);",
  "CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_at_idx ON webauthn_challenges(expires_at);",
  "CREATE INDEX IF NOT EXISTS webauthn_challenges_user_purpose_idx ON webauthn_challenges(user_id, purpose);",
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
    source_type TEXT NOT NULL DEFAULT 'manual',
    package_id TEXT,
    package_item_id TEXT,
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
  `CREATE TABLE IF NOT EXISTS installed_packages (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    package_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    author TEXT NOT NULL,
    installed_version TEXT NOT NULL,
    installed_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );`,
  "CREATE INDEX IF NOT EXISTS installed_packages_user_idx ON installed_packages(user_id);",
  "CREATE UNIQUE INDEX IF NOT EXISTS installed_packages_user_package_unique ON installed_packages(user_id, package_id);",
]

export async function initializeDatabase(client: Client) {
  for (const statement of statements) {
    await client.execute(statement)
  }

  await ensureColumn(client, "habits", "source_type", "TEXT NOT NULL DEFAULT 'manual'")
  await ensureColumn(client, "habits", "package_id", "TEXT")
  await ensureColumn(client, "habits", "package_item_id", "TEXT")
  await client.execute("CREATE INDEX IF NOT EXISTS habits_user_package_idx ON habits(user_id, package_id);")
  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS habits_user_package_item_unique ON habits(user_id, package_id, package_item_id) WHERE package_id IS NOT NULL AND package_item_id IS NOT NULL;",
  )
}

async function ensureColumn(client: Client, tableName: string, columnName: string, definition: string) {
  const result = await client.execute(`PRAGMA table_info(${tableName});`)
  const hasColumn = result.rows.some((row) => String((row as { name?: unknown }).name) === columnName)

  if (!hasColumn) {
    await client.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`)
  }
}
