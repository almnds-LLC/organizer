import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const SALT_LEN = 16;
const HASH_LEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 128 * 16384 * 8 * 2 };

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await scryptAsync(password, salt, HASH_LEN);
  return Buffer.concat([salt, hash]).toString('base64');
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const buf = Buffer.from(stored, 'base64');
  const salt = buf.subarray(0, SALT_LEN);
  const storedHash = buf.subarray(SALT_LEN);
  const hash = await scryptAsync(password, salt, HASH_LEN);
  return timingSafeEqual(hash, storedHash);
}
