'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, GroupAvatar } from './avatar';
import { useEchoContext } from './echo-context';
import { GroupMembersDialog, NewGroupDialog } from './group-dialogs';
import { PhoneIcon, PlusIcon, UsersIcon, VideoIcon } from './icons';
import {
  MAX_CALL_PARTICIPANTS,
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
  type Conversation,
  type GroupConversation,
} from './use-echo';

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
    <section aria-label="Chat requests" className="grid gap-2">
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

// The Chats heading, with Add (a contact by username) and Group (a new group) buttons.
function AddContact({ startOpen }: { startOpen: boolean }) {
  const echo = useEchoContext();
  const [open, setOpen] = useState(startOpen);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
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
      <div className="flex items-center justify-between gap-1">
        <h2 className="font-display text-xl">Chats</h2>
        <div className="-mr-2 flex">
          <button
            ref={toggleRef}
            type="button"
            onClick={() => (open ? close() : setOpen(true))}
            aria-expanded={open}
            aria-controls="add-contact-form"
            title="Add a contact"
            className="btn-quiet px-2 text-sm"
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
          <button
            type="button"
            onClick={() => setNewGroupOpen(true)}
            title="Make a group"
            className="btn-quiet px-2 text-sm"
          >
            <UsersIcon />
            Group
          </button>
        </div>
      </div>
      <NewGroupDialog open={newGroupOpen} onClose={() => setNewGroupOpen(false)} />

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

const sectionLabel = 'px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted';

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-on-ink">
      <span className="sr-only">Unread messages: </span>
      {count}
    </span>
  );
}

function groupSubtitle(g: GroupConversation) {
  if (g.call) return `Call in progress · ${g.call.participants.length} on it`;
  return `${g.group.members.length} members · ${g.onlineCount} online`;
}

