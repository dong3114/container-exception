/**
 * Contact Gate — "이 주소로 지금 업무 메시지를 보내도 되는가"(docs/19 FR-ELG-01~06 · docs/18 D.5 · G.5).
 *
 * **순수 함수**다(ADR-029 · T-069 6절): DB · 네트워크 · LLM 을 import 하지 않는다. 입력(등록부 상태 + 안전장치 정책)을
 * 받아 판정을 돌려준다. AI 는 이 판정에 어떤 형태로도 참여하지 않는다(FR-ELG-02).
 * 결과를 저장해 재사용하지 않는다 — 승인 시점과 발송 직전에 매번 다시 부른다(FR-ELG-03).
 *
 * 두 겹은 서로를 대신하지 못한다(G.5): 제품 게이트(①~⑥)와 개발 안전장치(허용목록)를 따로 판정하고,
 * 막힌 사유는 **전부** 돌려준다(첫 하나만 아님 — FR-ELG-04 "어느 조건이 막았는지 구분").
 */

export type ChannelType = 'GMAIL' | 'MOCK' | 'PORTAL';
export type AppEnv = 'local' | 'test' | 'staging' | 'production';

/** FR-ELG-01 의 6조건(번호 순서). */
export const GATE_CONDITIONS = [
  'COUNTERPARTY_ACTIVE',
  'CONTACT_ACTIVE',
  'ADDRESS_ACTIVE',
  'ADDRESS_VERIFIED',
  'RELATIONSHIP_APPROVED',
  'COMMUNICATION_ACTIVE',
] as const;
export type GateCondition = (typeof GATE_CONDITIONS)[number];

/** 막힌 사유 코드(docs/18 D.5 + `CONTACT_INACTIVE` — T-087 D1). 판정 결과 값이지 HTTP 오류 코드가 아니다. */
export const GATE_REASONS = [
  'COUNTERPARTY_INACTIVE',
  'CONTACT_INACTIVE',
  'NOT_ACTIVE',
  'NOT_VERIFIED',
  'NOT_APPROVED',
  'NOT_IN_TEST_ALLOWLIST',
] as const;
export type GateReasonCode = (typeof GATE_REASONS)[number];
export type GateLayer = 'PRODUCT_RULE' | 'DEV_SAFETY';

export interface GateInput {
  counterparty: { isActive: boolean };
  contact: { isActive: boolean };
  address: {
    channelType: ChannelType;
    normalizedAddress: string;
    emailVerificationStatus: string;
    relationshipStatus: string;
    communicationStatus: string;
  };
}

export interface DevSafetyPolicy {
  appEnv: AppEnv;
  /** 정규화(소문자 · 공백 제거)된 허용 주소. 비면 실채널은 전부 막힌다. */
  allowlist: readonly string[];
}

export interface GateResult {
  eligible: boolean;
  conditions: { condition: GateCondition; passed: boolean }[];
  reasons: { code: GateReasonCode; layer: GateLayer }[];
  /** 개발 안전장치를 이 주소에 적용했는가(실채널 × 비운영). MOCK · production 은 false. */
  devSafetyApplied: boolean;
}

const REAL_CHANNELS: readonly ChannelType[] = ['GMAIL', 'PORTAL'];

/** 개발 안전장치는 밖으로 실제로 나가는 채널에만, 운영이 아닌 환경에서만 적용한다(T-087 D2). */
export function devSafetyApplies(channelType: ChannelType, appEnv: AppEnv): boolean {
  return REAL_CHANNELS.includes(channelType) && appEnv !== 'production';
}

export function evaluateContactGate(input: GateInput, safety: DevSafetyPolicy): GateResult {
  const { counterparty, contact, address } = input;
  const passed: Record<GateCondition, boolean> = {
    COUNTERPARTY_ACTIVE: counterparty.isActive,
    CONTACT_ACTIVE: contact.isActive,
    // 주소 표에는 is_active 가 없다 — "주소 활성"(③)과 "통신 활성"(⑥)은 같은 열을 본다. PAUSED 는 ③ 통과 · ⑥ 실패.
    ADDRESS_ACTIVE: address.communicationStatus !== 'INACTIVE',
    ADDRESS_VERIFIED: address.emailVerificationStatus === 'VERIFIED',
    RELATIONSHIP_APPROVED: address.relationshipStatus === 'APPROVED',
    COMMUNICATION_ACTIVE: address.communicationStatus === 'ACTIVE',
  };

  const reasons: GateResult['reasons'] = [];
  if (!passed.COUNTERPARTY_ACTIVE) reasons.push({ code: 'COUNTERPARTY_INACTIVE', layer: 'PRODUCT_RULE' });
  if (!passed.CONTACT_ACTIVE) reasons.push({ code: 'CONTACT_INACTIVE', layer: 'PRODUCT_RULE' });
  // ③ · ⑥ 은 같은 열이라 사유는 하나(NOT_ACTIVE)만 낸다.
  if (!passed.ADDRESS_ACTIVE || !passed.COMMUNICATION_ACTIVE) reasons.push({ code: 'NOT_ACTIVE', layer: 'PRODUCT_RULE' });
  if (!passed.ADDRESS_VERIFIED) reasons.push({ code: 'NOT_VERIFIED', layer: 'PRODUCT_RULE' });
  if (!passed.RELATIONSHIP_APPROVED) reasons.push({ code: 'NOT_APPROVED', layer: 'PRODUCT_RULE' });

  const devSafetyApplied = devSafetyApplies(address.channelType, safety.appEnv);
  if (devSafetyApplied && !safety.allowlist.includes(normalizeAddress(address.normalizedAddress))) {
    reasons.push({ code: 'NOT_IN_TEST_ALLOWLIST', layer: 'DEV_SAFETY' });
  }

  return {
    eligible: reasons.length === 0,
    conditions: GATE_CONDITIONS.map((condition) => ({ condition, passed: passed[condition] })),
    reasons,
    devSafetyApplied,
  };
}

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}
