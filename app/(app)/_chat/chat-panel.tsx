'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from './avatar';
import { useEchoContext } from './echo-context';
import { ArrowLeftIcon, PhoneIcon, PlusIcon, VideoIcon } from './icons';
import { MAX_MESSAGE_LENGTH, type ChatMessage, type Conversation } from './use-echo';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function formatTime(sentAt: number) {
  const date = new Date(sentAt);
  const today = new Date().toDateString() === date.toDateString();
  return today ? timeFormat.format(date) : `${dayFormat.format(date)}, ${timeFormat.format(date)}`;
}

const presenceLabel = (c: Conversation) => (c.connected ? 'Connected' : c.online ? 'Online' : 'Offline');

export function RequestList() {
  const echo = useEchoContext();
  if (echo.requests.length === 0) return null;
  return (
    <section aria-label="Chat requests" className="grid gap-2 px-4 py-3 sm:p-0">
      {echo.requests.map(({ id, profile }) => {
        const name = profile?.displayName ?? 'Someone';
        return (
          <div key={id} className="card-paper flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar userId={id} name={name} version={profile?.avatarVersion} />
            <p className="min-w-0 flex-1">
              <strong className="font-semibold">{name}</strong>
              {profile && profile.username !== profile.displayName && (
                <span className="text-muted"> ({profile.username})</span>
              )}{' '}
              wants to chat. Accepting adds them to your contacts.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-quiet" onClick={() => echo.decline(id)}>
                Decline
              </button>
              <button type="button" className="btn-ink" onClick={() => echo.accept(id)}>
                Accept
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// The Contacts heading, with an Add button that opens a username field.
function AddContact({ startOpen }: { startOpen: boolean }) {
  const echo = useEchoContext();
  const [open, setOpen] = useState(startOpen);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setUsername('');
    setError('');
    toggleRef.current?.focus();
  };

  return (
    <div className="px-4 pb-2 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl">Contacts</h2>
        <button
          ref={toggleRef}
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
          aria-controls="add-contact-form"
          className="btn-quiet -mr-2 text-sm"
        >
          {open ? (
            'Cancel'
          ) : (
            <>
              <PlusIcon />
              Add
            </>
          )}
        </button>
      </div>

      {open && (
        <form
          id="add-contact-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            const problem = await echo.addContact(username);
            setBusy(false);
            if (problem) {
              setError(problem);
              return;
            }
            setOpen(false);
            setUsername('');
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
          className="mt-3 grid gap-2"
        >
          <label htmlFor="add-contact-username" className="text-xs font-semibold text-muted">
            Add a contact by username
          </label>
          <div className="flex gap-2">
            <input
              id="add-contact-username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                if (error) setError('');
              }}
              placeholder="Their username"
              autoFocus
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'add-contact-error' : undefined}
              className="field-input min-w-0 flex-1 py-2"
            />
            <button type="submit" disabled={busy || !username.trim()} className="btn-ink px-3 py-2 text-sm">
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
          {error && (
            <p id="add-contact-error" role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

export function ChatPanel() {
  const echo = useEchoContext();
  const { conversations, selected } = echo;
  const current = conversations.find((c) => c.id === selected) ?? null;

  return (
    <section
      aria-label="Conversations"
      className="grid min-h-0 flex-1 overflow-hidden bg-surface sm:card-paper sm:min-h-[420px] md:grid-cols-[240px_minmax(0,1fr)]"
    >
      <div className={`${current ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-line md:border-r`}>
        <AddContact startOpen={conversations.length === 0} />
        {conversations.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">
            No contacts yet. Add someone by their username to start chatting.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => echo.select(c.id)}
                  aria-current={c.id === selected ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-wash ${
                    c.id === selected ? 'bg-wash' : ''
                  }`}
                >
                  <Avatar userId={c.id} name={c.displayName} version={c.avatarVersion} dot={c.online ? 'bg-ink' : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.displayName}</span>
                    <span className="block truncate text-xs text-muted">{presenceLabel(c)}</span>
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
          <Thread key={current.id} conversation={current} messages={echo.messages[current.id] ?? []} />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted">
            Pick a contact to chat or call.
          </div>
        )}
      </div>
    </section>
  );
}

function Thread({ conversation, messages }: { conversation: Conversation; messages: ChatMessage[] }) {
  const echo = useEchoContext();
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const { id, displayName, username, online, connected } = conversation;
  const inCall = echo.calls.state.phase !== 'idle';

  // Keep the newest message in view.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    if (echo.send(id, draft)) setDraft('');
  };

  const placeholder = connected
    ? `Message ${displayName}`
    : online
      ? `Connecting to ${displayName}…`
      : `${displayName} is offline. You can message them when you're both online.`;

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" onClick={() => echo.select(null)} className="btn-quiet -ml-2 p-2 text-fg md:hidden" aria-label="Back to contacts">
          <ArrowLeftIcon />
        </button>
        <Avatar userId={id} name={displayName} version={conversation.avatarVersion} dot={online ? 'bg-ink' : undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{displayName}</p>
          <p className="truncate text-xs text-muted">
            {presenceLabel(conversation)}
            {username && ` · ${username}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!connected && online && (
            <button type="button" className="btn-quiet text-sm" onClick={() => echo.connect(id)}>
              Connect
            </button>
          )}
          <button
            type="button"
            className="btn-quiet text-sm"
            disabled={!online || inCall}
            onClick={() => echo.calls.start(id, 'audio')}
            title={online ? `Voice call ${displayName}` : `${displayName} is offline`}
          >
            <PhoneIcon />
            <span className="sr-only sm:not-sr-only">Call</span>
          </button>
          <button
            type="button"
            className="btn-quiet text-sm"
            disabled={!online || inCall}
            onClick={() => echo.calls.start(id, 'video')}
            title={online ? `Video call ${displayName}` : `${displayName} is offline`}
          >
            <VideoIcon />
            <span className="sr-only sm:not-sr-only">Video</span>
          </button>
        </div>
      </header>

      <div ref={logRef} role="log" aria-label={`Messages with ${displayName}`} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
                      mine ? 'rounded-[16px_16px_6px_16px] bg-ink text-on-ink' : 'rounded-[16px_16px_16px_6px] bg-wash text-fg'
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
        className="flex items-end gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
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
          placeholder={placeholder}
          className="field-input max-h-32 min-h-[44px] flex-1 resize-none"
        />
        <button type="submit" disabled={!connected || !draft.trim()} className="btn-ink">
          Send
        </button>
      </form>
    </>
  );
}
