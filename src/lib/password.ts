import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/** Hashes a new password with a fresh random salt. Node's built-in scrypt — no extra dependency. */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return { hash: derived.toString('hex'), salt };
}

/** Constant-time compare — never short-circuits on the first differing byte. */
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const stored = Buffer.from(hash, 'hex');
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}
