/**
 * 사실 판정 규칙(T-093 · docs/05 3.3 · 6 · 8 · 10 · 11) — 한 좌표(개체 · fact_key · 적용 범위)의 사건들에서 "지금 값"을 정한다.
 *
 * **순수 모듈**: DB · 네트워크 · LLM 을 import 하지 않고 현재 시각을 읽지 않는다(`asOf` 를 받는다 — 규칙 6). 같은 입력이면 같은 결과(R12).
 * Event 가 원천이고 이 결과(`canonical_fact`)는 언제든 다시 만들 수 있는 파생이다. AI 의 확신도(`model_confidence`)는 쓰지 않는다.
 *
 * 이번 슬라이스의 부분집합(docs/18 F.5): R1 제외 · R2 강도 · R4-a 최근 우선 · R4-b 강도 가드 · R4-d 제안 만료 · R6 동시 충돌 ·
 * R9 정정 · R10 불리한 큰 변경 보류 · R11 결정 가능성. 정책 값(τ · θ)과 출처 강도표는 `truth-policy.ts` 한 곳 — 모두 `[ASSUMPTION]`. **신선도 정책(Q-24)은 아직 없다** — `freshness_status` 는 UNKNOWN(평가 안 함)이고
 * R11 은 신선도를 보지 않는다. R3 · R5 · R7 · R8 은 이 슬라이스의 사실 계열(자원 수용량 · 차량 가용)에 해당하지 않는다.
 */

import { DEFAULT_TRUTH_POLICY, type TruthPolicy, baseStrength } from './truth-policy.js';

export { baseStrength };
export const RECONCILE_RULE_VERSION = 'reconcile/1';
export const EVIDENCE_POLICY_VERSION = 'strength/1';

/** 그 사실 계열에 대한 출처 권한(docs/05 3.2). NONE = 판정되지 않음 · 권한 없음(매트릭스의 `–`) — 후보 자격이 없다 */
export type Authority = 'A' | 'S' | 'W' | 'NONE';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type Strength = 0 | 1 | 2 | 3;

export type FactStatus = 'UNKNOWN' | 'PROVISIONAL' | 'OBSERVED' | 'CONFIRMED';
export type ConflictStatus = 'NONE' | 'DISSENT' | 'OPEN';
export type HoldStatus = 'NONE' | 'HELD';
export type Usability = 'USABLE' | 'USABLE_WITH_WARNING' | 'APPROVAL_BLOCKED' | 'UNUSABLE';
export type Role =
  | 'WINNER'
  | 'CORROBORATING'
  | 'OUTDATED'
  | 'DISSENTING'
  | 'CONTESTING'
  | 'HELD_CANDIDATE'
  | 'INELIGIBLE'
  | 'REJECTED'
  | 'SUPERSEDED';

export interface FactEvent {
  eventId: string;
  eventClass: 'OBSERVATION' | 'CORRECTION';
  /** CORRECTION 만: 대체 대상 */
  supersedesEventId: string | null;
  /** null 이면 철회(CORRECTION 의 값 없음) */
  value: number | null;
  unit: string | null;
  factKind: string;
  validFrom: string | null;
  validUntil: string | null;
  sourceType: string;
  /** 수신 때 판정한 출처 권한(사건 payload 에 남긴 값). 없으면 S(운영자 입력 등) */
  authority: Authority;
  confidence: Confidence;
  /** 근거 시각(ISO UTC) — sourceEventTime ?? sourceRecordedAt ?? receivedAt */
  evidenceTime: string;
  evidenceTimeQuality: 'EVENT_TIME' | 'RECORDED_TIME' | 'RECEIVED_ONLY';
  receivedAt: string;
}

export interface VerificationEvent {
  eventId: string;
  action: 'CONFIRM' | 'REJECT' | 'REVOKE';
  /** 대상 사건 id(TARGET 역할) */
  targetEventIds: readonly string[];
  receivedAt: string;
}

export interface ScoredEvent extends FactEvent {
  strength: Strength;
  /** 사람이 입력했거나(HUMAN_UI) 사람이 CONFIRM 했다 */
  verifiedByHuman: boolean;
  verification: 'UNVERIFIED' | 'CONFIRMED' | 'REJECTED';
}

