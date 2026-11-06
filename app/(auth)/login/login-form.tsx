'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { login, type AuthFormState } from '@/app/actions/auth';

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(login, {});

  return (
    <div className="card-paper p-7 sm:p-8">
      <h1 className="font-display text-4xl text-ink">Echo</h1>
      <p className="mt-2 text-muted">Log in to chat and call the people you know.</p>

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
            defaultValue={state.username}
            className="field-input"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="password" className="text-sm font-semibold">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="field-input"
          />
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-ink mt-1">
          {pending ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        New to Echo?{' '}
        <Link href="/register" className="font-semibold text-ink underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
