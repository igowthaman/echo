import { createHmac } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/current-user';

const CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;

// GET /api/turn → the ICE servers browsers use to find a route to each other.
//   STUN_URLS    comma-separated, defaults to Google's public STUN server
//   TURN_URLS    comma-separated, e.g. turn:turn.example.com:3478
//   TURN_SECRET  coturn's static-auth-secret (use-auth-secret mode)
// Without TURN, calls and chat fail on networks that block direct connections.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Log in first.' }, { status: 401 });
  }

  const split = (value: string) => value.split(',').map((url) => url.trim()).filter(Boolean);
  const iceServers: RTCIceServer[] = [{ urls: split(process.env.STUN_URLS || 'stun:stun.l.google.com:19302') }];

  const turnUrls = process.env.TURN_URLS;
  const secret = process.env.TURN_SECRET;
  if (turnUrls && secret) {
    // coturn's REST format: username = "<expiry>:<user>", credential = base64(HMAC-SHA1(secret, username)).
    const username = `${Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS}:${user.id}`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    iceServers.push({ urls: split(turnUrls), username, credential });
  }

  return Response.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}
