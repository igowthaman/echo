import { getCurrentUser } from '@/lib/auth/current-user';
import { getAvatar } from '@/lib/avatars';
import { isUserId } from '@/lib/users';

// GET /api/avatars/:userId?v=<version> → that user's profile picture.
// The version changes with every new photo, so each URL can be cached for good.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) {
    return new Response('Log in to see profile pictures.', { status: 401 });
  }
  const { id } = await params;
  const avatar = isUserId(id) ? getAvatar(id) : null;
  if (!avatar) return new Response('No profile picture.', { status: 404 });

  return new Response(new Uint8Array(avatar.data), {
    headers: {
      'Content-Type': avatar.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