export function ChatPanel() {
  const echo = useEchoContext();
  const { conversations, selected } = echo;
  const groups = echo.groups.list;
  const currentGroup = groups.find((g) => g.key === selected) ?? null;
  const current = currentGroup ? null : (conversations.find((c) => c.id === selected) ?? null);
  const open = !!(current || currentGroup);
  const empty = conversations.length === 0 && groups.length === 0;

  const rowClass = (active: boolean) =>
    `flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-wash ${active ? 'bg-wash' : ''}`;

  return (
    <section
      aria-label="Conversations"
      className="card-paper grid h-[min(760px,calc(100dvh_-_8.5rem))] min-h-[420px] overflow-hidden md:grid-cols-[240px_minmax(0,1fr)]"
    >
      <div className={`${open ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-line md:border-r`}>
        <AddContact startOpen={conversations.length === 0} />
        {empty ? (
          <p className="px-4 pb-4 text-sm text-muted">
            No contacts yet. Add someone by their username to start chatting.
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {groups.length > 0 && (
              <>
                <h3 className={sectionLabel}>Groups</h3>
                <ul>
                  {groups.map((g) => (
                    <li key={g.key}>
                      <button
                        type="button"
                        onClick={() => echo.select(g.key)}
                        aria-current={g.key === selected ? 'true' : undefined}
                        className={rowClass(g.key === selected)}
                      >
                        <GroupAvatar name={g.group.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{g.group.name}</span>
                          <span className={`block truncate text-xs ${g.call ? 'font-semibold text-ink' : 'text-muted'}`}>
                            {groupSubtitle(g)}
                          </span>
                        </span>
                        <UnreadBadge count={g.unread} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {conversations.length > 0 && (
              <>
                {groups.length > 0 && <h3 className={sectionLabel}>Contacts</h3>}
                <ul>
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => echo.select(c.id)}
                        aria-current={c.id === selected ? 'true' : undefined}
                        className={rowClass(c.id === selected)}
                      >
                        <Avatar userId={c.id} name={c.displayName} version={c.avatarVersion} dot={c.online ? 'bg-ink' : undefined} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{c.displayName}</span>
                          <span className="block truncate text-xs text-muted">{presenceLabel(c)}</span>
                        </span>
                        <UnreadBadge count={c.unread} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <div className={`${open ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col`}>
        {currentGroup ? (
          <GroupThread key={currentGroup.key} conversation={currentGroup} messages={echo.messages[currentGroup.key] ?? []} />
        ) : current ? (
          <Thread key={current.id} conversation={current} messages={echo.messages[current.id] ?? []} />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted">
            Pick a chat, or make a group.
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
        <button type="button" onClick={() => echo.select(null)} className="btn-quiet -ml-2 md:hidden" aria-label="Back to contacts">
          ←
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

function GroupThread({ conversation, messages }: { conversation: GroupConversation; messages: ChatMessage[] }) {
  const echo = useEchoContext();
  const [draft, setDraft] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const { group, onlineCount, call } = conversation;
  const busy = echo.calls.state.phase !== 'idle' || !!echo.groupCalls.active;
  const callFull = !!call && call.participants.length >= MAX_CALL_PARTICIPANTS;

  // Keep the newest message in view.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    if (echo.groups.send(group.id, draft)) setDraft('');
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button type="button" onClick={() => echo.select(null)} className="btn-quiet -ml-2 md:hidden" aria-label="Back to chats">
          ←
        </button>
        <GroupAvatar name={group.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{group.name}</p>
          <p className="truncate text-xs text-muted">
            {group.members.length} members · {onlineCount} online
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {call ? (
            <button
              type="button"
              className="btn-ink px-3 py-1.5 text-sm"
              disabled={busy || callFull}
              onClick={() => echo.groupCalls.join(group.id)}
              title={callFull ? `Group calls are limited to ${MAX_CALL_PARTICIPANTS} people` : 'Join the call'}
            >
              {call.kind === 'video' ? <VideoIcon /> : <PhoneIcon />}
              {callFull ? 'Call full' : `Join (${call.participants.length})`}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-quiet text-sm"
                disabled={busy || onlineCount === 0}
                onClick={() => echo.groupCalls.start(group.id, 'audio')}
                title={onlineCount ? `Voice call ${group.name}` : 'No one else is online'}
              >
                <PhoneIcon />
                <span className="sr-only sm:not-sr-only">Call</span>
              </button>
              <button
                type="button"
                className="btn-quiet text-sm"
                disabled={busy || onlineCount === 0}
                onClick={() => echo.groupCalls.start(group.id, 'video')}
                title={onlineCount ? `Video call ${group.name}` : 'No one else is online'}
              >
                <VideoIcon />
                <span className="sr-only sm:not-sr-only">Video</span>
              </button>
            </>
          )}
          <button type="button" className="btn-quiet text-sm" onClick={() => setMembersOpen(true)} title="Members">
            <UsersIcon />
            <span className="sr-only">Members</span>
          </button>
        </div>
      </header>
      <GroupMembersDialog conversation={conversation} open={membersOpen} onClose={() => setMembersOpen(false)} />

      <div ref={logRef} role="log" aria-label={`Messages in ${group.name}`} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="pt-8 text-center text-sm text-muted">No messages yet. Say hello to the group.</p>
        ) : (
          <ol className="grid gap-2.5">
            {messages.map((m, index) => {
              const mine = m.from === 'me';
              const author = m.author ?? '';
              const authorName = mine ? 'You' : echo.nameOf(author);
              // Name each run of messages from the same person.
              const firstOfRun = index === 0 || messages[index - 1].author !== m.author;
              return (
                <li key={m.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {!mine && (
                    <span className="w-7 shrink-0 pt-5">
                      {firstOfRun && (
                        <span className="block scale-[0.8] origin-top-left">
                          <Avatar userId={author} name={authorName} version={echo.profileOf(author)?.avatarVersion} />
                        </span>
                      )}
                    </span>
                  )}
                  <div className={`flex max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && firstOfRun && <span className="mb-0.5 px-1 text-xs font-semibold text-muted">{authorName}</span>}
                    <div
                      className={`whitespace-pre-wrap break-words px-3.5 py-2 leading-snug ${
                        mine ? 'rounded-[16px_16px_6px_16px] bg-ink text-on-ink' : 'rounded-[16px_16px_16px_6px] bg-wash text-fg'
                      }`}
                    >
                      <span className="sr-only">{authorName}: </span>
                      {m.text}
                    </div>
                    <time dateTime={new Date(m.sentAt).toISOString()} className="mt-0.5 px-1 text-[0.7rem] text-muted">
                      {formatTime(m.sentAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {onlineCount === 0 && (
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          No one else is online. Messages go out when a member is online at the same time as you.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <label htmlFor="group-message-input" className="sr-only">
          Message {group.name}
        </label>
        <textarea
          id="group-message-input"
          rows={1}
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter adds a new line.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={`Message ${group.name}`}
          className="field-input max-h-32 min-h-[44px] flex-1 resize-none"
        />
        <button type="submit" disabled={!draft.trim()} className="btn-ink">
          Send
        </button>
      </form>
    </>
  );
}
