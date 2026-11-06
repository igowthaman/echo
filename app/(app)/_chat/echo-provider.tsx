'use client';

import CallOverlay from './call-overlay';
import { EchoContext } from './echo-context';
import { useEcho, type ContactWithPresence, type Me } from './use-echo';

// Lives in the (app) layout, so the connection stays up while you move
// between pages, and calls can ring on any page.
export function EchoProvider({
  me,
  contacts,
  children,
}: {
  me: Me;
  contacts: ContactWithPresence[];
  children: React.ReactNode;
}) {
  const echo = useEcho(me, contacts);
  return (
    <EchoContext.Provider value={echo}>
      {children}
      <CallOverlay />
    </EchoContext.Provider>
  );
}
