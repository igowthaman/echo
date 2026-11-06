import { randomUUID } from 'node:crypto';
import { getDb } from './db';

export class UsernameTakenError extends Error {}

export function createUser(input: { username: string; displayName: string; passwordHash: string }): string {
  const id = randomUUID();
  try {
    getDb()
      .prepare(
        'INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, input.username, input.displayName, input.passwordHash, Date.now());
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: users.username')) {
      throw new UsernameTakenError();
    }
    throw error;
  }
  return id;
}

export function findLoginByUsername(username: string): { id: string; passwordHash: string } | null {
  const row = getDb()
    .prepare('SELECT id, password_hash FROM users WHERE username = ?')
    .get(username) as { id: string; password_hash: string } | undefined;
  return row ? { id: row.id, passwordHash: row.password_hash } : null;
}

/** What other people may see about a user. avatarVersion is null when there's no photo. */
export type PublicUser = { id: string; username: string; displayName: string; avatarVersion: number | null };

type PublicUserRow = { id: string; username: string; display_name: string; avatar_version: number | null };
export const PUBLIC_USER_COLUMNS = 'u.id, u.username, u.display_name, a.updated_at AS avatar_version';
export const toPublicUser = (row: PublicUserRow): PublicUser => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  avatarVersion: row.avatar_version ?? null,
});

export function findUserByUsername(username: string): PublicUser | null {
  const row = getDb()
    .prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users u LEFT JOIN avatars a ON a.user_id = u.id WHERE u.username = ?`)
    .get(username) as PublicUserRow | undefined;
  return row ? toPublicUser(row) : null;
}

export function findUsersByIds(ids: string[]): PublicUser[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = getDb()
    .prepare(
      `SELECT ${PUBLIC_USER_COLUMNS} FROM users u LEFT JOIN avatars a ON a.user_id = u.id WHERE u.id IN (${placeholders})`,
    )
    .all(...ids) as PublicUserRow[];
  return rows.map(toPublicUser);
}

/** Changes the name shown to contacts. Usernames can't be changed. */
export function updateDisplayName(userId: string, displayName: string): void {
  getDb().prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
}

export function setPalette(userId: string, palette: string): void {
  getDb().prepare('UPDATE users SET palette = ? WHERE id = ?').run(palette, userId);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUserId = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
