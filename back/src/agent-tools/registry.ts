import type { z } from 'zod';
import type { TOOL_CATEGORY } from '../db/schema/codes.js';
import {
  approvalRequestedOutput,
  communicationStatusInput,
  communicationStatusOutput,
  counterpartiesOutput,
  createInquiryDraftInput,
  draftCreatedOutput,
  findCounterpartyInput,
  getVesselCallsInput,
  informationGapsOutput,
  manifestOutput,
  messageIdInput,
  replyCandidatesOutput,
  recoveryContextOutput,
  recoveryRunInput,
  vesselCallDetailOutput,
  vesselCallIdInput,
  vesselCallsOutput,
} from './schemas.js';

/**
 * Agent Tool Registry(T-103 · ADR-036 결정 5) — **Agent 가 쓸 수 있는 것은 이 목록뿐이다.** 내부 API 를 탐색하는 길은 없다.
 *
 * 부작용 등급: READ(내부 읽기) · EXTERNAL_READ(Backend 가 외부를 읽고 원문을 남긴다) · COMPUTE(결정론 계산) ·
 * PROPOSE(초안 · 후보 — 업무 사실을 바꾸지 않는다) · REQUEST(사람에게 일을 요청 — 승인 · 발송이 아니다).
 * **COMMIT(승인 · 반려 · 발송 · 사실 확정 · 최종 계획 선택 · 등록부 변경)은 등급 자체가 없다** — 등록할 수 없다.
 *
 * description 은 LLM 프롬프트 역할도 한다: "무엇을 하는가" + "언제 쓰는가" + "하지 않는 것".
 */
export type ToolCategory = (typeof TOOL_CATEGORY)[number];

export interface ToolDefinition<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  version: '1';
  category: ToolCategory;
  description: string;
  input: I;
  output: O;
  timeoutMs: number;
  /** PROPOSE · REQUEST 는 Idempotency-Key 필수 — 재시도가 부작용을 두 번 만들지 않는다 */
  idempotency: 'REQUIRED' | 'NONE';
}

const define = <I extends z.ZodTypeAny, O extends z.ZodTypeAny>(d: ToolDefinition<I, O>) => d;

// 시간 제한 [ASSUMPTION] — 내부 읽기는 짧게, 외부 읽기는 페이지 여러 장(어댑터 1회 시간 제한 × 페이지)을 고려해 길게
/** Tool 실행 하나의 비상 상한 [ASSUMPTION / DEVELOPMENT SAFETY CEILING] — 느린 정상 실행을 막지 않게 넉넉히. 관측(`npm run runtime:stats`) 후 줄인다 */
export const TOOL_TIMEOUT_MS = { READ: 30_000, EXTERNAL_READ: 120_000, COMPUTE: 60_000, PROPOSE: 60_000, REQUEST: 60_000 } as const;

