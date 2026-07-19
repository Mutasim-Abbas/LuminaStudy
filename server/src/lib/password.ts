import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with Node's built-in scrypt — a memory-hard KDF suitable
 * for passwords, with no native dependency. Each hash carries its own random
 * salt; verification is constant-time to avoid timing attacks.
 * Stored format: scrypt$<saltHex>$<hashHex>
 */

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'hex');
  const expected = Buffer.from(parts[2]!, 'hex');
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
  // Lengths must match before timingSafeEqual, or it throws.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
