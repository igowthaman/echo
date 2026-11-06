import type { MetadataRoute } from 'next';

// Makes Echo installable as an app (and is the source for the Android APK).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Echo',
    short_name: 'Echo',
    description: 'Chat and call the people you know, browser to browser.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F8F7F4',
    theme_color: '#FFFFFF',
    categories: ['social', 'communication'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
