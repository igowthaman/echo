'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { register, type AuthFormState } from '@/app/actions/auth';

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(register, {});

  return (
    <div className="card-paper p-7 sm:p-8">
      <h1 className="font-display text-4xl text-ink">Echo</h1>
      <p className="mt-2 text-muted">Create an account. People find you by your username.</p>

      <form action={formAction} className="mt-7 grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="username" className="text-sm font-semibold">
            Username
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]{3,24}"
            aria-describedby="username-hint"
            defaultValue={state.username}
            className="field-input"
          />
          <p id="username-hint" className="text-xs text-muted">
            3 to 24 characters: letters, numbers or _
          </p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="displayName" className="text-sm font-semibold">
            Your name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            autoComplete="name"
            maxLength={40}
            aria-describedby="displayName-hint"
            defaultValue={state.displayName}
            className="field-input"
          />
          <p id="displayName-hint" className="text-xs text-muted">
            Shown to your contacts. Leave it empty to use your username.
          </p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="password" className="text-sm font-semibold">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={200}
            aria-describedby="password-hint"
            className="field-input"
          />
          <p id="password-hint" className="text-xs text-muted">
            At least 8 characters
          </p>
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-ink mt-1">
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-ink underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
