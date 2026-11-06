// Cookie settings only. Kept apart from session.ts so proxy.ts can import
// them without pulling in the database.
export const SESSION_COOKIE = 'echo_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  };
}
