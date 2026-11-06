'use client';

import { useEffect } from 'react';

/** Registers /sw.js, which lets Echo install as an app and shows a page when offline. */
export default function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Echo works without it; only installing and the offline page need it.
    });
  }, []);
  return null;
}
