import type { Ask } from '../ai/ai-client.js';

/**
 * 업체 회신 속 선박 입항 일시 주장(T-137 · ADR-042) — 공공 관측(입항 신고 일시)과 교차 확인할 수 있는 유일한 주장 종류.
 *
 * - **질문은 Backend 가 만든다**: 등록된 입항 신고(선박 식별자 = 선박명 · 호출부호) 하나마다 질문 하나. 질문 id 에 입항 신고 id 를 싣는다(`v:<id>`) —
 *   AI 는 우리가 보낸 질문에만 답할 수 있으므로(QUESTION_SCOPE) 없는 배 · 다른 배를 지어낼 수 없다
 * - **식별자 대조는 결정론**: 그 배의 이름이나 호출부호가 인용이 든 문장에 있거나, 회신이 그 배 하나만 말할 때만 그 배의 주장이다(이름 유사도 없음)
 * - 일치 · 충돌 · 확정 · 위험 숫자는 여기서도 AI 도 정하지 않는다 — 기존 교차 확인 규칙(`corroboration-rules.ts`)
 *
 * 순수 모듈: DB · 네트워크 · LLM 을 import 하지 않고, 현재 시각을 읽지 않는다.
 */

export const VESSEL_ASK_PREFIX = 'v:';
/** 한 회신에서 물을 배의 최대 수 — 질문 목록(최대 10)의 여유를 남긴다 */
export const MAX_VESSEL_ASKS = 3;
/** 이름 대조에 쓰는 최소 길이 — 너무 짧은 이름은 다른 낱말에 섞여 잘못 맞는다 */
const MIN_NAME_LENGTH = 3;

export interface VesselCandidate {
  vesselCallId: string;
  vesselName: string | null;
  callSign: string;
  /** 이 회신의 스레드가 속한 복구 실행의 컨테이너가 이 입항 신고에 연결돼 있다 */
  linkedToRun: boolean;
}

export const vesselAskId = (vesselCallId: string): string => `${VESSEL_ASK_PREFIX}${vesselCallId}`;
export const vesselCallIdOfAsk = (askId: string | null): string | null => (askId && askId.startsWith(VESSEL_ASK_PREFIX) ? askId.slice(VESSEL_ASK_PREFIX.length) : null);

/** 그 배를 가리키는 식별자들(대조용, 대문자) */
export function identifiersOf(c: Pick<VesselCandidate, 'vesselName' | 'callSign'>): string[] {
  const out = [c.callSign.trim().toUpperCase()];
  const name = (c.vesselName ?? '').trim().toUpperCase();
  if (name.length >= MIN_NAME_LENGTH) out.push(name);
  return out.filter((x) => x.length > 0);
}

/** 영문 · 숫자 식별자가 다른 낱말의 일부가 아니라 따로 쓰였는가(예: 호출부호 `D7AB` 가 `XD7ABC` 안에 있는 것은 아니다) */
export function mentions(text: string, identifier: string): boolean {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(text.toUpperCase());
}

/**
 * 물을 배를 고른다. 후보 = 실행에 연결된 입항 신고 + 회신 본문이 식별자로 직접 말한 입항 신고.
 * 같은 식별자가 여러 입항 신고를 가리키면(같은 배의 다른 항차) 실행에 연결된 것만 남기고, 그래도 여럿이면 묻지 않는다(어느 항차인지 정하지 않는다).
 * 실행에 연결돼 있어도 회신이 어떤 배도 말하지 않으면 묻지 않는다 — 선박 얘기가 없는 회신에 질문을 붙이지 않는다.
 */
export function selectVesselCandidates(candidates: readonly VesselCandidate[], body: string): VesselCandidate[] {
  const named = candidates.filter((c) => identifiersOf(c).some((id) => mentions(body, id)));
  if (named.length === 0) return [];
  const byIdentifier = new Map<string, VesselCandidate[]>();
  for (const c of named) {
    const key = c.callSign.trim().toUpperCase();
    byIdentifier.set(key, [...(byIdentifier.get(key) ?? []), c]);
  }
  const picked: VesselCandidate[] = [];
  for (const group of byIdentifier.values()) {
    const unique = group.length === 1 ? group : group.filter((c) => c.linkedToRun);
    if (unique.length === 1) picked.push(unique[0] as VesselCandidate);
  }
  return picked.sort((a, b) => a.vesselCallId.localeCompare(b.vesselCallId)).slice(0, MAX_VESSEL_ASKS);
}

/** 입항 신고 하나 → AI 에 줄 질문 하나. 칸 = 입항 날짜(회신이 말한 경우만) · 입항 시각 */
export function buildVesselAsk(c: VesselCandidate): Ask {
  const label = c.vesselName ? `${c.vesselName}(호출부호 ${c.callSign})` : `호출부호 ${c.callSign}`;
  return {
    ask_id: vesselAskId(c.vesselCallId),
    question: `선박 ${label}의 입항 일시 — 회신이 이 선박이 입항한(또는 입항할) 날짜 · 시각을 말할 때만`,
    answer_shape: 'ARRIVAL_DATETIME',
    fields: [
      { name: 'arrival_date', kind: 'DATE', unit: null },
      { name: 'arrival_time', kind: 'TIME', unit: null },
    ],
    window: null,
  };
}

/**
 * 식별자 검사: 인용이 든 문장이 그 배를 말하거나, 회신 전체가 물은 배들 가운데 그 배 하나만 말한다.
 * 회신이 배를 전혀 말하지 않거나 여러 배를 말하는데 그 문장에 이름이 없으면 탈락(사람 검토) — 어느 배의 말인지 추측하지 않는다.
 */
export function identifierBacked(sentence: string, body: string, ask: VesselCandidate, asked: readonly VesselCandidate[]): boolean {
  const ids = identifiersOf(ask);
  if (ids.some((id) => mentions(sentence, id))) return true;
  const mentionedInBody = asked.filter((c) => identifiersOf(c).some((id) => mentions(body, id)));
  return mentionedInBody.length === 1 && mentionedInBody[0]?.vesselCallId === ask.vesselCallId;
}
