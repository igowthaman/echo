import { logout } from '@/app/actions/auth';
import { requireUser } from '@/lib/auth/current-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-display text-2xl text-ink">Echo</span>
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-wash text-sm font-bold text-ink"
            >
              {user.displayName.charAt(0).toUpperCase()}
            </span>
            <span className="truncate text-sm font-semibold">{user.displayName}</span>
            <form action={logout}>
              <button type="submit" className="btn-quiet text-sm">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
