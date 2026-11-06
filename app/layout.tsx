import type { Metadata, Viewport } from 'next';
import { Figtree, Young_Serif } from 'next/font/google';
import { getCurrentUser } from '@/lib/auth/current-user';
import ServiceWorker from './service-worker';
import { DEFAULT_PALETTE, paletteCss } from './theme/palettes';
import './globals.css';

const bodyFont = Figtree({ subsets: ['latin'], variable: '--font-body' });
const displayFont = Young_Serif({ subsets: ['latin'], weight: '400', variable: '--font-display' });

export const metadata: Metadata = {
  title: 'Echo',
  applicationName: 'Echo',
  description: 'Chat and call the people you know, browser to browser.',
  appleWebApp: { capable: true, title: 'Echo', statusBarStyle: 'default' },
  // Listing icons here replaces Next's automatic link for app/icon.svg, so both are named.
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false, email: false, address: false },
};

// Phone settings: draw under notches (safe-area padding keeps content clear),
// shrink the page when the keyboard opens so the message box stays visible,
// and colour the status bar to match the header.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#1F2228' },
  ],
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
      <body className="antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
