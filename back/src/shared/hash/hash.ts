import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

/**
 * 지문 = SHA-256, 표현 `sha256:<64자리 소문자 16진수>`(docs/24 8절).
 * 여러 값을 묶는 재료는 RFC 8785 JCS(`canonicalize` 패키지 — RFC 저자 구현)로 직렬화한다.
 * 재료는 항상 `{ k: 재료 종류, v: 판, ... }` 객체다(예: `evk/1` = `{ k: 'event-idem', v: 1, ... }`).
 */
export const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export type Sha256Hash = string & { readonly __brand: 'Sha256Hash' };

export function isSha256Hash(value: unknown): value is Sha256Hash {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

/** 원문처럼 바이트 자체가 대상일 때(payload_hash · source_quote_hash). 문자열은 UTF-8 바이트로 본다. */
export function sha256Bytes(data: Uint8Array | string): Sha256Hash {
  const hex = createHash('sha256').update(data).digest('hex');
  return `sha256:${hex}` as Sha256Hash;
}

/** JCS 재료 값: 10진수는 문자열로 넣는다(docs/24 8.1). 숫자는 안전 정수만 받는다. `undefined` 는 금지 — 없음은 `null` 로 명시. */
export type MaterialValue =
  | string
  | number
  | boolean
  | null
  | readonly MaterialValue[]
  | { readonly [key: string]: MaterialValue };

export interface HashMaterial {
  readonly k: string;
  readonly v: number;
  readonly [key: string]: MaterialValue;
}

export class HashMaterialError extends TypeError {
  constructor(path: string, reason: string) {
    super(`Invalid hash material at ${path}: ${reason}`);
    this.name = 'HashMaterialError';
  }
}

function assertMaterial(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new HashMaterialError(path, 'numbers must be safe integers — put decimals in as strings');
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertMaterial(item, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) assertMaterial(item, `${path}.${key}`);
    return;
  }
  throw new HashMaterialError(path, `unsupported type ${value === undefined ? 'undefined' : typeof value}`);
}

/** RFC 8785 정규 JSON 문자열. */
export function canonicalJson(material: HashMaterial): string {
  if (typeof material.k !== 'string' || material.k.length === 0) {
    throw new HashMaterialError('$.k', 'material kind is required');
  }
  if (!Number.isSafeInteger(material.v) || material.v < 1) {
    throw new HashMaterialError('$.v', 'material version must be a positive integer');
  }
  assertMaterial(material, '$');
  const text = canonicalize(material);
  if (text === undefined) throw new HashMaterialError('$', 'canonicalize returned undefined');
  return text;
}

export function canonicalHash(material: HashMaterial): Sha256Hash {
  return sha256Bytes(canonicalJson(material));
}
