import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { ArrowLeftIcon } from '../_chat/icons';
import PalettePicker from './palette-picker';
import ProfileCard from './profile-card';

export const metadata: Metadata = { title: 'Settings · Echo' };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="grid gap-4 px-4 py-5">
      <div className="flex items-center gap-1">
        <Link href="/" aria-label="Back to chats" title="Back to chats" className="btn-quiet -ml-2 p-2 text-fg">
          <ArrowLeftIcon />
        </Link>
        <h1 className="font-display text-3xl">Settings</h1>
      </div>

      <ProfileCard
        userId={user.id}
        username={user.username}
        displayName={user.displayName}
        avatarVersion={user.avatarVersion}
      />

      <section aria-labelledby="theme-heading" className="card-paper p-6 sm:p-8">
        <h2 id="theme-heading" className="font-display text-xl">
          Theme
        </h2>
        <p className="mt-1 text-sm text-muted">
          Pick the watercolor wash Echo uses. It changes right away and follows your account to any device.
        </p>
        <PalettePicker current={user.palette} />
      </section>
    </div>
  );
}
