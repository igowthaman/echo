import { getCurrentUser } from '@/lib/auth/current-user';
import { isOnline } from '@/lib/presence';
import { findUsersByIds, isUserId } from '@/lib/users';

const MAX_IDS = 100;

// GET /api/users?ids=a,b,c → names and online state for those user IDs.
export async function GET(request: Request) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Log in to see other people.' }, { status: 401 });
  }
  const ids = [...new Set((new URL(request.url).searchParams.get('ids') ?? '').split(','))]
    .filter(isUserId)
    .slice(0, MAX_IDS);
  const users = findUsersByIds(ids).map((user) => ({ ...user, online: isOnline(user.id) }));
  return Response.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
}
