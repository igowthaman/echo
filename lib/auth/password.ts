import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt parameters. They're stored with each hash, so raising them later
// doesn't break existing accounts.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

// scrypt needs 128 * N * r bytes; allow double that.
const maxmem = (n: number, r: number) => 256 * n * r;

/** Returns `scrypt$N$r$p$salt$hash`, with salt and hash in base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltText, hashText] = stored.split('$');
  if (scheme !== 'scrypt' || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const options = { N: Number(n), r: Number(r), p: Number(p) };
  const key = await derive(password, Buffer.from(saltText, 'base64url'), expected.length, {
    ...options,
    maxmem: maxmem(options.N, options.r),
  });
  return timingSafeEqual(key, expected);
}

// Checked when the username doesn't exist, so a wrong username takes as long
// as a wrong password and response times don't reveal which accounts exist.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
