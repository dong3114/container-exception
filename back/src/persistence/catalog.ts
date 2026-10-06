import { CONTENT_CATEGORIES, type ContentCategory } from '../db/schema/_common.js';

/**
 * CATALOG 코드의 Backend 정본(docs/24 3절 — 업무가 늘리는 값은 DB 가 형식만 검사하고 허용 값은 여기 한 곳).
 * U1 은 영속 계층이 직접 쓰는 값만 둔다. 업무 단위(U2~)가 값을 더할 때 이 파일에 더한다.
 */
export const AUDIT_ACTION = {
  CONTENT_PURGED: 'CONTENT_PURGED',
} as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

/** 감사 대상 종류. 내용 파기 감사는 내용 범주를 그대로 쓴다(docs/24 16.3 · 17절). */
export const AUDIT_TARGET_TYPES: readonly ContentCategory[] = CONTENT_CATEGORIES;
export type AuditTargetType = ContentCategory;

export const SYSTEM_ERROR_CATEGORY = {
  UNEXPECTED: 'UNEXPECTED',
  DATABASE: 'DATABASE',
  CONTENT_STORE: 'CONTENT_STORE',
  DATA_INTEGRITY: 'DATA_INTEGRITY',
} as const;
export type SystemErrorCategory = (typeof SYSTEM_ERROR_CATEGORY)[keyof typeof SYSTEM_ERROR_CATEGORY];

/** 내용 일관성 판정 오류 코드(docs/24 17절). 나머지 오류 코드 목록은 Q-66(OPEN). */
export const SYSTEM_ERROR_CODE = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONTENT_MISSING: 'CONTENT_MISSING',
  CONTENT_PURGE_MISMATCH: 'CONTENT_PURGE_MISMATCH',
  CONTENT_HASH_MISMATCH: 'CONTENT_HASH_MISMATCH',
  CONTENT_PURGE_FAILED: 'CONTENT_PURGE_FAILED',
  CONTENT_NOT_STORED: 'CONTENT_NOT_STORED',
} as const;
export type SystemErrorCode = (typeof SYSTEM_ERROR_CODE)[keyof typeof SYSTEM_ERROR_CODE];

export const CATALOG_FORMAT = /^[A-Z0-9][A-Z0-9_]*$/;
