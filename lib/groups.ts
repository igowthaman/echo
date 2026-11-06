import { randomUUID } from 'node:crypto';
import { getDb } from './db';
import { PUBLIC_USER_COLUMNS, toPublicUser, type PublicUser } from './users';

// Groups and who is in them. Who may change what is decided in
// app/actions/groups.ts; these functions only read and write.

export const MAX_GROUP_MEMBERS = 12;
export const MAX_GROUP_NAME_LENGTH = 40;

export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupMember = PublicUser & { role: GroupRole };
export type Group = { id: string; name: string; createdAt: number; members: GroupMember[] };

const ROLE_ORDER: Record<GroupRole, number> = { owner: 0, admin: 1, member: 2 };

export function groupNameProblem(name: string): string | null {
  if (!name) return 'Give the group a name.';
  if (name.length > MAX_GROUP_NAME_LENGTH) return `Keep the name to ${MAX_GROUP_NAME_LENGTH} characters or fewer.`;
  return null;
}

/** Every group the user belongs to, with its members (owner first, then admins). */
export function listGroups(userId: string): Group[] {
  const db = getDb();
  const groups = db
    .prepare(
      `SELECT g.id, g.name, g.created_at FROM groups g
         JOIN group_members m ON m.group_id = g.id
        WHERE m.user_id = ?
        ORDER BY g.created_at`,
    )
    .all(userId) as { id: string; name: string; created_at: number }[];
  if (groups.length === 0) return [];

  const placeholders = groups.map(() => '?').join(', ');
  const members = db
    .prepare(
      `SELECT m.group_id, m.role, m.added_at, ${PUBLIC_USER_COLUMNS}
         FROM group_members m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN avatars a ON a.user_id = u.id
        WHERE m.group_id IN (${placeholders})`,
    )
    .all(...groups.map((g) => g.id)) as (Parameters<typeof toPublicUser>[0] & {
    group_id: string;
    role: GroupRole;
    added_at: number;
  })[];

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    createdAt: g.created_at,
    members: members
      .filter((m) => m.group_id === g.id)
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.added_at - b.added_at)
      .map((m) => ({ ...toPublicUser(m), role: m.role })),
  }));
}

export function getRole(groupId: string, userId: string): GroupRole | null {
  const row = getDb()
    .prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId) as { role: GroupRole } | undefined;
  return row?.role ?? null;
}

export function countMembers(groupId: string): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').get(groupId) as { n: number }).n;
}

/** Creates a group owned by ownerId with the given members. Returns its ID. */
export function createGroup(ownerId: string, name: string, memberIds: string[]): string {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)').run(id, name, now);
    const add = db.prepare('INSERT INTO group_members (group_id, user_id, role, added_at) VALUES (?, ?, ?, ?)');
    add.run(id, ownerId, 'owner', now);
    memberIds.forEach((memberId, index) => add.run(id, memberId, 'member', now + index + 1));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return id;
}

export function addMembers(groupId: string, userIds: string[]): void {
  const add = getDb().prepare(
    'INSERT OR IGNORE INTO group_members (group_id, user_id, role, added_at) VALUES (?, ?, ?, ?)',
  );
  const now = Date.now();
  userIds.forEach((userId, index) => add.run(groupId, userId, 'member', now + index));
}

export function removeMember(groupId: string, userId: string): void {
  getDb().prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
}

export function renameGroup(groupId: string, name: string): void {
  getDb().prepare('UPDATE groups SET name = ? WHERE id = ?').run(name, groupId);
}

export function setRole(groupId: string, userId: string, role: GroupRole): void {
  getDb().prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, groupId, userId);
}

/**
 * Removes the user from the group. When the owner leaves, the longest-serving
 * admin (or, failing that, member) becomes owner. An empty group is deleted.
 */
export function leaveGroup(groupId: string, userId: string): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const role = getRole(groupId, userId);
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
    if (role === 'owner') {
      const next = db
        .prepare(
          `SELECT user_id FROM group_members WHERE group_id = ?
            ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, added_at LIMIT 1`,
        )
        .get(groupId) as { user_id: string } | undefined;
      if (next) setRole(groupId, next.user_id, 'owner');
    }
    if (countMembers(groupId) === 0) db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export type { PublicUser };
