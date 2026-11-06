import type { Metadata } from 'next';
import { Figtree, Young_Serif } from 'next/font/google';
import { getCurrentUser } from '@/lib/auth/current-user';
import { DEFAULT_PALETTE, paletteCss } from './theme/palettes';
import './globals.css';

const bodyFont = Figtree({ subsets: ['latin'], variable: '--font-body' });
const displayFont = Young_Serif({ subsets: ['latin'], weight: '400', variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Echo',
  description: 'Chat and call the people you know, browser to browser.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    // The user's palette is set on the server, so the first paint already has
    // the right colors.
    <html
      lang="en"
      data-palette={user?.palette ?? DEFAULT_PALETTE}
      className={`${bodyFont.variable} ${displayFont.variable}`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: paletteCss() }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
