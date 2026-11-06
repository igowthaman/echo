import { getDb } from './db';

// Profile pictures. The browser crops and shrinks them before upload; the
// server still checks the bytes, because a request can carry anything.

export const MAX_AVATAR_BYTES = 512 * 1024;

export type AvatarType = 'image/png' | 'image/jpeg' | 'image/webp';

/** Identifies PNG, JPEG and WebP by their first bytes. Anything else (SVG included) is refused. */
export function detectImageType(bytes: Uint8Array): AvatarType | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Stores a picture and returns its new version (a timestamp used to bust caches). */
export function saveAvatar(userId: string, data: Uint8Array, mime: AvatarType): number {
  const updatedAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO avatars (user_id, data, mime, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, mime = excluded.mime, updated_at = excluded.updated_at`,
    )
    .run(userId, data, mime, updatedAt);
  return updatedAt;
}

export function deleteAvatar(userId: string): void {
  getDb().prepare('DELETE FROM avatars WHERE user_id = ?').run(userId);
}

export function getAvatar(userId: string): { data: Uint8Array; mime: string; updatedAt: number } | null {
  const row = getDb()
    .prepare('SELECT data, mime, updated_at FROM avatars WHERE user_id = ?')
    .get(userId) as { data: Uint8Array; mime: string; updated_at: number } | undefined;
  return row ? { data: row.data, mime: row.mime, updatedAt: row.updated_at } : null;
}
