import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../db';
import { SESSION_TTL_MS } from './cookie';
import { DEFAULT_PALETTE, isPaletteId, type PaletteId } from '../../app/theme/palettes';

const RENEW_WHEN_LEFT_MS = 15 * 24 * 60 * 60 * 1000;
// "Last active" is updated at most this often, to save a database write per request.
const LAST_SEEN_EVERY_MS = 5 * 60 * 1000;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  palette: PaletteId;
  /** Changes whenever the profile picture changes; null when there is none. */
  avatarVersion: number | null;
  /** The public ID of the session this request came in on. */
  sessionId: string;
};

/** What the browser told us when a session started, for the Devices list. */
export type DeviceDetails = { userAgent: string | null; ip: string | null };

export type SessionSummary = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  userAgent: string | null;
  ip: string | null;
};

// Only the SHA-256 of a token is stored, so a copy of the database can't be
// used to log in.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a session and returns the token to put in the cookie. */
export function createSession(userId: string, device: DeviceDetails): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, id, created_at, last_seen_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      hashToken(token),
      userId,
      now + SESSION_TTL_MS,
      randomBytes(16).toString('hex'),
      now,
      now,
      device.userAgent?.slice(0, 512) ?? null,
      device.ip?.slice(0, 64) ?? null,
    );
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
      `SELECT s.expires_at, s.id AS session_id, s.last_seen_at,
              u.id, u.username, u.display_name, u.palette, a.updated_at AS avatar_version
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN avatars a ON a.user_id = u.id
        WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as
    | {
        expires_at: number;
        session_id: string;
        last_seen_at: number | null;
        id: string;
        username: string;
        display_name: string;
        palette: string;
        avatar_version: number | null;
      }
    | undefined;
  if (!row) return null;

  const now = Date.now();
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  const renew = row.expires_at - now < RENEW_WHEN_LEFT_MS;
  const touch = now - (row.last_seen_at ?? 0) > LAST_SEEN_EVERY_MS;
  if (renew || touch) {
    db.prepare('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?').run(
      renew ? now + SESSION_TTL_MS : row.expires_at,
      now,
      tokenHash,
    );
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    palette: isPaletteId(row.palette) ? row.palette : DEFAULT_PALETTE,
    avatarVersion: row.avatar_version ?? null,
    sessionId: row.session_id,
  };
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

/** Every unexpired session of a user, most recently active first. */
export function listSessions(userId: string): SessionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT id, created_at, last_seen_at, user_agent, ip FROM sessions
        WHERE user_id = ? AND expires_at > ?
        ORDER BY last_seen_at DESC`,
    )
    .all(userId, Date.now()) as {
    id: string;
    created_at: number;
    last_seen_at: number;
    user_agent: string | null;
    ip: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    userAgent: row.user_agent,
    ip: row.ip,
  }));
}

/** Ends one of a user's sessions. Returns false if it wasn't theirs or didn't exist. */
export function deleteUserSession(userId: string, sessionId: string): boolean {
  const result = getDb().prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(sessionId, userId);
  return Number(result.changes) > 0;
}

/** Ends every session of a user: "log out everywhere". */
export function deleteAllUserSessions(userId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function deleteExpiredSessions(): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}
