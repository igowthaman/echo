'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/current-user';
import { MAX_AVATAR_BYTES, deleteAvatar, detectImageType, saveAvatar } from '@/lib/avatars';
import { displayNameProblem } from '@/lib/profile-rules';
import { setPalette, updateDisplayName } from '@/lib/users';
import { isPaletteId } from '@/app/theme/palettes';

export async function savePalette(palette: string): Promise<{ ok: boolean }> {
  const me = await getCurrentUser();
  if (!me || !isPaletteId(palette)) return { ok: false };
  setPalette(me.id, palette);
  return { ok: true };
}

export type ProfileFormState = {
  error?: string;
  /** Set when a save worked, so the form can close. */
  savedAt?: number;
  displayName?: string;
};

/** Saves the display name. Usernames can't be changed, so any username sent is ignored. */
export async function saveProfile(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const me = await getCurrentUser();
  if (!me) return { error: 'Your session has ended. Log in again to edit your profile.' };

  const displayName = String(formData.get('displayName') ?? '').trim();
  const problem = displayNameProblem(displayName);
  if (problem) return { displayName, error: problem };

  updateDisplayName(me.id, displayName || me.username);
  // Re-render the layout so the header shows the new name.
  revalidatePath('/', 'layout');
  return { savedAt: Date.now() };
}

export async function uploadAvatar(formData: FormData): Promise<{ error?: string }> {
  const me = await getCurrentUser();
  if (!me) return { error: 'Your session has ended. Log in again to change your photo.' };

  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a photo first.' };
  if (file.size > MAX_AVATAR_BYTES) return { error: 'That photo is too large. Try a smaller one.' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return { error: 'Use a JPG, PNG or WebP photo.' };

  saveAvatar(me.id, bytes, type);
  revalidatePath('/', 'layout');
  return {};
}

export async function removeAvatar(): Promise<{ error?: string }> {
  const me = await getCurrentUser();
  if (!me) return { error: 'Your session has ended. Log in again to change your photo.' };
  deleteAvatar(me.id);
  revalidatePath('/', 'layout');
  return {};
}
