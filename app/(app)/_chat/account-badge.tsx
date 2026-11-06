'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar } from './avatar';
import { useEchoContext } from './echo-context';
import type { PeerStatus } from './use-echo';

const STATUS_LABEL: Record<PeerStatus, string> = {
  online: 'Online',
  connecting: 'Connecting…',
  offline: 'Reconnecting…',
  taken: 'Open in another tab',
};

const DOT: Record<PeerStatus, string> = {
  online: 'bg-ink',
  connecting: 'bg-pigment motion-safe:animate-pulse',
  offline: 'bg-line',
  taken: 'bg-line',
};

// Your name and connection state in the header. Opens your profile and settings.
export default function AccountBadge() {
  const { me, status } = useEchoContext();
  const pathname = usePathname();
  const onSettings = pathname === '/settings';

  return (
    <Link
      href="/settings"
      aria-label={`${me.displayName}, ${STATUS_LABEL[status]}. Profile and settings`}
      aria-current={onSettings ? 'page' : undefined}
      className={`-mr-2 flex min-w-0 items-center gap-2.5 rounded-[12px] px-2 py-1 transition-colors hover:bg-wash ${
        onSettings ? 'bg-wash' : ''
      }`}
    >
      <Avatar userId={me.id} name={me.displayName} version={me.avatarVersion} size="sm" dot={DOT[status]} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold">{me.displayName}</span>
        <span className="block truncate text-xs text-muted" aria-live="polite">
          {STATUS_LABEL[status]}
        </span>
      </span>
    </Link>
  );
}
