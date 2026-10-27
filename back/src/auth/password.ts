import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * 비밀번호 해시(T-119) — Node 내장 scrypt(메모리 집약 KDF, RFC 7914). 저장 형식 `scrypt$N$r$p$salt$hash`(base64url).
 * 평문 · 되돌릴 수 있는 값은 저장 · 로그하지 않는다. 비교는 상수 시간.
 */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LEN = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error('password must be at least 12 characters');
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 비밀번호를 모르는 계정 이름으로 시도해도 같은 시간이 걸리게 쓰는 가짜 해시. */
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(KEY_LEN).toString('base64url')}`;
