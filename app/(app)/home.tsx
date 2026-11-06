'use client';

import { useState } from 'react';
import { ChatPanel, RequestList } from './_chat/chat-panel';
import { useChat, type PeerStatus } from './_chat/use-chat';

const STATUS_TEXT: Record<PeerStatus, (username: string) => string> = {
  connecting: () => 'Connecting to Echo…',
  online: (username) => `Online as ${username}`,
  offline: () => "Can't reach the Echo server. Trying again…",
  taken: () => 'Echo is open in another tab or window. Close it, then reload this page.',
};

export default function Home({ username, displayName }: { username: string; displayName: string }) {
  const chat = useChat(username, displayName);
  const [target, setTarget] = useState('');

  return (
    <div className="grid gap-6">
      <section className="card-paper relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="wash-blob wash-blob-wash -right-24 -top-24 h-64 w-80" />
        <div className="relative">
          <h1 className="font-display text-3xl sm:text-4xl">Hi, {displayName}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${chat.status === 'online' ? 'bg-ink' : 'bg-line'}`}
            />
            {STATUS_TEXT[chat.status](username)}
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (chat.connectTo(target)) setTarget('');
            }}
            className="mt-6 flex flex-wrap gap-2"
          >
            <label htmlFor="connect-username" className="sr-only">
              Username to chat with
            </label>
            <input
              id="connect-username"
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
                if (chat.error) chat.clearError();
              }}
              placeholder="Their username"
              autoCapitalize="none"
              spellCheck={false}
              className="field-input min-w-0 flex-1 basis-48"
            />
            <button type="submit" disabled={chat.status !== 'online' || !target.trim()} className="btn-ink">
              Connect
            </button>
          </form>
          {chat.error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {chat.error}
            </p>
          )}
        </div>
      </section>

      <RequestList requests={chat.requests} onAccept={chat.accept} onDecline={chat.decline} />

      <ChatPanel
        conversations={chat.conversations}
        messages={chat.messages}
        selected={chat.selected}
        onSelect={chat.select}
        onSend={chat.send}
        onReconnect={(peer) => chat.connectTo(peer)}
      />
    </div>
  );
}
