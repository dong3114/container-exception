import type { USER_ROLE } from '../db/schema/codes.js';

/**
 * 역할 · 권한 표(T-119 · docs/03 1절 행위자) — **정본은 여기 한 곳**. 화면이 버튼을 숨기는 것은 편의일 뿐, Backend Guard 가 이 표로 막는다.
 *
 * - ADMIN: 모든 운영 기능 + 사용자 · 역할 관리 + 등록부 변경
 * - OPERATOR: Agent 실행 · 문의 초안 · 발송 승인 · 발송 요청 · 사실 확인/거절/정정/철회 · 직접 입력 · 회신 추출 재시도(T-124) · 실제 계획 입력(컨테이너 · 요율 · 시설 계획 정보, T-123) · 계획 재계산 · 계획 승인 · 공공데이터 조회 · 이번 한 건의 받는 주소 선택(T-129 — 등록부 자체는 못 바꾼다)
 * - FIELD_OPERATOR(현장 담당자): 조회 + 현장에서 본 값의 직접 입력만. 승인 · 발송 · 확인 · 계획 승인 · 사용자 관리는 못 한다
 *
 * Agent(AI_AGENT) · Worker(SYSTEM)는 이 표의 주체가 아니다 — 사람 로그인이 없고, Agent 는 서비스 토큰으로 Tool 만 부른다(ADR-036).
 */
export type UserRole = (typeof USER_ROLE)[number];

export const PERMISSIONS = [
  'read',
  'agent_run.manage',
  'communication.draft',
  'communication.approve',
  'communication.send',
  'truth.review',
  'truth.manual_entry',
  'extraction.retry',
  'plan.recalculate',
  'plan.approve',
  'planning.input',
  'public_data.fetch',
  'contact.select',
  'registry.manage',
  'users.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const OPERATOR: readonly Permission[] = [
  'read',
  'agent_run.manage',
  'communication.draft',
  'communication.approve',
  'communication.send',
  'truth.review',
  'truth.manual_entry',
  'extraction.retry',
  'plan.recalculate',
  'plan.approve',
  'planning.input',
  'public_data.fetch',
  'contact.select',
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: [...OPERATOR, 'registry.manage', 'users.manage'],
  OPERATOR,
  FIELD_OPERATOR: ['read', 'truth.manual_entry'],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
