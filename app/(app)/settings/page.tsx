import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { describeDevice } from '@/lib/auth/device';
import { listSessions } from '@/lib/auth/session';
import { ArrowLeftIcon } from '../_chat/icons';
import DevicesCard, { type DeviceRow } from './devices-card';
import PalettePicker from './palette-picker';
import ProfileCard from './profile-card';

export const metadata: Metadata = { title: 'Settings · Echo' };

const signedInFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function activeLabel(lastSeenAt: number, now: number): string {
  const minutes = Math.round((now - lastSeenAt) / 60_000);
  if (minutes < 5) return 'Active now';
  if (minutes < 60) return `Active ${relative.format(-minutes, 'minute')}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Active ${relative.format(-hours, 'hour')}`;
  return `Active ${relative.format(-Math.round(hours / 24), 'day')}`;
}

// "::ffff:192.168.1.5" is how Node writes an IPv4 address on a dual-stack socket.
const tidyIp = (ip: string | null) => (!ip || ip === 'unknown' ? null : ip.replace(/^::ffff:/, ''));

export default async function SettingsPage() {
  const user = await requireUser();
  const now = Date.now();
  const devices: DeviceRow[] = listSessions(user.id)
    .map((session) => {
      const device = describeDevice(session.userAgent);
      const current = session.id === user.sessionId;
      return {
        id: session.id,
        name: device.name,
        kind: device.kind,
        current,
        active: current ? 'Active now' : activeLabel(session.lastSeenAt, now),
        signedIn: `Signed in ${signedInFormat.format(session.createdAt)}`,
        ip: tidyIp(session.ip),
      };
    })
    // This device first, then the most recently active.
    .sort((a, b) => Number(b.current) - Number(a.current));

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-1">
        <Link href="/" aria-label="Back to chats" title="Back to chats" className="btn-quiet -ml-2 p-2 text-fg">
          <ArrowLeftIcon />
        </Link>
        <h1 className="font-display text-3xl">Settings</h1>
      </div>

      <ProfileCard
        userId={user.id}
        username={user.username}
        displayName={user.displayName}
        avatarVersion={user.avatarVersion}
      />

      <section aria-labelledby="theme-heading" className="card-paper p-6 sm:p-8">
        <h2 id="theme-heading" className="font-display text-xl">
          Theme
        </h2>
        <p className="mt-1 text-sm text-muted">
          Pick the watercolor wash Echo uses. It changes right away and follows your account to any device.
        </p>
        <PalettePicker current={user.palette} />
      </section>

      <DevicesCard devices={devices} />
    </div>
  );
}
