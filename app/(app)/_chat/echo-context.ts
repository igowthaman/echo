'use client';

import { createContext, useContext } from 'react';
import type { Echo } from './use-echo';

export const EchoContext = createContext<Echo | null>(null);

/** The signed-in user's Echo connection: contacts, chat and calls. */
export function useEchoContext(): Echo {
  const echo = useContext(EchoContext);
  if (!echo) throw new Error('useEchoContext must be used inside <EchoProvider>.');
  return echo;
}
