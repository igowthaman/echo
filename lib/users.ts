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
