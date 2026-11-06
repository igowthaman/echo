// Who is connected to the PeerJS signalling server right now, by user ID.
// server.ts updates it; API routes read it. It lives on globalThis because
// server.ts and Next's bundled route code load separate copies of this
// module inside the same process. Several server processes would need a
// shared store instead.
const globalForPresence = globalThis as typeof globalThis & { __echoPresence?: Set<string> };
const online = (globalForPresence.__echoPresence ??= new Set<string>());

export function markOnline(userId: string): void {
  online.add(userId);
}

export function markOffline(userId: string): void {
  online.delete(userId);
}

export function isOnline(userId: string): boolean {
  return online.has(userId);
}
