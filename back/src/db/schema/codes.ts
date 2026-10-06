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
