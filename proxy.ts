import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from './lib/auth/cookie';

const PUBLIC_PATHS = new Set(['/login', '/register']);

// A quick filter only: it checks that a session cookie exists. Pages and
// actions still check the session itself with getCurrentUser().
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token && !PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const response = NextResponse.next();
  // Push the cookie's expiry forward while someone keeps using Echo. Only on
  // page loads, so it can't race with the logout action clearing the cookie.
  if (token && request.method === 'GET') {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  }
  return response;
}

export const config = {
  matcher: ['/((?!api/|_next/|peerjs|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
