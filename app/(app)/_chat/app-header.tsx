'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AccountBadge from './account-badge';
import { useEchoContext } from './echo-context';

export default function AppHeader() {
  const { selected } = useEchoContext();
  const pathname = usePathname();
  // On phones an open conversation fills the screen, like a native chat app.
  // Its own header has the back button, so this one steps aside.
  const threadOpen = pathname === '/' && selected !== null;

  return (
    <header className={`shrink-0 border-b border-line bg-surface ${threadOpen ? 'max-md:hidden' : ''}`}>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-2.5">
        <Link href="/" aria-label="Echo, go to chats" className="font-display text-2xl text-ink">
          Echo
        </Link>
        <AccountBadge />
      </div>
    </header>
  );
}
