import type { InquiryIntent, StructuredValue } from './inquiry-intents.js';

/**
 * 초안 문장 포트 — 구조화 값을 **입력으로 받아** 문장을 만든다(문장을 먼저 쓰고 숫자를 추측해 구조화하지 않는다).
 *
 * 지금 구현은 템플릿 하나(`TemplateDraftProse`, drafted_by = TEMPLATE)다. 나중에 AI 문장 구현(AI Server 경유,
 * drafted_by = AI_DRAFT)이 같은 포트를 구현해도 **숫자 · 날짜 · 대상 · 계획 실행은 입력으로 고정**되고, 결과는 똑같이
 * 결정론 숫자 검사(number-check.ts)를 통과해야 한다. AI 호출은 DB 트랜잭션 **밖**에서 한다(docs/23 7.1).
 */
export interface DraftContext {
  intent: InquiryIntent;
  askId: string;
  counterpartyName: string;
  contactName: string;
  /** 질문 대상 이름(시설명 · 트럭 풀 이름). */
  targetName: string;
  values: readonly StructuredValue[];
}

export interface DraftText {
  subject: string;
  body: string;
  /**
   * 업무 숫자가 아닌 고정 문구(이름 · 질문 표식 · 구조화 문자 값의 표기). 숫자 검사가 이 문구 안의 숫자는 보지 않는다 —
   * 예: "부산신항 T1"의 1, `[문의 Q1]`의 1.
   */
  literals: string[];
}

export interface DraftProse {
  readonly draftedBy: 'TEMPLATE' | 'AI_DRAFT';
  compose(ctx: DraftContext): DraftText;
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** `2026-10-13` → `10월 13일(화)`. 요일은 날짜 값에서 계산한다(현재 시각을 읽지 않는다). */
export function koreanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일(${weekday})`;
}

export function askTag(askId: string): string {
  return `[문의 ${askId}]`;
}

export class TemplateDraftProse implements DraftProse {
  readonly draftedBy = 'TEMPLATE' as const;

  compose(ctx: DraftContext): DraftText {
    const text = (k: string) => ctx.values.find((v) => v.key === k)?.valueText ?? null;
    const num = (k: string) => ctx.values.find((v) => v.key === k)?.valueNumber ?? null;
    const date = koreanDate(text('date') ?? '');
    const quantity = num('quantity');
    const tag = askTag(ctx.askId);
    const literals = [ctx.counterpartyName, ctx.contactName, ctx.targetName, tag];
    const greeting = `안녕하세요, ${ctx.counterpartyName} ${ctx.contactName} 님.`;
    const footer = `회신하실 때 ${tag} 표시를 남겨 주세요.\nCERA 운영팀 드림`;

    if (ctx.intent === 'TRUCK_SLOT') {
      const from = text('window_from');
      const to = text('window_to');
      const leg = text('leg');
      if (leg) literals.push(leg);
      return {
        subject: `${tag} ${date} ${from}~${to} 트럭 ${quantity}대 추가 배차 가능 여부`,
        body: [
          greeting,
          `${date} ${from}~${to}에 ${leg ? `${leg} 구간 ` : ''}셔틀 트럭 ${quantity}대를 추가로 배차할 수 있는지 확인 부탁드립니다.`,
          '가능한 대수와 시간을 알려 주시면 계획에 반영하겠습니다.',
          footer,
        ].join('\n\n'),
        literals,
      };
    }

    const size = text('size_type');
    if (size) literals.push(size);
    return {
      subject: `${tag} ${date} ${ctx.targetName} 컨테이너 ${quantity}대 수용 가능 여부`,
      body: [
        greeting,
        `${date}에 ${ctx.targetName}에서 ${size ? `${size} ` : ''}컨테이너 ${quantity}대를 받을 수 있는지 확인 부탁드립니다.`,
        '받을 수 있는 대수를 알려 주시면 계획에 반영하겠습니다.',
        footer,
      ].join('\n\n'),
      literals,
    };
  }
}
