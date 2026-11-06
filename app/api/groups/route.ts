import { getCurrentUser } from '@/lib/auth/current-user';
import { listGroups } from '@/lib/groups';

// GET /api/groups → the signed-in user's groups and their members.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: 'Log in to see your groups.' }, { status: 401 });
  return Response.json({ groups: listGroups(me.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
