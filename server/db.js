/**
 * SQLite schema and connection. node:sqlite ships with Node, so there is no
 * dependency, no daemon and nothing to install.
 *
 * Forward-only migrations: `migrate()` is idempotent and safe on every boot.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// 3 adds stripe_events (webhook idempotency). Forward-only: every migration is
// a CREATE ... IF NOT EXISTS in SCHEMA below, so boot re-runs are no-ops.
export const SCHEMA_VERSION = 3;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_renews_at TEXT,
  stripe_customer_id TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT
);

CREATE TABLE IF NOT EXISTS cvs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  text TEXT NOT NULL,
  profile_json TEXT,
  primary_flag INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  remote INTEGER,
  salary_min INTEGER,
  salary_max INTEGER,
  currency TEXT,
  url TEXT,
  description TEXT,
  posted_at TEXT,
  fetched_at TEXT NOT NULL,
  tags_json TEXT,
  dedupe_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cv_id TEXT NOT NULL,
  job_id TEXT,
  job_title TEXT,
  score INTEGER NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT,
  cv_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'pack_ready',
  score INTEGER,
  pack_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  applied_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keywords TEXT NOT NULL,
  locations TEXT,
  remote_only INTEGER NOT NULL DEFAULT 0,
  min_salary INTEGER,
  cadence TEXT NOT NULL DEFAULT 'daily',
  last_run_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id TEXT,
  job_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Account recovery. Neither table ever holds a password, and neither holds a
-- usable bearer credential: only sha256 digests are stored, so a database copy
-- is not a set of password-reset links. ON DELETE CASCADE keeps a deleted
-- account from leaving codes behind.
CREATE TABLE IF NOT EXISTS recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- Stripe webhook deliveries, one row per event id, written before the event is
-- applied. The primary key is the authority: a redelivery (or two deliveries
-- racing each other) hits the key and changes nothing. The type and received_at
-- columns are for the operator reading the table, not for the decision.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  received_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_fetched ON jobs(fetched_at);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_apps_user ON applications(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage(user_id, feature, at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cvs_user ON cvs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id, used_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_code ON recovery_codes(user_id, code_hash);
CREATE INDEX IF NOT EXISTS idx_resets_token ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id, expires_at);
`;

export function openDatabase(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec(SCHEMA);
  db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    String(SCHEMA_VERSION)
  );
}

/** Thin prepared-statement cache — prepare once, reuse. */
export function statements(db) {
  const cache = new Map();
  return (sql) => {
    let statement = cache.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      cache.set(sql, statement);
    }
    return statement;
  };
}
