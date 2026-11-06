'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { deleteAllUserSessions, deleteUserSession } from '@/lib/auth/session';

/** Logs one of your other devices out. This device logs out with the normal Log out button. */
export async function logOutDevice(sessionId: string): Promise<{ error?: string }> {
  const me = await getCurrentUser();
  if (!me) return { error: 'Your session has ended. Log in again.' };
  if (typeof sessionId !== 'string' || sessionId === me.sessionId) {
    return { error: 'Use Log out to sign out of this device.' };
  }
  if (!deleteUserSession(me.id, sessionId)) return { error: 'That device is already logged out.' };
  revalidatePath('/settings');
  return {};
}

/** Ends every session on every device, including this one. */
export async function logOutEverywhere(): Promise<void> {
  const me = await getCurrentUser();
  if (me) deleteAllUserSessions(me.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
