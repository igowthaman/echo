// Turns a browser's user-agent string into a name people recognise, like
// "Chrome on Android". Only used for display, so a rough guess is fine.

export type DeviceKind = 'phone' | 'computer' | 'unknown';

export function describeDevice(userAgent: string | null): { name: string; kind: DeviceKind } {
  if (!userAgent) return { name: 'Unknown device', kind: 'unknown' };
  const ua = userAgent;

  // Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser\//.test(ua)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'A browser';

  // Android and ChromeOS user agents also mention Linux, so check them first.
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /CrOS/.test(ua)
        ? 'ChromeOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;

  const kind: DeviceKind = /Mobi|Android|iPhone|iPod/.test(ua) ? 'phone' : os ? 'computer' : 'unknown';
  return { name: os ? `${browser} on ${os}` : browser, kind };
}
