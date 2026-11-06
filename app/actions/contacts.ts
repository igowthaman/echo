'use server';

import { getCurrentUser } from '@/lib/auth/current-user';
import { addContact } from '@/lib/contacts';
import { findUsersByIds, isUserId, type PublicUser } from '@/lib/users';

/** Adds someone to the current user's contacts. Returns them, or null if that isn't possible. */
export async function addContactAction(contactId: string): Promise<PublicUser | null> {
  const me = await getCurrentUser();
  if (!me || !isUserId(contactId) || contactId === me.id) return null;
  const [contact] = findUsersByIds([contactId]);
  if (!contact) return null;
  addContact(me.id, contact.id);
  return contact;
}
