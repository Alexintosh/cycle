CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL,
  version TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS packages_user_idx ON packages(user_id);
CREATE INDEX IF NOT EXISTS packages_title_idx ON packages(title);
CREATE TABLE IF NOT EXISTS package_items (
  id TEXT PRIMARY KEY NOT NULL,
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '✨',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  goal INTEGER,
  section TEXT NOT NULL DEFAULT 'OTHER',
  color TEXT NOT NULL DEFAULT '#E2E8F0',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS package_items_package_idx ON package_items(package_id);
CREATE INDEX IF NOT EXISTS package_items_package_order_idx ON package_items(package_id,sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS package_items_package_item_unique ON package_items(package_id,item_id);
