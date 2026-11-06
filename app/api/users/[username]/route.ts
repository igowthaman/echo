import { getCurrentUser } from '@/lib/auth/current-user';
import { isOnline } from '@/lib/presence';
import { findUserByUsername } from '@/lib/users';

// GET /api/users/:username → that person's ID, name and online state.
export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Log in to look people up.' }, { status: 401 });
  }
  const { username } = await params;
  const user = findUserByUsername(username.trim().toLowerCase());
  if (!user) {
    return Response.json({ error: 'No one has that username.' }, { status: 404 });
  }
  return Response.json({ ...user, online: isOnline(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
