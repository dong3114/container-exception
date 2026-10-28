/**
 * CLOSED 코드 값 — DB CHECK 와 앱 타입의 단일 원천(docs/24 3절 · 22절).
 * 값을 바꾸면 검토된 migration 으로 CHECK 를 교체한다(`NOT VALID` → `VALIDATE`).
 * CATALOG 코드(업무가 늘리는 값)는 여기가 아니라 앱 카탈로그가 정한다 — DB 는 형식만 검사한다.
 */
export const ACTOR_TYPE = ['HUMAN', 'SYSTEM', 'AI_AGENT'] as const;
export const AUDIT_RESULT = ['SUCCESS', 'FAILURE'] as const;
export const ERROR_BOUNDARY = ['API_REQUEST', 'INTEGRATION', 'BACKGROUND_JOB'] as const;
export const COUNTERPARTY_ROLE = ['TRUCKING', 'ODCY', 'WAREHOUSE', 'SHIPPING_LINE', 'TERMINAL'] as const;
export const CHANNEL_TYPE = ['GMAIL', 'MOCK', 'PORTAL'] as const;
export const EMAIL_VERIFICATION_STATUS = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED', 'EXPIRED'] as const;
export const RELATIONSHIP_STATUS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const COMMUNICATION_STATUS = ['ACTIVE', 'PAUSED', 'INACTIVE'] as const;
export const FACILITY_TYPE = ['WAREHOUSE', 'TERMINAL', 'ODCY'] as const;
export const POOL_OWNERSHIP = ['OWN', 'PARTNER'] as const;
export const RUN_TRIGGER_TYPE = [
  'EXCEPTION_DETECTED',
  'OPERATOR_REQUEST',
  'FACT_CORRECTION',
  'CONSTRAINT_CHANGE',
  'REPLY_RECEIVED',
  'SCHEDULED',
] as const;
export const RUN_STATUS = ['FEASIBLE', 'INFEASIBLE', 'TIMEOUT', 'ERROR'] as const;
export const THREAD_PURPOSE = ['CAPACITY_CHECK', 'RATE_REQUEST', 'SLOT_REQUEST', 'FACT_CONFIRM', 'GENERAL'] as const;
export const THREAD_STATUS = ['OPEN', 'WAITING_REPLY', 'ANSWERED', 'CLOSED'] as const;
export const QUESTION_TYPE = ['CAPACITY', 'RATE', 'SLOT', 'CONFIRM_FACT', 'FREE_TEXT'] as const;
export const ENTITY_TYPE = ['CONTAINER', 'BL', 'FACILITY', 'COUNTERPARTY', 'TRUCK_POOL', 'VESSEL_CALL'] as const;
export const EXPECTED_VALUE_TYPE = ['NUMBER', 'TIMESTAMP', 'CODE', 'TEXT', 'BOOLEAN'] as const;
export const QUESTION_STATUS = ['DRAFTED', 'SENT', 'ANSWERED', 'UNANSWERED', 'CANCELLED'] as const;
export const MESSAGE_DIRECTION = ['OUTBOUND', 'INBOUND'] as const;
export const MESSAGE_KIND = ['BUSINESS', 'CONTACT_VERIFICATION'] as const;
export const MESSAGE_STATUS = [
  'DRAFTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'QUEUED',
  'SENT',
  'DELIVERY_FAILED',
  'REPLIED',
  'CLOSED',
] as const;
export const DRAFTED_BY = ['AI_DRAFT', 'HUMAN', 'TEMPLATE'] as const;
export const APPROVAL_DECISION = ['APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'REVOKED', 'INVALIDATED'] as const;
export const INVALIDATION_CAUSE = ['USER_REVOKED', 'PLAN_SUPERSEDED', 'CONTENT_CHANGED'] as const;
export const SEND_RESULT = ['SUCCESS', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'UNKNOWN'] as const;
export const SOURCE_TYPE = [
  'HUMAN_UI',
  'FILE_IMPORT',
  'EMAIL',
  'DOCUMENT',
  'PUBLIC_API',
  'PARTNER_SYSTEM',
  'INFERENCE',
] as const;
export const REVIEW_STATUS = ['PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'] as const;
export const EVENT_CLASS = ['OBSERVATION', 'CORRECTION', 'VERIFICATION'] as const;
export const FACT_KIND = ['MILESTONE', 'STATE', 'OFFER', 'TERM', 'IDENTITY', 'PLAN', 'FORECAST'] as const;
export const EXTRACTION_METHOD = ['DIRECT', 'RULE_PARSED', 'LLM_EXTRACTED', 'CALCULATED'] as const;
export const INPUT_QUALITY = ['STRUCTURED', 'SEMI_STRUCTURED', 'UNSTRUCTURED'] as const;
export const CONFIDENCE_LEVEL = ['HIGH', 'MEDIUM', 'LOW'] as const;
export const VERIFICATION_ACTION = ['CONFIRM', 'REJECT', 'REVOKE'] as const;
export const VERIFICATION_METHOD = ['DIRECT_REVIEW', 'REQUEST_RESOLUTION'] as const;
export const LINK_ROLE = ['SUBJECT', 'CONTEXT'] as const;
export const TARGET_ROLE = ['TARGET', 'OVERRULED'] as const;
export const VALUE_STATUS = ['CONFIRMED', 'OBSERVED', 'PROVISIONAL', 'INFERRED', 'UNKNOWN'] as const;
export const VERIFICATION_BASIS = ['HUMAN_VERIFICATION', 'AUTHORITATIVE_SYSTEM', 'POLICY_EVIDENCE'] as const;
export const EVIDENCE_STRENGTH = ['0', '1', '2', '3'] as const;
export const EVIDENCE_TIME_QUALITY = ['EVENT_TIME', 'RECORDED_TIME', 'RECEIVED_ONLY'] as const;
export const FRESHNESS_STATUS = ['FRESH', 'AGING', 'STALE', 'EXPIRED', 'UNKNOWN', 'N_A'] as const;
export const CONFLICT_STATUS = ['NONE', 'DISSENT', 'OPEN'] as const;
export const HOLD_STATUS = ['NONE', 'HELD'] as const;
export const DECISION_USABILITY = ['USABLE', 'USABLE_WITH_WARNING', 'APPROVAL_BLOCKED', 'UNUSABLE'] as const;
export const HANDLING_TYPE = ['ACKNOWLEDGED', 'ASSIGNED', 'ASKED_EXTERNAL', 'RESOLVED', 'DISMISSED', 'SNOOZED'] as const;

// ── M14 공공데이터(T-102 · docs/24 22.30 ~ 22.35) ──
// DS-02 는 blNo 가 MBL 인지 HBL 인지 알려 주지 않는다(field-dictionary 3.3 · Q-04) — 모르면 UNKNOWN 으로 둔다(지어내지 않는다).
export const BL_TYPE = ['MASTER', 'HOUSE', 'UNKNOWN'] as const;
// CERA 장비 분류(Tariff · 경로 판단용). ISO 6346 원래 코드는 EQUIPMENT_REPORTED 사건 값에 남는다.
export const CONTAINER_SIZE_TYPE = ['20DRY', '40DRY', '40HC', '20RF', '40RF', 'OTHER'] as const;
export const CONTAINER_BL_ROLE = ['PRIMARY', 'CONSOLIDATED'] as const;
export const EXTERNAL_ID_OWNER_TYPE = ['BL', 'CONTAINER', 'VESSEL_CALL'] as const;
export const ISSUING_SYSTEM = ['KCS', 'MOF'] as const;
export const EXTERNAL_ID_TYPE = ['CARGO_MGMT_NO', 'MANIFEST_NO', 'MSN'] as const;
export const PUBLIC_DATA_PROVIDER = ['DATA_GO_KR', 'UNIPASS'] as const;
export const PUBLIC_DATA_DATASET = ['MOF_VESSEL_CALL', 'MOF_CONTAINER_MANIFEST'] as const;
export const PUBLIC_DATA_MODE = ['LIVE', 'REPLAY'] as const;
export const PUBLIC_DATA_OUTCOME = ['SUCCESS', 'NO_DATA', 'UPSTREAM_ERROR', 'TRANSPORT_ERROR', 'PARSE_ERROR'] as const;

// ── M16 Agent 실행 · Tool 호출 기록(T-103 · ADR-036 · docs/24 22.36 ~ 22.37) ──
// T-104(M18): 실행 생애주기. CREATED → RUNNING → WAITING_HUMAN · WAITING_EXTERNAL ↔ RUNNING → COMPLETED · FAILED · CANCELLED(M19 가드)
// WAITING_RUNTIME(T-104 durability): Python Runtime 이 일시적으로 닿지 않아 정해진 시각에 다시 시도한다(상한 뒤 FAILED)
export const AGENT_RUN_STATUS = ['CREATED', 'RUNNING', 'WAITING_HUMAN', 'WAITING_EXTERNAL', 'WAITING_RUNTIME', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export const AGENT_RUN_TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;
// 부작용 등급. COMMIT(승인 · 발송 · 사실 확정 · 계획 확정 · 등록부 변경)은 Agent 에게 열지 않으므로 값이 없다
export const TOOL_CATEGORY = ['READ', 'EXTERNAL_READ', 'COMPUTE', 'PROPOSE', 'REQUEST'] as const;
export const TOOL_CALL_STATUS = ['STARTED', 'SUCCEEDED', 'FAILED', 'REJECTED'] as const;

// ── M18 Agent Runtime(T-104) — 그래프 실행 관측 · 재개용 실행 상태(업무 사실 아님) ──
// M22 복구 계획(T-114). 판 상태: 제안 → 승인(사람) / 새 판에 밀림 / 사실이 바뀌어 다시 계산 필요
export const PLAN_STATUS = ['PROPOSED', 'APPROVED', 'SUPERSEDED', 'OUTDATED', 'INFEASIBLE'] as const;
export const SOLVER_STATUS = ['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIME_LIMIT', 'ERROR'] as const;
export const PLAN_ACTION = ['KEEP_CURRENT_PLAN', 'MOVE_TO_WAREHOUSE', 'MOVE_TO_ODCY', 'WAIT_AT_TERMINAL'] as const;
export const AGENT_STEP_KIND =['START', 'NODE', 'INTERRUPT', 'RESUME', 'TERMINAL'] as const;
// M24 사용자 역할(T-119 · docs/03 1절 행위자). 권한 표는 back/src/auth/permissions.ts 한 곳
export const USER_ROLE = ['ADMIN', 'OPERATOR', 'FIELD_OPERATOR'] as const;

// M30 실제 계획 입력(T-123) — docs/24 22.53 ~ 22.57
export const PLANNING_INPUT_KIND = ['CONTAINERS', 'RATES', 'FACILITY_PROFILES'] as const;
export const PLANNING_INPUT_SOURCE = ['CSV', 'ROWS'] as const;
export const OPERATIONAL_RECORD_STATUS = ['ACTIVE', 'WITHDRAWN'] as const;
export const CONTAINER_PRIORITY = ['CRITICAL', 'HIGH', 'NORMAL'] as const;
export const TARIFF_RATE_TYPE = ['DEMURRAGE_PER_DAY', 'TERMINAL_STORAGE_PER_DAY', 'DETENTION_FREE_DAYS', 'TRANSPORT', 'ODCY_HANDLING_IN_OUT', 'ODCY_STORAGE_PER_DAY'] as const;
export const TARIFF_UNIT = ['KRW', 'DAY'] as const;

// M33 계획 후속의 종류(T-128)
export const FOLLOW_UP_KIND = ['REQUEST', 'CORRECTION', 'CANCELLATION'] as const;

// M34 연락처 수동 선택(T-129) — 선택이 적용되는 범위: 기다리는 Agent 실행의 공백 하나 · 승인된 계획 판의 후속 조치 하나(전역 기본값 아님)
export const CONTACT_SELECTION_SCOPE = ['AGENT_RUN', 'PLAN_FOLLOW_UP'] as const;
export const CONTACT_SELECTION_SUBJECT = ['FACILITY', 'TRUCK_POOL'] as const;
