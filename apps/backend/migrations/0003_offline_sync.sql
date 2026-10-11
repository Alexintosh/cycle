CREATE TABLE offline_mutations (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id, id)
);
