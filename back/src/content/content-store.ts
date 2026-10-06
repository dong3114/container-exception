import { CONTENT_CATEGORIES, type ContentCategory } from '../db/schema/_common.js';
import type { Sha256Hash } from '../shared/hash/hash.js';
import { isUuidV7 } from '../shared/id/uuid.js';

/**
 * 내용 저장소 포트(docs/24 16절 D-5). 내용(원문 · 본문 · 승인 문장 · 인용)은 PostgreSQL 밖에 두고
 * DB 기록 행에는 참조 `cref:v1:<범주>:<uuidv7>` 와 지문만 둔다. 어댑터만 바꾼다(로컬·시험 = 파일, 운영 = 미정).
 *
 * 포트 구현은 외부 I/O 다 — DB 트랜잭션 안에서 부르지 않는다(`assertOutsideTransaction`).
 */
export const CONTENT_STORE = Symbol('CERA_CONTENT_STORE');

export type ContentRef = string & { readonly __brand: 'ContentRef' };
export const ABSENT = Symbol('CONTENT_ABSENT');

export interface StoredContent {
  ref: ContentRef;
  sha256: Sha256Hash;
}

export interface ContentStore {
  /** 새 참조로 쓴다(기록마다 새 uuid — 내용 주소 방식 아님). 저장 뒤 지문을 돌려준다. */
  put(category: ContentCategory, bytes: Uint8Array, mediaType: string): Promise<StoredContent>;
  /** 없으면 `ABSENT`(예외가 아니다 — 판정은 judgeContentState). */
  get(ref: ContentRef): Promise<Uint8Array | typeof ABSENT>;
  exists(ref: ContentRef): Promise<boolean>;
  /** 지운 뒤 **다시 확인**해서 없을 때만 `PURGED`. 원래 없었으면 `NOT_FOUND`. */
  purge(ref: ContentRef): Promise<'PURGED' | 'NOT_FOUND'>;
}

const REF = /^cref:v1:([A-Z_]+):([0-9a-f-]{36})$/;

export function formatContentRef(category: ContentCategory, id: string): ContentRef {
  if (!isUuidV7(id)) throw new TypeError('content ref id must be a UUIDv7');
  return `cref:v1:${category}:${id}` as ContentRef;
}

export function parseContentRef(value: string): { category: ContentCategory; id: string; ref: ContentRef } {
  const m = REF.exec(value);
  const category = m?.[1] as ContentCategory | undefined;
  const id = m?.[2];
  if (!category || !id || !CONTENT_CATEGORIES.includes(category) || !isUuidV7(id)) {
    throw new TypeError('invalid content ref');
  }
  return { category, id, ref: value as ContentRef };
}

/**
 * 파기와 내용 손실 판정(docs/24 17절 · docs/22 29.8.1) — 순수 함수(C-01~03 단위 시험 대상).
 * 입력 = 내용 존재 여부 + 성공 파기 감사(`CONTENT_PURGED` · `SUCCESS`) 존재 여부.
 */
export type ContentState = 'RETAINED' | 'PURGED' | 'MISSING' | 'PURGE_MISMATCH';

export function judgeContentState(contentExists: boolean, purgeAuditExists: boolean): ContentState {
  if (contentExists) return purgeAuditExists ? 'PURGE_MISMATCH' : 'RETAINED';
  return purgeAuditExists ? 'PURGED' : 'MISSING';
}
