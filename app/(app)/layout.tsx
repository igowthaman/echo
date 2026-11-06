import { requireUser } from '@/lib/auth/current-user';
import { listContacts } from '@/lib/contacts';
import { isOnline } from '@/lib/presence';
import AppHeader from './_chat/app-header';
import { EchoProvider } from './_chat/echo-provider';
import Notices from './_chat/notices';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const contacts = listContacts(user.id).map((contact) => ({ ...contact, online: isOnline(contact.id) }));

  return (
    <EchoProvider me={{ id: user.id, username: user.username, displayName: user.displayName, avatarVersion: user.avatarVersion }} contacts={contacts}>
      {/* A full-screen app shell: the header stays put and the page fills the rest.
          dvh follows the on-screen keyboard, so the message box stays visible. */}
      <div className="flex h-dvh flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
        <AppHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
            <Notices />
            {children}
          </div>
        </main>
      </div>
    </EchoProvider>
  );
}
