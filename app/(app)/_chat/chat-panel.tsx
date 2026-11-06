'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_MESSAGE_LENGTH, type ChatMessage, type ChatRequest, type Conversation } from './use-chat';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function formatTime(sentAt: number) {
  const date = new Date(sentAt);
  const today = new Date().toDateString() === date.toDateString();
  return today ? timeFormat.format(date) : `${dayFormat.format(date)}, ${timeFormat.format(date)}`;
}

function Avatar({ name, connected }: { name: string; connected?: boolean }) {
  return (
    <span aria-hidden className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-wash text-sm font-bold text-ink">
      {name.charAt(0).toUpperCase()}
      {connected && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-ink" />
      )}
    </span>
  );
}

export function RequestList({
  requests,
  onAccept,
  onDecline,
}: {
  requests: ChatRequest[];
  onAccept: (peer: string) => void;
  onDecline: (peer: string) => void;
}) {
  if (requests.length === 0) return null;
  return (
    <section aria-label="Chat requests" className="grid gap-2">
      {requests.map((request) => (
        <div key={request.peer} className="card-paper flex flex-wrap items-center gap-3 px-4 py-3">
          <Avatar name={request.displayName || request.peer} />
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">{request.displayName || request.peer}</strong>
            {request.displayName && request.displayName !== request.peer && (
              <span className="text-muted"> ({request.peer})</span>
            )}{' '}
            wants to chat.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-quiet" onClick={() => onDecline(request.peer)}>
              Decline
            </button>
            <button type="button" className="btn-ink" onClick={() => onAccept(request.peer)}>
              Accept
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

export function ChatPanel({
  conversations,
  messages,
  selected,
  onSelect,
  onSend,
  onReconnect,
}: {
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  selected: string | null;
  onSelect: (peer: string | null) => void;
  onSend: (peer: string, text: string) => boolean;
  onReconnect: (peer: string) => void;
}) {
  const current = conversations.find((c) => c.peer === selected) ?? null;

  return (
    <section
      aria-label="Conversations"
      className="card-paper grid h-[min(620px,78vh)] overflow-hidden md:grid-cols-[230px_minmax(0,1fr)]"
    >
      <div className={`${current ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-line md:border-r`}>
        <h2 className="px-4 pb-2 pt-4 font-display text-xl">Conversations</h2>
        {conversations.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">No conversations yet. Connect to someone above to start one.</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
            {conversations.map((c) => (
              <li key={c.peer}>
                <button
                  type="button"
                  onClick={() => onSelect(c.peer)}
                  aria-current={c.peer === selected ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-wash ${
                    c.peer === selected ? 'bg-wash' : ''
                  }`}
                >
                  <Avatar name={c.displayName} connected={c.connected} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.displayName}</span>
                    <span className="block truncate text-xs text-muted">
                      {c.connected ? 'Connected' : c.peer}
                    </span>
                  </span>
                  {c.unread > 0 && (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-on-ink">
                      <span className="sr-only">Unread messages: </span>
                      {c.unread}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`${current ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col`}>
        {current ? (
          <Thread
            key={current.peer}
            conversation={current}
            messages={messages[current.peer] ?? []}
            onBack={() => onSelect(null)}
            onSend={onSend}
            onReconnect={onReconnect}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted">
            Pick a conversation, or connect to someone above.
          </div>
        )}
      </div>
    </section>
  );
}

function Thread({
  conversation,
  messages,
  onBack,
  onSend,
  onReconnect,
}: {
  conversation: Conversation;
  messages: ChatMessage[];
  onBack: () => void;
  onSend: (peer: string, text: string) => boolean;
  onReconnect: (peer: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const { peer, displayName, connected } = conversation;

  // Keep the newest message in view.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    if (onSend(peer, draft)) setDraft('');
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" onClick={onBack} className="btn-quiet -ml-2 md:hidden" aria-label="Back to conversations">
          ←
        </button>
        <Avatar name={displayName} connected={connected} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{displayName}</p>
          <p className="truncate text-xs text-muted">{connected ? `Connected · ${peer}` : `Not connected · ${peer}`}</p>
        </div>
        {!connected && (
          <button type="button" className="btn-quiet text-sm" onClick={() => onReconnect(peer)}>
            Connect
          </button>
        )}
      </header>

      <div
        ref={logRef}
        role="log"
        aria-label={`Messages with ${displayName}`}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <p className="pt-8 text-center text-sm text-muted">
            {connected ? `No messages yet. Say hello to ${displayName}.` : 'No messages yet.'}
          </p>
        ) : (
          <ol className="grid gap-2.5">
            {messages.map((m) => {
              const mine = m.from === 'me';
              return (
                <li key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap break-words px-3.5 py-2 leading-snug ${
                      mine
                        ? 'rounded-[16px_16px_6px_16px] bg-ink text-on-ink'
                        : 'rounded-[16px_16px_16px_6px] bg-wash text-fg'
                    }`}
                  >
                    <span className="sr-only">{mine ? 'You: ' : `${displayName}: `}</span>
                    {m.text}
                  </div>
                  <time dateTime={new Date(m.sentAt).toISOString()} className="mt-0.5 px-1 text-[0.7rem] text-muted">
                    {formatTime(m.sentAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <label htmlFor="message-input" className="sr-only">
          Message {displayName}
        </label>
        <textarea
          id="message-input"
          rows={1}
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={!connected}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter adds a new line.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={connected ? `Message ${displayName}` : `Connect to ${displayName} to send a message`}
          className="field-input max-h-32 min-h-[44px] flex-1 resize-none"
        />
        <button type="submit" disabled={!connected || !draft.trim()} className="btn-ink">
          Send
        </button>
      </form>
    </>
  );
}
