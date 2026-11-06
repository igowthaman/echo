'use client';

import { ChatPanel, RequestList } from './_chat/chat-panel';

export default function Home() {
  return (
    // Edge to edge on phones; a card with margins on larger screens.
    <div className="flex min-h-0 flex-1 flex-col sm:gap-4 sm:px-4 sm:py-5">
      <h1 className="sr-only">Chats</h1>
      <RequestList />
      <ChatPanel />
    </div>
  );
}
