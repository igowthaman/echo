// Failed logins per username + IP, kept in memory. Fine for one server
// process; several processes would need a shared store.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Entry = { failures: number; windowStart: number };
const globalForLimits = globalThis as typeof globalThis & { __echoLoginFailures?: Map<string, Entry> };
const failures = (globalForLimits.__echoLoginFailures ??= new Map());

const keyFor = (username: string, ip: string) => `${username}\u0000${ip}`;

function current(key: string): Entry | undefined {
  const entry = failures.get(key);
  if (entry && Date.now() - entry.windowStart > WINDOW_MS) {
    failures.delete(key);
    return undefined;
  }
  return entry;
}

export function isLoginBlocked(username: string, ip: string): boolean {
  return (current(keyFor(username, ip))?.failures ?? 0) >= MAX_FAILURES;
}

export function recordLoginFailure(username: string, ip: string): void {
  const key = keyFor(username, ip);
  const entry = current(key);
  if (entry) entry.failures += 1;
  else failures.set(key, { failures: 1, windowStart: Date.now() });
}

export function clearLoginFailures(username: string, ip: string): void {
  failures.delete(keyFor(username, ip));
}
