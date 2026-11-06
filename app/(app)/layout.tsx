import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { listContacts } from '@/lib/contacts';
import { listGroups } from '@/lib/groups';
import { isOnline } from '@/lib/presence';
import AccountBadge from './_chat/account-badge';
import { EchoProvider } from './_chat/echo-provider';
import Notices from './_chat/notices';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const contacts = listContacts(user.id).map((contact) => ({ ...contact, online: isOnline(contact.id) }));
  const groups = listGroups(user.id);

  return (
    <EchoProvider me={{ id: user.id, username: user.username, displayName: user.displayName, avatarVersion: user.avatarVersion }}
      contacts={contacts}
      groups={groups}
    >
      <div className="min-h-screen">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-2.5">
            <Link href="/" aria-label="Echo, go to chats" className="font-display text-2xl text-ink">
              Echo
            </Link>
            <AccountBadge />
          </div>
        </header>
        <main className="mx-auto grid max-w-3xl gap-4 px-4 py-5">
          <Notices />
          {children}
        </main>
      </div>
    </EchoProvider>
  );
}
