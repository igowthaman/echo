import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// One SQLite file, opened with Node's built-in driver (no native module to build).
// Set ECHO_DB_PATH to use another file, for example in tests.
const DB_PATH = process.env.ECHO_DB_PATH || path.join(process.cwd(), 'data', 'echo.db');

// Append new migrations to the end; never edit one that has shipped.
// PRAGMA user_version records how many have run.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    palette       TEXT NOT NULL DEFAULT 'lagoon',
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user_id ON sessions(user_id);
  CREATE TABLE contacts (
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at   INTEGER NOT NULL,
    PRIMARY KEY (owner_id, contact_id)
  );
  `,
];

function migrate(db: DatabaseSync) {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = user_version; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

function open(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  // WAL lets server.ts and the Next app share the file safely.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

// Kept on globalThis so Next's hot reload in development doesn't open a new
// connection on every edit.
const globalForDb = globalThis as typeof globalThis & { __echoDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  globalForDb.__echoDb ??= open();
  return globalForDb.__echoDb;
}
