import { dateMentions } from './date-scope.js';
import type { Authority } from './reconcile-rules.js';

/**
 * 후보 → 임시 사실(PROVISIONAL) 승격 조건(T-093 · docs/18 F.3). 검증을 통과한 추출 후보(PENDING)가 사건(Event)이 될 자격이 있는가.
 *
 * **순수 모듈**: DB · 네트워크 · LLM 을 import 하지 않는다. 탈락하면 후보는 PENDING 으로 남고(사건 없음) 사람이 본다 — 값을 지어내지 않는다.
 * 이 함수는 사건이 될 **자격**만 정한다. 그 사건이 현재 값이 되는지는 `reconcile-rules.ts` 가 정한다(승격 ≠ 확정).
 */

export const BLOCK_REASONS = [
  'NOT_PENDING',
  'VALIDATION_NOT_PASSED',
  'QUESTION_TARGET_MISSING',
  'FIELD_NOT_A_FACT_VALUE',
  'UNSUPPORTED_FACT',
  'ASK_CANCELLED',
  'PLAN_SUPERSEDED',
  'SENDER_NOT_AUTHORITY',
  'AMBIGUOUS_REPLY',
  'WINDOW_OUT_OF_SCOPE',
  'WINDOW_UNVERIFIED',
  'DATE_OUT_OF_SCOPE',
  'DATE_UNVERIFIED',
  'SCENARIO_MISSING',
  'DUPLICATE_CLAIM',
] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

export type Family = 'warehouse_capacity' | 'truck_availability' | 'yard_capacity';

/** 사실 계열별로 권한을 가진 상대 역할(docs/05 3.2). */
const FAMILY_ROLE: Record<Family, string> = { warehouse_capacity: 'WAREHOUSE', truck_availability: 'TRUCKING', yard_capacity: 'ODCY' };

/** 상대의 권한 등급: 역할이 맞고 자기 자원이면 A, 역할은 맞는데 소유를 확인할 수 없으면 S, 아니면(남의 자원 · 다른 역할) W. */
export function senderAuthority(family: Family, senderRole: string, senderCounterpartyId: string, ownerCounterpartyId: string | null): Authority {
  if (senderRole !== FAMILY_ROLE[family]) return 'W';
  if (ownerCounterpartyId === null) return 'S';
  return ownerCounterpartyId === senderCounterpartyId ? 'A' : 'W';
}

export interface PromotionInput {
  extraction: {
    extractionId: string;
    askId: string | null;
    field: string;
    value: string;
    unit: string | null;
    /** validator_result 의 모든 검사 통과 */
    validated: boolean;
    /** 모호 표현 표시(AMBIGUITY 검사)가 있었다 */
    ambiguous: boolean;
    reviewStatus: string;
    createdEventId: string | null;
  };
  /** 같은 회신 · 같은 질문의 다른 칸 후보(시간창 칸이 질문 창과 맞는지 본다) */
  siblings: { extractionId: string; field: string; value: string; validated: boolean; reviewStatus: string; sentence?: string }[];
  question: {
    questionType: string;
    status: string;
    expectedUnit: string | null;
    target: { entityType: string; entityId: string; factKey: string; scopeType: string; scopeRef: string } | null;
    asked: { date: string | null; windowFrom: string | null; windowTo: string | null };
  };
  entity: { type: string; facilityType: string | null; ownerCounterpartyId: string | null } | null;
  sender: { counterpartyId: string; role: string };
  planSuperseded: boolean;
  isSimulated: boolean;
  scenarioId: string | null;
  /** 근거 인용이 들어 있는 회신 문장(날짜 표현 확인용 — 비어 있으면 확인 불가) · 회신 근거 시각의 Asia/Seoul 날짜(상대 날짜의 기준) */
  replySentence: string;
  replyDate: string;
}

export interface PromotionPlan {
  eventType: 'TRUCK_AVAILABILITY_REPORTED' | 'WAREHOUSE_CAPACITY_CHANGED' | 'YARD_CAPACITY_REPORTED';
  factKind: 'OFFER' | 'STATE';
  family: Family;
  value: number;
  unit: string;
  /** ISO UTC — 이 값이 적용되는 시간 범위(질문의 날짜 · 시간창, Asia/Seoul 기준) */
  validFrom: string;
  validUntil: string;
  authority: Authority;
  /** 같은 질문의 시간창 칸 후보들 — 사건에 같이 반영되었다고 본다 */
  siblingExtractionIds: string[];
}

