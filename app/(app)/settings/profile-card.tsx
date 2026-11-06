'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { logout } from '@/app/actions/auth';
import { saveProfile, type ProfileFormState } from '@/app/actions/settings';
import { MAX_DISPLAY_NAME_LENGTH } from '@/lib/profile-rules';
import { Avatar } from '../_chat/avatar';
import { PhotoIcon } from '../_chat/icons';
import PhotoDialog from './photo-dialog';

type Message = { kind: 'status' | 'error'; text: string } | null;

export default function ProfileCard({
  userId,
  username,
  displayName,
  avatarVersion,
}: {
  userId: string;
  username: string;
  displayName: string;
  avatarVersion: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const finishEditing = (saved: boolean) => {
    setEditing(false);
    setMessage(saved ? { kind: 'status', text: 'Profile saved.' } : null);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  const openPhoto = () => {
    setMessage(null);
    setPhotoOpen(true);
  };

  return (
    <section aria-labelledby="profile-heading" className="card-paper p-6 sm:p-8">
      <h2 id="profile-heading" className="font-display text-xl">
        Profile
      </h2>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={openPhoto}
            aria-label={avatarVersion ? 'Change profile photo' : 'Add profile photo'}
            className="group relative rounded-full"
          >
            <Avatar userId={userId} name={displayName} version={avatarVersion} size="xl" />
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-ink text-on-ink transition-transform group-hover:scale-110 [&_svg]:h-3.5 [&_svg]:w-3.5"
            >
              <PhotoIcon />
            </span>
          </button>
          <button type="button" onClick={openPhoto} className="btn-quiet text-xs">
            {avatarVersion ? 'Change photo' : 'Add photo'}
          </button>
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <ProfileForm username={username} displayName={displayName} onDone={finishEditing} />
          ) : (
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{displayName}</p>
                <p className="truncate text-sm text-muted">Username: {username}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  ref={editButtonRef}
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setEditing(true);
                  }}
                  className="btn-control"
                >
                  Edit name
                </button>
                <form action={logout}>
                  <button type="submit" className="btn-control">
                    Log out
                  </button>
                </form>
              </div>
            </div>
          )}

          {message && (
            <p
              role={message.kind === 'error' ? 'alert' : 'status'}
              className={`mt-3 text-sm ${message.kind === 'error' ? 'text-danger' : 'text-muted'}`}
            >
              {message.text}
            </p>
          )}
          <p className="mt-4 text-sm text-muted">
            People add you by your username. Your chat history is kept in this browser only.
          </p>
        </div>
      </div>

      <PhotoDialog
        open={photoOpen}
        onClose={(changed) => {
          setPhotoOpen(false);
          if (changed) setMessage({ kind: 'status', text: changed });
        }}
        userId={userId}
        name={displayName}
        avatarVersion={avatarVersion}
      />
    </section>
  );
}

// Mounted only while editing, so each edit starts with a fresh form state.
function ProfileForm({
  username,
  displayName,
  onDone,
}: {
  username: string;
  displayName: string;
  onDone: (saved: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(saveProfile, {});

  useEffect(() => {
    if (state.savedAt) onDone(true);
    // onDone is recreated on every render of the parent; only a new save should close the form.
  }, [state.savedAt]);

  return (
    <form
      action={formAction}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDone(false);
      }}
      className="grid gap-4"
    >
      <div className="grid gap-1.5">
        <label htmlFor="profile-name" className="text-sm font-semibold">
          Name
        </label>
        <input
          id="profile-name"
          name="displayName"
          autoComplete="name"
          maxLength={MAX_DISPLAY_NAME_LENGTH}
          defaultValue={state.displayName ?? displayName}
          autoFocus
          aria-describedby="profile-name-hint"
          className="field-input"
        />
        <p id="profile-name-hint" className="text-xs text-muted">
          Shown to your contacts. Leave it empty to use your username.
        </p>
      </div>
      <p className="text-sm text-muted">
        Your username, <span className="font-semibold text-fg">{username}</span>, can&apos;t be changed.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn-ink">
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => onDone(false)} className="btn-quiet">
          Cancel
        </button>
      </div>
    </form>
  );
}