export interface Reconciled {
  status: FactStatus;
  winner: ScoredEvent | null;
  verificationBasis: 'HUMAN_VERIFICATION' | 'AUTHORITATIVE_SYSTEM' | null;
  appliedRule: string | null;
  conflictStatus: ConflictStatus;
  conflictType: 'CHALLENGED_BY_WEAKER' | 'SIMULTANEOUS' | 'DISSENT' | null;
  conflictEventIds: string[];
  holdStatus: HoldStatus;
  heldEventId: string | null;
  freshness: 'EXPIRED' | 'UNKNOWN';
  usability: Usability;
  contributingEventCount: number;
  roles: Map<string, Role>;
  scored: ScoredEvent[];
}

/** 확인 사건들을 대상별 최종 상태로 접는다(REVOKE 는 직전 확인·거절을 취소). 같은 입력이면 같은 결과: 받은 시각 → 사건 id 순. */
export function verificationStates(verifications: readonly VerificationEvent[]): Map<string, 'CONFIRMED' | 'REJECTED'> {
  const stacks = new Map<string, ('CONFIRMED' | 'REJECTED')[]>();
  const ordered = [...verifications].sort((a, b) => cmp(a.receivedAt, b.receivedAt) || cmp(a.eventId, b.eventId));
  for (const v of ordered) {
    for (const target of v.targetEventIds) {
      const stack = stacks.get(target) ?? [];
      if (v.action === 'REVOKE') stack.pop();
      else stack.push(v.action === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED');
      stacks.set(target, stack);
    }
  }
  const out = new Map<string, 'CONFIRMED' | 'REJECTED'>();
  for (const [id, stack] of stacks) {
    const top = stack.at(-1);
    if (top) out.set(id, top);
  }
  return out;
}

export function score(events: readonly FactEvent[], verifications: readonly VerificationEvent[]): ScoredEvent[] {
  const states = verificationStates(verifications);
  return events.map((e) => {
    const state = states.get(e.eventId);
    const humanEntered = e.sourceType === 'HUMAN_UI';
    const confirmed = state === 'CONFIRMED';
    const base = baseStrength(e.sourceType, e.authority, e.confidence);
    // 확인에 따른 상향: 운영자(권한 S)가 확인하면 최소 2 (docs/05 3.3)
    const strength = (confirmed ? Math.max(base, 2) : base) as Strength;
    return { ...e, strength, verifiedByHuman: humanEntered || confirmed, verification: state ?? (humanEntered ? 'CONFIRMED' : 'UNVERIFIED') };
  });
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** R4-a 정렬: 근거 시각 ↓ → 강도 ↓ → 받은 시각 ↓ → 사건 id ↓ (마지막 기준은 항상 id — R12) */
function byRecency(a: ScoredEvent, b: ScoredEvent): number {
  return cmp(b.evidenceTime, a.evidenceTime) || b.strength - a.strength || cmp(b.receivedAt, a.receivedAt) || cmp(b.eventId, a.eventId);
}

const ms = (iso: string) => Date.parse(iso);

interface Pick {
  winner: ScoredEvent;
  rule: string;
  conflictStatus: ConflictStatus;
  conflictType: Reconciled['conflictType'];
  conflictIds: string[];
  hold: { heldId: string } | null;
  roles: Map<string, Role>;
}

/** 자격 있는 후보들(비어 있지 않음)에서 승자 하나. R4-a · R4-b · R6 · R10. */
function select(eligible: readonly ScoredEvent[], policy: TruthPolicy): Pick {
  const sorted = [...eligible].sort(byRecency);
  const r = sorted[0] as ScoredEvent;
  const roles = new Map<string, Role>();
  const same = (e: ScoredEvent, w: ScoredEvent) => e.value === w.value;

  // R4-b 강도 가드: 더 강하고 값이 다른 후보가 있으면 조용히 바꾸지 않는다(신선도 정책 전이라 모두 신선한 것으로 본다)
  const stronger = sorted.filter((e) => e.strength > r.strength && !same(e, r));
  if (stronger.length > 0) {
    const incumbent = stronger[0] as ScoredEvent;
    const contesting: string[] = [];
    for (const e of sorted) {
      if (e === incumbent) roles.set(e.eventId, 'WINNER');
      else if (same(e, incumbent)) roles.set(e.eventId, 'CORROBORATING');
      else if (byRecency(e, incumbent) < 0) {
        roles.set(e.eventId, 'CONTESTING');
        contesting.push(e.eventId);
      } else roles.set(e.eventId, 'OUTDATED');
    }
    return { winner: incumbent, rule: 'R4-b', conflictStatus: 'OPEN', conflictType: 'CHALLENGED_BY_WEAKER', conflictIds: [incumbent.eventId, ...contesting], hold: null, roles };
  }

  // R6 동시 충돌: 가장 강한 후보끼리 τ 안에서 값이 다르면 사람에게 묻는다. 값은 먼저 받은 것(현직 유지)
  const ties = sorted.filter((e) => e !== r && !same(e, r) && e.strength === r.strength && Math.abs(ms(e.evidenceTime) - ms(r.evidenceTime)) <= policy.nearTimeConflictWindowMs);
  if (ties.length > 0) {
    const participants = [r, ...ties];
    const first = [...participants].sort((a, b) => cmp(a.receivedAt, b.receivedAt) || cmp(a.eventId, b.eventId))[0] as ScoredEvent;
    const contesting = participants.filter((p) => !same(p, first)).map((p) => p.eventId);
    for (const e of sorted) {
      if (e === first) roles.set(e.eventId, 'WINNER');
      else if (same(e, first)) roles.set(e.eventId, 'CORROBORATING');
      else if (contesting.includes(e.eventId)) roles.set(e.eventId, 'CONTESTING');
      else roles.set(e.eventId, 'OUTDATED');
    }
    return { winner: first, rule: 'R6', conflictStatus: 'OPEN', conflictType: 'SIMULTANEOUS', conflictIds: [first.eventId, ...contesting], hold: null, roles };
  }

  // R10 불리한 큰 변경 보류: 약한 근거(강도 < 3, 사람 확인 전)가 현직 값을 θ 이상 줄이면 현직 유지
  if (r.strength < 3 && !r.verifiedByHuman && r.value !== null) {
    const rest = sorted.filter((e) => e !== r);
    if (rest.length > 0) {
      const incumbent = select(rest, policy).winner; // r 이 없을 때의 값(현직)
      if (incumbent.value !== null && incumbent.value > 0 && !same(incumbent, r) && (incumbent.value - r.value) / incumbent.value >= policy.materialChangeRatio) {
        for (const e of sorted) {
          if (e === incumbent) roles.set(e.eventId, 'WINNER');
          else if (e === r) roles.set(e.eventId, 'HELD_CANDIDATE');
          else if (same(e, incumbent)) roles.set(e.eventId, 'CORROBORATING');
          else roles.set(e.eventId, 'OUTDATED');
        }
        return { winner: incumbent, rule: 'R10', conflictStatus: 'NONE', conflictType: null, conflictIds: [], hold: { heldId: r.eventId }, roles };
      }
    }
  }

  // R4-a 최근 우선. 값이 다르고 더 약한 후보가 τ 안에 있으면 기록만 하는 반대 의견(DISSENT)
  let dissent = false;
  for (const e of sorted) {
    if (e === r) roles.set(e.eventId, 'WINNER');
    else if (same(e, r)) roles.set(e.eventId, 'CORROBORATING');
    else if (e.strength < r.strength && Math.abs(ms(e.evidenceTime) - ms(r.evidenceTime)) <= policy.nearTimeConflictWindowMs) {
      roles.set(e.eventId, 'DISSENTING');
      dissent = true;
    } else roles.set(e.eventId, 'OUTDATED');
  }
  return {
    winner: r,
    rule: 'R4-a',
    conflictStatus: dissent ? 'DISSENT' : 'NONE',
    conflictType: dissent ? 'DISSENT' : null,
    conflictIds: dissent ? sorted.filter((e) => roles.get(e.eventId) === 'DISSENTING' || e === r).map((e) => e.eventId) : [],
    hold: null,
    roles,
  };
}

/**
 * 한 좌표 판정. `events` 는 그 좌표의 OBSERVATION · CORRECTION, `verifications` 는 그 사건들을 대상으로 한 VERIFICATION.
 * `asOf` 는 제안 만료(R4-d) 판정에만 쓴다.
 */
export function reconcile(events: readonly FactEvent[], verifications: readonly VerificationEvent[], asOf: string, policy: TruthPolicy = DEFAULT_TRUTH_POLICY): Reconciled {
  const scored = score(events, verifications);
  const roles = new Map<string, Role>();

  // R9 정정: 대체된 사건은 후보에서 빠진다. 값이 없는 정정은 철회 — 정정 사건 자신도 후보가 아니다
  const superseded = new Set(scored.filter((e) => e.eventClass === 'CORRECTION' && e.supersedesEventId).map((e) => e.supersedesEventId as string));
  const candidates: ScoredEvent[] = [];
  for (const e of scored) {
    if (superseded.has(e.eventId)) roles.set(e.eventId, 'SUPERSEDED');
    else if (e.verification === 'REJECTED') roles.set(e.eventId, 'REJECTED'); // R1
    else if (e.value === null) roles.set(e.eventId, 'SUPERSEDED');
    else if (e.strength === 0) roles.set(e.eventId, 'INELIGIBLE'); // R2
    else candidates.push(e);
  }

  if (candidates.length === 0) {
    return { status: 'UNKNOWN', winner: null, verificationBasis: null, appliedRule: null, conflictStatus: 'NONE', conflictType: null, conflictEventIds: [], holdStatus: 'NONE', heldEventId: null, freshness: 'UNKNOWN', usability: 'UNUSABLE', contributingEventCount: 0, roles, scored };
  }

  const pick = select(candidates, policy);
  for (const [id, role] of pick.roles) roles.set(id, role);
  const winner = pick.winner;
  const group = candidates.filter((e) => e.value === winner.value);
  const human = group.some((e) => e.verifiedByHuman && e.strength >= 2);
  const authoritative = group.some((e) => e.sourceType === 'PARTNER_SYSTEM' && e.strength === 3);
  const status: FactStatus = human || authoritative ? 'CONFIRMED' : winner.strength >= 2 ? 'OBSERVED' : 'PROVISIONAL';
  const basis = human ? 'HUMAN_VERIFICATION' : authoritative ? 'AUTHORITATIVE_SYSTEM' : null;

  // R4-d 제안 만료: 시간창이 있는 제안(OFFER)이 지났으면 판단에 쓰지 않는다
  const expired = winner.factKind === 'OFFER' && winner.validUntil !== null && ms(asOf) >= ms(winner.validUntil);
  const hold: HoldStatus = pick.hold ? 'HELD' : 'NONE';

  // R11 결정 가능성 — 이 슬라이스의 사실 계열은 모두 중요 사실(critical_families: 창고 · 트럭 · ODCY). 신선도는 보지 않는다
  let usability: Usability;
  if (expired) usability = 'UNUSABLE';
  else if (pick.conflictStatus === 'OPEN' || hold === 'HELD') usability = 'APPROVAL_BLOCKED';
  else if (status === 'PROVISIONAL' || pick.conflictStatus === 'DISSENT') usability = 'USABLE_WITH_WARNING';
  else usability = 'USABLE';

  return {
    status,
    winner,
    verificationBasis: basis,
    appliedRule: pick.rule,
    conflictStatus: pick.conflictStatus,
    conflictType: pick.conflictType,
    conflictEventIds: pick.conflictIds,
    holdStatus: hold,
    heldEventId: pick.hold?.heldId ?? null,
    freshness: expired ? 'EXPIRED' : 'UNKNOWN',
    usability,
    contributingEventCount: candidates.length,
    roles,
    scored,
  };
}

/** 사람이 보는 한 줄 상태(화면 · Agent 공통 어휘의 뼈대). 내부 enum 을 그대로 보여 주지 않기 위한 코드 — 한국어는 화면이 입힌다. */
export type FactState = 'PROVISIONAL' | 'CONFIRMED' | 'OBSERVED' | 'NEEDS_REVIEW' | 'UNKNOWN';

export function factState(r: { status: FactStatus; conflictStatus: ConflictStatus; holdStatus: HoldStatus }): FactState {
  if (r.status === 'UNKNOWN') return 'UNKNOWN';
  if (r.conflictStatus === 'OPEN' || r.holdStatus === 'HELD') return 'NEEDS_REVIEW';
  return r.status;
}