export type PromotionDecision = { ok: true; plan: PromotionPlan } | { ok: false; reasons: BlockReason[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Asia/Seoul 의 날짜 · 시각 → ISO UTC. 오프셋 +09:00 은 일광절약시간이 없다. */
export function seoulToUtcIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

export function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function evaluatePromotion(i: PromotionInput): PromotionDecision {
  const reasons: BlockReason[] = [];
  const x = i.extraction;

  if (x.reviewStatus !== 'PENDING' || x.createdEventId !== null) return { ok: false, reasons: ['NOT_PENDING'] };
  if (!x.validated) return { ok: false, reasons: ['VALIDATION_NOT_PASSED'] };
  // 사실 값은 수량 칸이다. 시간창 칸은 수량 후보의 적용 범위를 확인하는 재료일 뿐 따로 사건이 되지 않는다
  if (x.field !== 'quantity') return { ok: false, reasons: ['FIELD_NOT_A_FACT_VALUE'] };

  const target = i.question.target;
  if (!target || !i.entity) return { ok: false, reasons: ['QUESTION_TARGET_MISSING'] };
  if (i.question.status === 'CANCELLED') reasons.push('ASK_CANCELLED');
  if (i.planSuperseded) reasons.push('PLAN_SUPERSEDED');
  if (x.ambiguous) reasons.push('AMBIGUOUS_REPLY');
  if (i.isSimulated && i.scenarioId === null) reasons.push('SCENARIO_MISSING');

  let family: Family | null = null;
  let eventType: PromotionPlan['eventType'] | null = null;
  let factKind: PromotionPlan['factKind'] | null = null;
  if (target.entityType === 'TRUCK_POOL' && i.question.questionType === 'SLOT') {
    family = 'truck_availability';
    eventType = 'TRUCK_AVAILABILITY_REPORTED';
    factKind = 'OFFER';
  } else if (target.entityType === 'FACILITY' && i.question.questionType === 'CAPACITY' && i.entity.facilityType === 'WAREHOUSE') {
    family = 'warehouse_capacity';
    eventType = 'WAREHOUSE_CAPACITY_CHANGED';
    factKind = 'STATE';
  } else if (target.entityType === 'FACILITY' && i.question.questionType === 'CAPACITY' && i.entity.facilityType === 'ODCY') {
    family = 'yard_capacity';
    eventType = 'YARD_CAPACITY_REPORTED';
    factKind = 'OFFER';
  }
  if (!family || !eventType || !factKind) return { ok: false, reasons: [...reasons, 'UNSUPPORTED_FACT'] };

  const authority = senderAuthority(family, i.sender.role, i.sender.counterpartyId, i.entity.ownerCounterpartyId);
  if (authority === 'W') reasons.push('SENDER_NOT_AUTHORITY');

  // 적용 범위(시간): 질문이 정한 날짜 · 시간창 안에서만. 회신이 더 좁은 시간창을 말하면(질문 09–18시 · 회신 "15시 이후") 그 좁은 창이 사실의
  // 유효 범위다 — 더 구체적인 정상 답이다. 질문 범위와 겹치지 않으면(범위 밖) 자동 승격하지 않는다
  const { date, windowFrom, windowTo } = i.question.asked;
  let validFrom = '';
  let validUntil = '';
  const siblingIds: string[] = [];
  if (!date || !DATE.test(date)) {
    reasons.push('QUESTION_TARGET_MISSING');
  } else {
    // 날짜: 계약에 답의 날짜 칸이 없다 — 문장의 날짜 표현이 질문 날짜와 다르거나 풀 수 없으면 사람에게(질문 날짜로 임의 해석하지 않는다)
    const mentioned = dateMentions(i.replySentence, i.replyDate, date);
    if (i.replySentence.trim() === '') reasons.push('DATE_UNVERIFIED'); // 문장을 모른다 — 날짜를 확인할 수 없다
    else if (mentioned.resolved.some((d) => d !== date)) reasons.push('DATE_OUT_OF_SCOPE');
    else if (mentioned.unresolved.length > 0) reasons.push('DATE_UNVERIFIED');
    // v2 날짜 칸(T-111): 모델이 정규화한 날짜는 후보다. 그 인용에서 CERA 가 회신 날짜 기준으로 다시 푼 날짜와 맞을 때만 믿는다
    for (const d of i.siblings.filter((s) => s.field === 'answer_date')) {
      if (!d.validated) {
        reasons.push('DATE_UNVERIFIED');
        continue;
      }
      const derived = dateMentions(d.sentence ?? '', i.replyDate, date);
      const backed = derived.resolved.includes(d.value);
      if (derived.resolved.some((x) => x !== date)) reasons.push('DATE_OUT_OF_SCOPE');
      else if (d.value !== date) reasons.push(backed ? 'DATE_OUT_OF_SCOPE' : 'DATE_UNVERIFIED'); // 모델이 다른 날을 말함(인용이 뒷받침하지 못하면 확인 불가)
      else if (derived.unresolved.length > 0) reasons.push('DATE_UNVERIFIED');
      siblingIds.push(d.extractionId); // 질문 날짜와 같고 인용이 다른 날을 말하지 않음 — 같은 사건에 반영
    }
    if (family === 'truck_availability') {
      if (!windowFrom || !windowTo || !TIME.test(windowFrom) || !TIME.test(windowTo)) {
        reasons.push('QUESTION_TARGET_MISSING');
      } else {
        const times = i.siblings.filter((s) => s.field === 'available_from' || s.field === 'available_until');
        if (times.some((s) => !s.validated)) reasons.push('WINDOW_UNVERIFIED'); // 시간을 말한 것 같은데 검증을 못 했다 — 적용 범위를 모른다
        let from = windowFrom;
        let to = windowTo;
        for (const s of times.filter((t) => t.validated)) {
          if (s.field === 'available_from' && s.value > from) from = s.value;
          if (s.field === 'available_until' && s.value < to) to = s.value;
          siblingIds.push(s.extractionId);
        }
        if (from >= to) reasons.push('WINDOW_OUT_OF_SCOPE');
        else {
          validFrom = seoulToUtcIso(date, from);
          validUntil = seoulToUtcIso(date, to);
        }
      }
    } else {
      validFrom = seoulToUtcIso(date, '00:00');
      validUntil = seoulToUtcIso(nextDate(date), '00:00');
    }
  }

  if (reasons.length > 0) return { ok: false, reasons: [...new Set(reasons)] };
  const unit = i.question.expectedUnit ?? x.unit;
  if (!unit) return { ok: false, reasons: ['QUESTION_TARGET_MISSING'] };
  return { ok: true, plan: { eventType, factKind, family, value: Number(x.value), unit, validFrom, validUntil, authority, siblingExtractionIds: siblingIds } };
}

/**
 * T-137 업체 회신 속 선박 입항 일시 주장 → 사건(업체 주장 · 권한 W) 자격. 공공데이터와 비교할 **주장**일 뿐이다 — 확정 · 일치 판정은 여기서 하지 않는다
 * (교차 확인 `corroboration-rules.ts`). 날짜는 기존 회신 날짜 기준(`dateMentions` — 회신 근거 시각의 Asia/Seoul 날짜)으로만 푼다:
 * 인용 문장에 풀 수 있는 날짜 표현이 정확히 하나 있어야 한다. 날짜 말이 없거나("14시에 입항") 풀 수 없거나 둘 이상이면 사람에게(새 추론 규칙 없음).
 */
export interface VesselClaimInput {
  time: { extractionId: string; value: string; validated: boolean; reviewStatus: string; createdEventId: string | null } | null;
  date: { extractionId: string; value: string; validated: boolean } | null;
  /** 시각 인용이 든 문장 */
  sentence: string;
  replyDate: string;
  ambiguous: boolean;
  isSimulated: boolean;
  scenarioId: string | null;
}

export type VesselClaimDecision = { ok: true; arrivalAtIso: string; siblingExtractionIds: string[] } | { ok: false; reasons: BlockReason[] };

export function evaluateVesselClaim(i: VesselClaimInput): VesselClaimDecision {
  const t = i.time;
  if (!t) return { ok: false, reasons: ['FIELD_NOT_A_FACT_VALUE'] }; // 시각 없는 말("아직 입항 전", "방금 입항")은 공공 입항 일시와 비교할 값이 아니다
  if (t.reviewStatus !== 'PENDING' || t.createdEventId !== null) return { ok: false, reasons: ['NOT_PENDING'] };
  if (!t.validated || !TIME.test(t.value)) return { ok: false, reasons: ['VALIDATION_NOT_PASSED'] };
  const reasons: BlockReason[] = [];
  if (i.ambiguous) reasons.push('AMBIGUOUS_REPLY');
  if (i.isSimulated && i.scenarioId === null) reasons.push('SCENARIO_MISSING');
  let day: string | null = null;
  if (i.sentence.trim() === '') reasons.push('DATE_UNVERIFIED');
  else {
    const m = dateMentions(i.sentence, i.replyDate, i.replyDate);
    if (m.unresolved.length > 0 || m.resolved.length !== 1) reasons.push('DATE_UNVERIFIED');
    else day = m.resolved[0] as string;
  }
  const siblings: string[] = [];
  if (i.date) {
    // 모델이 낸 날짜는 후보 — 인용 문장에서 CERA 가 푼 날짜와 같을 때만 같은 사건에 반영한다
    if (!i.date.validated || (day !== null && i.date.value !== day)) reasons.push('DATE_UNVERIFIED');
    else siblings.push(i.date.extractionId);
  }
  if (reasons.length > 0 || day === null) return { ok: false, reasons: [...new Set(reasons.length > 0 ? reasons : ['DATE_UNVERIFIED' as const])] };
  return { ok: true, arrivalAtIso: new Date(`${day}T${t.value}:00+09:00`).toISOString(), siblingExtractionIds: siblings };
}
