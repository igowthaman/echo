'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie';
import { getDummyHash, hashPassword, verifyPassword } from '@/lib/auth/password';
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from '@/lib/auth/rate-limit';
import { createSession, deleteExpiredSessions, deleteSession } from '@/lib/auth/session';
import { displayNameProblem, normalizeUsername, usernameProblem } from '@/lib/profile-rules';
import { UsernameTakenError, createUser, findLoginByUsername } from '@/lib/users';

export type AuthFormState = {
  error?: string;
  username?: string;
  displayName?: string;
};

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

async function startSession(userId: string) {
  const token = createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

export async function register(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = normalizeUsername(field(formData, 'username'));
  const displayName = field(formData, 'displayName').trim();
  const password = field(formData, 'password');
  const keep = { username, displayName };

  const nameProblem = usernameProblem(username) ?? displayNameProblem(displayName);
  if (nameProblem) return { ...keep, error: nameProblem };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ...keep, error: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ...keep, error: `Use ${MAX_PASSWORD_LENGTH} characters or fewer for your password.` };
  }

  let userId: string;
  try {
    userId = createUser({
      username,
      displayName: displayName || username,
      passwordHash: await hashPassword(password),
    });
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      return { ...keep, error: `The username ${username} is taken. Try another one.` };
    }
    throw error;
  }

  await startSession(userId);
  redirect('/');
}

export async function login(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = normalizeUsername(field(formData, 'username'));
  const password = field(formData, 'password');
  const ip = await clientIp();

  if (isLoginBlocked(username, ip)) {
    return { username, error: 'Too many attempts. Wait 15 minutes, then try again.' };
  }

  const account = findLoginByUsername(username);
  // Check a dummy hash for unknown usernames so both failures take the same time.
  const passwordOk = await verifyPassword(password, account?.passwordHash ?? (await getDummyHash()));
  if (!account || !passwordOk) {
    recordLoginFailure(username, ip);
    return { username, error: 'Username or password is incorrect.' };
  }

  clearLoginFailures(username, ip);
  deleteExpiredSessions();
  await startSession(account.id);
  redirect('/');
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
