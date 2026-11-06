import { getDb } from './db';
import { PUBLIC_USER_COLUMNS, toPublicUser, type PublicUser } from './users';

// Contacts are one-way: Alice adding Bob doesn't add Alice to Bob's list.
// Echo adds a contact when you connect to someone or accept their request.

export function listContacts(ownerId: string): PublicUser[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PUBLIC_USER_COLUMNS}
         FROM contacts c
         JOIN users u ON u.id = c.contact_id
         LEFT JOIN avatars a ON a.user_id = u.id
        WHERE c.owner_id = ?
        ORDER BY u.display_name COLLATE NOCASE`,
    )
    .all(ownerId) as Parameters<typeof toPublicUser>[0][];
  return rows.map(toPublicUser);
}

export function addContact(ownerId: string, contactId: string): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO contacts (owner_id, contact_id, added_at) VALUES (?, ?, ?)')
    .run(ownerId, contactId, Date.now());
}

/** The IDs of everyone in ownerId's contacts. */
export function contactIdsOf(ownerId: string): Set<string> {
  const rows = getDb().prepare('SELECT contact_id FROM contacts WHERE owner_id = ?').all(ownerId) as {
    contact_id: string;
  }[];
  return new Set(rows.map((row) => row.contact_id));
}
