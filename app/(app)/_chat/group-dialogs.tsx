'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from './avatar';
import { useEchoContext } from './echo-context';
import { CloseIcon } from './icons';
import type { GroupConversation, GroupMember, GroupRole } from './use-echo';

const MAX_GROUP_MEMBERS = 12;
const MAX_GROUP_NAME_LENGTH = 40;
const ROLE_LABEL: Record<GroupRole, string | null> = { owner: 'Owner', admin: 'Admin', member: null };

/** A native modal dialog: keeps focus inside, closes on Escape or a click outside. */
function Modal({
  open,
  onClose,
  title,
  titleId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  // Listen to the dialog itself: Escape closes it natively. Some browsers fire only
  // "cancel" for that, so both events count as closing.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('cancel', handleClose);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('cancel', handleClose);
      dialog.removeEventListener('close', handleClose);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="card-paper w-[min(440px,calc(100vw-2rem))] p-0 text-fg backdrop:bg-[rgba(16,18,24,0.55)]"
    >
      <div className="grid max-h-[85dvh] gap-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="truncate font-display text-xl">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-quiet -mr-2 p-2">
            <CloseIcon />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

type Person = { id: string; displayName: string; username: string; avatarVersion: number | null };

/** Checkboxes for picking people from your contacts. */
function PeoplePicker({
  people,
  chosen,
  onChange,
  limit,
}: {
  people: Person[];
  chosen: Set<string>;
  onChange: (next: Set<string>) => void;
  limit: number;
}) {
  if (people.length === 0) {
    return <p className="text-sm text-muted">Everyone in your contacts is already here. Add contacts first to invite more people.</p>;
  }
  return (
    <ul className="grid gap-1">
      {people.map((person) => {
        const checked = chosen.has(person.id);
        const full = !checked && chosen.size >= limit;
        return (
          <li key={person.id}>
            <label
              className={`flex items-center gap-3 rounded-[12px] px-2 py-2 ${full ? 'opacity-50' : 'cursor-pointer hover:bg-wash'}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={full}
                onChange={() => {
                  const next = new Set(chosen);
                  if (checked) next.delete(person.id);
                  else next.add(person.id);
                  onChange(next);
                }}
                className="h-4 w-4 accent-[var(--ink)]"
              />
              <Avatar userId={person.id} name={person.displayName} version={person.avatarVersion} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{person.displayName}</span>
                <span className="block truncate text-xs text-muted">{person.username}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function NewGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New group" titleId="new-group-title">
      <NewGroupForm onDone={onClose} />
    </Modal>
  );
}

function NewGroupForm({ onDone }: { onDone: () => void }) {
  const echo = useEchoContext();
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const contacts = echo.conversations.filter((c) => c.isContact);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const problem = await echo.groups.create(name, [...chosen]);
        setBusy(false);
        if (problem) setError(problem);
        else onDone();
      }}
      className="grid gap-4"
    >
      <div className="grid gap-1.5">
        <label htmlFor="new-group-name" className="text-sm font-semibold">
          Group name
        </label>
        <input
          id="new-group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_GROUP_NAME_LENGTH}
          placeholder="Weekend sketchers"
          autoFocus
          className="field-input"
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">
          People <span className="font-normal text-muted">({chosen.size} chosen)</span>
        </legend>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted">Add some contacts first, then make a group with them.</p>
        ) : (
          <PeoplePicker people={contacts} chosen={chosen} onChange={setChosen} limit={MAX_GROUP_MEMBERS - 1} />
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <button type="button" onClick={onDone} className="btn-quiet">
          Cancel
        </button>
        <button type="submit" disabled={busy || !name.trim() || chosen.size === 0} className="btn-ink">
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </div>
    </form>
  );
}

export function GroupMembersDialog({
  conversation,
  open,
  onClose,
}: {
  conversation: GroupConversation;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={conversation.group.name} titleId="group-members-title">
      <GroupMembers conversation={conversation} onLeft={onClose} />
    </Modal>
  );
}

function GroupMembers({ conversation, onLeft }: { conversation: GroupConversation; onLeft: () => void }) {
  const echo = useEchoContext();
  const { group, myRole } = conversation;
  const canManage = myRole === 'owner' || myRole === 'admin';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(group.name);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [confirmLeave, setConfirmLeave] = useState(false);

  const run = async (label: string, change: () => Promise<string | null>) => {
    setBusy(label);
    setError('');
    const problem = await change();
    setBusy(null);
    if (problem) setError(problem);
    return !problem;
  };

  const memberIds = new Set(group.members.map((m) => m.id));
  const addable = echo.conversations.filter((c) => c.isContact && !memberIds.has(c.id));
  const nextOwner =
    group.members.find((m) => m.role === 'admin') ?? group.members.find((m) => m.role === 'member') ?? null;

  // What this user may do to a member: the owner can do anything to anyone
  // else; admins can only remove ordinary members.
  const canRemove = (member: GroupMember) =>
    member.id !== echo.me.id && (myRole === 'owner' || (myRole === 'admin' && member.role === 'member'));
  const canChangeAdmin = (member: GroupMember) => myRole === 'owner' && member.role !== 'owner';

  return (
    <div className="grid gap-5">
      {canManage &&
        (renaming ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (await run('rename', () => echo.groups.rename(group.id, newName))) setRenaming(false);
            }}
            className="flex gap-2"
          >
            <label htmlFor="rename-group" className="sr-only">
              Group name
            </label>
            <input
              id="rename-group"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={MAX_GROUP_NAME_LENGTH}
              autoFocus
              className="field-input min-w-0 flex-1 py-2"
            />
            <button type="submit" disabled={!!busy || !newName.trim()} className="btn-ink px-3 py-2 text-sm">
              Save
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="btn-quiet text-sm">
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setRenaming(true)} className="btn-quiet -ml-2 justify-self-start text-sm">
            Rename group
          </button>
        ))}

      <section aria-labelledby="members-heading" className="grid gap-2">
        <h3 id="members-heading" className="text-sm font-semibold">
          {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
        </h3>
        <ul className="grid divide-y divide-line">
          {group.members.map((member) => {
            const you = member.id === echo.me.id;
            const online = you || !!echo.groups.presence[member.id];
            return (
              <li key={member.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar
                  userId={member.id}
                  name={member.displayName}
                  version={member.avatarVersion}
                  dot={online ? 'bg-ink' : undefined}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 truncate font-semibold">
                    {member.displayName}
                    {you && <span className="font-normal text-muted">(you)</span>}
                    {ROLE_LABEL[member.role] && (
                      <span className="rounded-full bg-wash px-2 py-0.5 text-xs font-semibold text-ink">
                        {ROLE_LABEL[member.role]}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">{member.username}</span>
                </span>
                {(canChangeAdmin(member) || canRemove(member)) && (
                  <span className="flex gap-1">
                    {canChangeAdmin(member) && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => run(member.id, () => echo.groups.setAdmin(group.id, member.id, member.role !== 'admin'))}
                        className="btn-quiet text-xs"
                      >
                        {member.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      </button>
                    )}
                    {canRemove(member) && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => run(member.id, () => echo.groups.removeMember(group.id, member.id))}
                        className="btn-quiet text-xs text-danger"
                      >
                        Remove
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {myRole === 'owner' && (
          <p className="text-xs text-muted">Admins can add and remove people and rename the group. Only you choose admins.</p>
        )}
      </section>

      {canManage && (
        <section aria-label="Add people" className="grid gap-2">
          {adding ? (
            <>
              <h3 className="text-sm font-semibold">Add people</h3>
              <PeoplePicker
                people={addable}
                chosen={toAdd}
                onChange={setToAdd}
                limit={MAX_GROUP_MEMBERS - group.members.length}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(false)} className="btn-quiet text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!!busy || toAdd.size === 0}
                  onClick={async () => {
                    if (await run('add', () => echo.groups.addMembers(group.id, [...toAdd]))) {
                      setAdding(false);
                      setToAdd(new Set());
                    }
                  }}
                  className="btn-ink text-sm"
                >
                  {busy === 'add' ? 'Adding…' : `Add ${toAdd.size || ''}`.trim()}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              disabled={group.members.length >= MAX_GROUP_MEMBERS}
              onClick={() => setAdding(true)}
              className="btn-control justify-self-start text-sm"
            >
              {group.members.length >= MAX_GROUP_MEMBERS ? `Group is full (${MAX_GROUP_MEMBERS})` : 'Add people'}
            </button>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="border-t border-line pt-4">
        {confirmLeave ? (
          <div className="grid gap-3">
            <p className="text-sm">
              {myRole === 'owner' && group.members.length > 1
                ? `Leave ${group.name}? ${nextOwner && nextOwner.id !== echo.me.id ? nextOwner.displayName : 'The next member'} becomes the owner.`
                : group.members.length === 1
                  ? `You're the only member, so leaving deletes ${group.name}.`
                  : `Leave ${group.name}? You'll stop getting its messages.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                autoFocus
                onClick={async () => {
                  if (await run('leave', () => echo.groups.leave(group.id))) onLeft();
                }}
                className="btn-danger"
              >
                {busy === 'leave' ? 'Leaving…' : 'Leave group'}
              </button>
              <button type="button" onClick={() => setConfirmLeave(false)} className="btn-quiet">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmLeave(true)} className="btn-quiet -ml-2 text-danger">
            Leave group
          </button>
        )}
      </div>
    </div>
  );
}
