import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect('/');

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-12">
      <div aria-hidden className="wash-blob wash-blob-wash -right-32 -top-28 h-[420px] w-[520px]" />
      <div aria-hidden className="wash-blob wash-blob-pigment -bottom-36 -left-40 h-[380px] w-[460px]" />
      <div className="relative w-full max-w-sm">{children}</div>
    </main>
  );
}
