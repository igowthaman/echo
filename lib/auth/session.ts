import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../db';
import { SESSION_TTL_MS } from './cookie';
import { DEFAULT_PALETTE, isPaletteId, type PaletteId } from '../../app/theme/palettes';

const RENEW_WHEN_LEFT_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  palette: PaletteId;
};

// Only the SHA-256 of a token is stored, so a copy of the database can't be
// used to log in.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a session and returns the token to put in the cookie. */
export function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url');
  getDb()
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}

/**
 * Returns the session's user, or null if the token is missing, unknown or
 * expired. Extends the session when it has less than 15 days left.
 * Synchronous on purpose: server.ts calls it from an 'upgrade' listener.
 */
export function getSessionUser(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const db = getDb();
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.expires_at, u.id, u.username, u.display_name, u.palette
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as
    | { expires_at: number; id: string; username: string; display_name: string; palette: string }
    | undefined;
  if (!row) return null;

  const now = Date.now();
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  if (row.expires_at - now < RENEW_WHEN_LEFT_MS) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(now + SESSION_TTL_MS, tokenHash);
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    palette: isPaletteId(row.palette) ? row.palette : DEFAULT_PALETTE,
  };
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function deleteExpiredSessions(): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}
