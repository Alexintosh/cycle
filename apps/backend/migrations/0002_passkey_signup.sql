CREATE TABLE auth_enrollments (
 id TEXT PRIMARY KEY NOT NULL,
 email TEXT NOT NULL,
 display_name TEXT NOT NULL,
 user_id TEXT NOT NULL,
 challenge TEXT NOT NULL,
 webauthn_user_id TEXT NOT NULL,
 recovery_hash TEXT,
 expires_at INTEGER NOT NULL
);
CREATE INDEX auth_enrollments_expiry_idx ON auth_enrollments(expires_at);
CREATE TABLE recovery_codes (
 hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER
);
CREATE INDEX recovery_codes_user_idx ON recovery_codes(user_id);