export const TOOLS = [
  define({
    name: 'get_vessel_calls',
    version: '1',
    category: 'EXTERNAL_READ',
    description:
      'Fetch Busan vessel calls (arrival basis) for a date range from the public port data service through the CERA backend, register them and return each call with its latest declared arrival time (a port entry declaration — not a confirmed berthing) and berth plus provenance. Use when you need to know which vessels arrive or arrived in a window, or to find the vessel call of a shipment. Each call counts against the public API quota and stores new evidence — prefer get_vessel_call for a call you already have. Values are public observations, not confirmed facts.',
    input: getVesselCallsInput,
    output: vesselCallsOutput,
    timeoutMs: TOOL_TIMEOUT_MS.EXTERNAL_READ,
    idempotency: 'NONE',
  }),
  define({
    name: 'get_vessel_call',
    version: '1',
    category: 'READ',
    description:
      'Read one registered vessel call and its known manifest containers from CERA (no external call). Use before deciding whether to fetch the manifest, or to read provenance of arrival and berth observations.',
    input: vesselCallIdInput,
    output: vesselCallDetailOutput,
    timeoutMs: TOOL_TIMEOUT_MS.READ,
    idempotency: 'NONE',
  }),
  define({
    name: 'get_container_manifest',
    version: '1',
    category: 'EXTERNAL_READ',
    description:
      'Fetch the import container manifest (B/L to container, ISO size type) of one registered vessel call from the public port data service through the CERA backend. Use when you need the containers of a vessel call. Does not give per-container gate-out times. Values are public observations with provenance, not confirmed facts.',
    input: vesselCallIdInput,
    output: manifestOutput,
    timeoutMs: TOOL_TIMEOUT_MS.EXTERNAL_READ,
    idempotency: 'NONE',
  }),
  define({
    name: 'get_recovery_context',
    version: '1',
    category: 'READ',
    description:
      'Read the recovery run this agent run is bound to: run status and trigger, snapshot date, facilities and truck pools in play, raw observed claims, the judged current facts with their state (PROVISIONAL is not confirmed) and the inquiries already drafted or sent for it. Use first, to understand the situation before choosing any other tool.',
    input: recoveryRunInput,
    output: recoveryContextOutput,
    timeoutMs: TOOL_TIMEOUT_MS.READ,
    idempotency: 'NONE',
  }),
  define({
    name: 'get_information_gaps',
    version: '1',
    category: 'READ',
    description:
      'Ask the CERA backend which facts the recovery plan needs but does not have (deterministic rules, not a judgement): warehouse/ODCY capacity for the plan date and partner truck availability. Each gap says its state — MISSING, ASKED, PROVISIONAL_AVAILABLE (a validated but unconfirmed value exists; a human must confirm) or NEEDS_REVIEW — whether an inquiry is already open, and which counterparty role can answer it. Only a human-confirmed fact closes a gap (it moves to `known`). Use to decide what to investigate or ask next; do not invent gaps yourself.',
    input: recoveryRunInput,
    output: informationGapsOutput,
    timeoutMs: TOOL_TIMEOUT_MS.READ,
    idempotency: 'NONE',
  }),
  define({
    name: 'find_counterparty',
    version: '1',
    category: 'READ',
    description:
      'Look up registered counterparties (trucking, warehouse, ODCY, ...) with their contact addresses and the Contact Gate verdict for each address. Use to pick a recipient for create_inquiry_draft. Only an eligible address can receive an inquiry; never guess an address.',
    input: findCounterpartyInput,
    output: counterpartiesOutput,
    timeoutMs: TOOL_TIMEOUT_MS.READ,
    idempotency: 'NONE',
  }),
  define({
    name: 'create_inquiry_draft',
    version: '1',
    category: 'PROPOSE',
    description:
      'Create an inquiry draft (truck slot or facility capacity question) to an eligible counterparty address for this recovery run. The backend fills the structured values into a template, re-checks the Contact Gate and checks every number in the text. The draft is NOT sent and NOT in the approval queue yet — call request_approval next. Requires an Idempotency-Key; retrying with the same key returns the same draft.',
    input: createInquiryDraftInput,
    output: draftCreatedOutput,
    timeoutMs: TOOL_TIMEOUT_MS.PROPOSE,
    idempotency: 'REQUIRED',
  }),
  define({
    name: 'get_communication_status',
    version: '1',
    category: 'READ',
    description:
      'Read the state of inquiries of this recovery run: draft, waiting for human approval, approved, queued, sent, replied, and whether replies have extraction candidates. Use to know whether to wait, follow up or continue.',
    input: communicationStatusInput,
    output: communicationStatusOutput,
    timeoutMs: TOOL_TIMEOUT_MS.READ,
    idempotency: 'NONE',
  }),
  define({
    name: 'get_reply_candidates',
    version: '1',
    category: 'READ',
    description:
      'Read the replies to one inquiry of this recovery run and the extraction candidates the backend validated (field, candidate value, PASSED/REJECTED and why, review status). Candidates are suggestions; a qualifying one has already become a provisional fact (fact_event_id) — not a confirmed one. Use after a reply arrived to judge whether the asked information came back. No raw mail text or quotes are returned.',
    input: messageIdInput,
    output: replyCandidatesOutput,
    timeoutMs: TOOL_TIMEOUT_MS.READ,
    idempotency: 'NONE',
  }),
  define({
    name: 'request_approval',
    version: '1',
    category: 'REQUEST',
    description:
      'Put a draft of this recovery run into the human approval queue. This is a request, not an approval: the backend re-checks content fingerprint, numbers, Contact Gate and plan currency, and a human operator decides. After this, wait — sending happens only after a human approves. Requires an Idempotency-Key.',
    input: messageIdInput,
    output: approvalRequestedOutput,
    timeoutMs: TOOL_TIMEOUT_MS.REQUEST,
    idempotency: 'REQUIRED',
  }),
] as const;

export type ToolName = (typeof TOOLS)[number]['name'];
const BY_NAME = new Map<string, ToolDefinition>(TOOLS.map((t) => [t.name, t as unknown as ToolDefinition]));

export function findTool(name: string): ToolDefinition | null {
  return BY_NAME.get(name) ?? null;
}

/** 등록되지 않는 행동(COMMIT) — 이름으로도 막는다(시험이 목록과 대조한다). */
export const FORBIDDEN_TOOL_NAMES = ['approve_draft', 'approve', 'reject_draft', 'send', 'send_message', 'request_send', 'force_send', 'mark_sent', 'confirm_fact', 'select_final_plan', 'mutate_registry'] as const;
