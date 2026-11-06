'use client';

import { useState } from 'react';

const SIZES = {
  sm: 'h-8 w-8 text-sm font-bold',
  md: 'h-9 w-9 text-sm font-bold',
  lg: 'h-11 w-11 text-lg font-display',
  xl: 'h-16 w-16 text-2xl font-display',
  '2xl': 'h-28 w-28 text-5xl font-display',
};

export function avatarSrc(userId: string, version: number | null | undefined): string | null {
  return version ? `/api/avatars/${userId}?v=${version}` : null;
}

/** A profile picture, or the first letter of the name when there isn't one. Decorative: names are always shown beside it. */
export function Avatar({
  userId,
  name,
  version,
  size = 'md',
  dot,
}: {
  userId: string;
  name: string;
  version: number | null | undefined;
  size?: keyof typeof SIZES;
  /** Background class for a status dot in the corner; no dot when omitted. */
  dot?: string;
}) {
  const src = avatarSrc(userId, version);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = src && failedSrc !== src;

  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center rounded-full bg-wash text-ink ${SIZES[size]}`}>
      {showPhoto ? (
        <img
          src={src}
          alt=""
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        name.charAt(0).toUpperCase()
      )}
      {dot && <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${dot}`} />}
    </span>
  );
}
