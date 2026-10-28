# 09. CERA 요구사항 추적성 매트릭스

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 확정(2026-10-28 구현 기준) |
| 목적 | "이 기능이 실제 코드 어디에 있고 어떤 DB 를 쓰며 어떤 시험으로 검증되는가"를 한 줄로 추적 |
| 경로 규칙 | Service/Module = `back/src/` 아래 클래스 · 파일(AI 는 `ai/cera_ai/`, 화면은 `front/web/src/`). 시험 = `back/test/unit/` · `back/test/db/`(접두사 `u/` · `d/`), `ai/tests/`(`py/`), `front/web/src/`(`fe/`) |
| 관련 문서 | [02 요구사항](02_requirements-analysis.md) · [03 유스케이스](03_use-cases.md) · [07 API](07_interface-api.md) · [부록 B API 목록](07a_appendix-api-endpoints.md) · [05 DB](05_data-model-and-tables.md) · [부록 A 컬럼](05a_appendix-table-columns.md) |

## 1. 기능 요구사항 추적

| 요구사항 | UC | API | Service / Module | Table | Test |
| --- | --- | --- | --- | --- | --- |
| FR-AUTH-001 로그인 · 세션 | UC-01 | `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | `AuthController` · `AuthService` · `AuthMiddleware` · `auth/password.ts` | `user_account` · `user_session` · `actor` · `audit_log` | d/auth.test.ts |
| FR-AUTH-002 로그인 실패 제한 | UC-01 | `POST /auth/login` | `AuthService`(계정별) · `PortfolioRateLimiter`(IP) | — | d/auth.test.ts · u/portfolio.test.ts |
| FR-AUTH-003 권한 강제 | 전체 | 전체 | `AuthGuard` · `auth/permissions.ts` | `user_account` | d/auth.test.ts · d/portfolio.test.ts · u/portfolio.test.ts |
| FR-AUTH-004 사칭 방지 | UC-01 | 전체 | `AuthMiddleware` · `config/env.ts` | `actor` | d/auth.test.ts · d/portfolio.test.ts |
| FR-AUTH-005 사용자 관리 | UC-26 | `GET · POST /admin/users` · `PATCH /admin/users/{userId}` | `AdminUsersController` · `AuthService` | `user_account` · `user_session` · `actor` · `audit_log` | d/auth.test.ts |
| FR-AUTH-006 데모 방문자 세션 | UC-01 | `GET · POST /auth/demo-session` | `DemoSessionController` · `AuthService.demoSession` · `SeedUsers.applyDemoVisitor` | `user_account` · `user_session` | d/portfolio.test.ts |
| FR-RUN-001 시나리오 실행 | UC-02 | (시드 명령) | `Slice1Seed` · `seed/run-seed.ts` | `scenario` · `planning_snapshot` · `recovery_run` · 등록부 · `raw_input` · `event` | d/persistence.test.ts · d/invariants.test.ts |
| FR-RUN-002 실제 실행 생성 | UC-02 | `POST /planning/runs` | `PlanningInputController` · `PlanningInputService` | `planning_snapshot` · `recovery_run` | d/live-planning.test.ts |
| FR-RUN-003 실행 목록 | UC-02 | `GET /planning/runs` | `PlanningRunController`(`communication/draft.controller.ts`) | `recovery_run` · `agent_run` · `recovery_plan` | d/drafts.test.ts · fe/components/ops/ops.test.tsx |
| FR-AGENT-001 실행 생성 · 시작 | UC-03 | `POST /agent-runs` · `POST /agent-runs/{agentRunId}/start` · `GET /agent-runs*` | `AgentRunsController` · `AgentToolsService` · `AgentCoordinator` · `HttpAgentRuntimeClient` · py/`agent/runtime.py` | `agent_run` · `agent_step` | d/agent-runtime.test.ts · d/processes.test.ts · py/test_agent_graph.py |
| FR-AGENT-002 정보 공백 판정 | UC-04 | `POST /internal/agent-tools/get_information_gaps` | `RecoveryContextService`(`agent-tools/context.service.ts`) | `canonical_fact` · `facility` · `truck_pool` · `comm_message` | d/agent-tools.test.ts · u/agent-tools.test.ts |
| FR-AGENT-003 다음 행동 선택 | UC-03 | — | py/`agent/graph.py` `DeterministicPolicy` | — | py/test_agent_graph.py |
| FR-AGENT-004 대기 · 재개 | UC-03 | `POST /agent-runs/{agentRunId}/resume` | `AgentCoordinator` · `agent-tools/wake-rules.ts` · `DomainSignals` | `agent_run` · `agent_checkpoint` | d/agent-runtime.test.ts · u/agent-wake-rules.test.ts |
| FR-AGENT-005 재조정 | UC-03 | — | `AgentReconciler` · `WorkerRunner` | `agent_run` | d/agent-reconcile-paging.test.ts · d/processes.test.ts |
| FR-AGENT-006 Tool 경계 | UC-03 · 04 · 05 · 14 | `/internal/agent-tools*` · `/internal/agent-runtime/*` | `AgentToolsController` · `AgentServiceAuth` · `ToolExecutor` · `agent-tools/handlers.ts` · `AgentRuntimeController` · `AgentRuntimeService` · py/`agent/tooling.py` · `agent/checkpointer.py` | `agent_tool_call` · `agent_step` · `agent_checkpoint(_write)` | d/agent-tools.test.ts · u/agent-tools.test.ts · py/test_tools.py |
| FR-AGENT-007 취소 | UC-03 | `POST /agent-runs/{agentRunId}/cancel` | `AgentRunsController` · `AgentCoordinator` | `agent_run` | d/agent-runtime.test.ts |
| FR-AGENT-008 Runtime 재시도 · 상한 | UC-03 | — | `AgentCoordinator` · `HttpAgentRuntimeClient` · py/`config.py` | `agent_run`(`runtime_attempts` · `next_attempt_at`) | u/agent-runtime-client.test.ts · py/test_runtime_limits.py |
| FR-REG-001 등록부 조회 | UC-21~23 | `GET /registry/counterparties` · `GET /registry/facilities` · `GET /registry/addresses/{addressId}/eligibility` | `RegistryController` · `RegistryService` · `RegistryReader` | `counterparty` · `counterparty_contact` · `contact_channel_address` · `facility` · `truck_pool` | d/registry.test.ts |
| FR-REG-002 거래처 등록 | UC-21 | `POST /registry/counterparties` | `RegistryService` | `counterparty` | d/contact-registration.test.ts |
| FR-REG-003 담당자 · 주소 등록 | UC-21 | `POST /registry/counterparties/{counterpartyId}/contacts` | `RegistryService` | `counterparty_contact` · `contact_channel_address` | d/contact-registration.test.ts · d/registry.test.ts |
| FR-REG-004 주소 승인 · 거절 | UC-21 · 23 | `POST /registry/addresses/{addressId}/approve` · `/reject` | `RegistryService` | `contact_channel_address` · `audit_log` | d/contact-lifecycle.test.ts |
| FR-REG-005 통신 상태 · 담당자 활성 | UC-23 | `PATCH /registry/addresses/{addressId}/status` · `PATCH /registry/contacts/{contactId}` | `RegistryService` | `contact_channel_address` · `counterparty_contact` | d/contact-lifecycle.test.ts |
| FR-REG-006 시설 운영사 | UC-21 | `PATCH /registry/facilities/{facilityId}/operator` | `RegistryService` | `facility` | d/contact-routing.test.ts |
| FR-REG-007 Contact Gate | UC-05 · 06 · 07 | `GET .../eligibility` · 초안 · 승인 · 발송 | `registry/contact-gate.ts` · `DraftService` · `SendService` | `contact_channel_address` · `counterparty_contact` · `counterparty` | u/contact-gate.test.ts · d/registry.test.ts · d/send.test.ts |
| FR-REG-008 받는 주소 선택 | UC-22 | `POST /agent-runs/{agentRunId}/contact-selection` · `POST /planning/plans/{planId}/follow-ups/contact-selection` | `AgentContactSelectionService` · `PlanFollowUpService` · `ContactSelectionRepository` | `contact_selection` · `audit_log` | d/contact-lifecycle.test.ts |
| FR-REG-009 등록 · 선택 뒤 깨움 | UC-21 · 22 | (위 API) | `agent-tools/wake-rules.ts` · `AgentCoordinator` | `agent_run` | u/agent-wake-rules.test.ts · py/test_agent_graph.py |
| FR-COMM-001 문의 초안 | UC-05 | `POST /communication/drafts` · `GET /communication/drafts*` | `DraftController` · `DraftService` · `communication/inquiry-intents.ts` · `TemplateDraftProse` | `comm_thread` · `comm_message` · `question_item` · `comm_message_question` · `comm_message_structured_field` | d/drafts.test.ts |
| FR-COMM-002 숫자 검사 | UC-05 | (초안 · 수정) | `communication/number-check.ts` | — | u/draft-number-check.test.ts · d/drafts.test.ts |
| FR-COMM-003 초안 수정 | UC-05 | `POST /communication/drafts/{messageId}/revisions` | `DraftService` | `comm_message` · `comm_message_structured_field` | d/drafts.test.ts |
| FR-COMM-004 승인 · 반려 · 취소 | UC-06 | `POST /communication/drafts/{messageId}/approve` · `/reject` · `POST /communication/approvals/{approvalId}/revoke` · `GET /communication/approvers` | `ApprovalController` · `ApprovalService` · `communication/approval-rules.ts` · `ApprovalRepository` | `message_approval` · `message_approval_structured_field` · `message_status_transition` · `audit_log` | d/approvals.test.ts · u/approval-rules.test.ts |
| FR-COMM-005 발송 요청 | UC-07 | `POST /communication/drafts/{messageId}/send` | `SendController` · `SendService` · `communication/send-rules.ts` | `message_status_transition` · `audit_log` | d/send.test.ts · u/send-rules.test.ts · d/portfolio.test.ts |
| FR-COMM-006 Worker 발송 · 재시도 · 화해 | UC-07 | — | `OutboxDispatcher` · `SendRepository` · `MockChannelAdapter` · `GmailChannelAdapter` · `WorkerRunner` | `send_attempt` · `message_status_transition` · `comm_message` | d/send.test.ts · d/gmail-channel.test.ts |
| FR-COMM-007 발송 차단 스위치 | UC-07 | — | `OutboxDispatcher`(`CERA_SENDING_PAUSED`) | — | d/send.test.ts |
| FR-COMM-008 수신 · 원문 · 발신자 | UC-08 | `GET /communication/inbound` | `InboundProcessor` · `InboundService` · `communication/inbound-rules.ts` · `ContentService` | `raw_input` · `comm_message` · `comm_thread` | d/inbound.test.ts · u/inbound-rules.test.ts · u/content-store.test.ts |
| FR-COMM-009 Gmail 채널 | UC-07 · 08 | — | `GmailChannelAdapter` · `GmailClient` · `dev/gmail-auth.ts` | `send_attempt` · `raw_input` | u/gmail-channel.test.ts · d/gmail-channel.test.ts |
| FR-COMM-010 Mock 채널 · 회신 도우미 | UC-07 · 08 | `POST /dev/demo/mock-reply` · `GET /dev/demo/status` | `MockChannelAdapter` · `DemoController` | — | d/send.test.ts · d/inbound.test.ts · d/portfolio.test.ts |
| FR-COMM-011 승인 무효화 | UC-18 · 19 · 20 | — | `PlanSupersessionService` | `message_approval` | d/approvals.test.ts · d/recovery-plan.test.ts |
| FR-EXT-001 추출 요청 | UC-09 | AI `POST /v1/extractions/reply` | `ExtractionProcessor` · `HttpAiClient` · py/`app.py` · `extraction.py` | `extraction` | d/extraction.test.ts · d/ai-server.test.ts · py/test_ai_server.py |
| FR-EXT-002 결정론 검증 | UC-09 | — | `communication/extraction-rules.ts` · py/`evals` 포팅 | `extraction`(`validator_result`) | u/extraction-rules.test.ts · u/validator-conformance.test.ts · py/test_validator_conformance.py |
| FR-EXT-003 자동 재시도 | UC-09 | — | `ExtractionProcessor` · `communication/extraction-status.ts` | `extraction` · `system_error` | d/extraction.test.ts · u/extraction-status.test.ts |
| FR-EXT-004 사람 재추출 | UC-10 | `POST /communication/inbound/{messageId}/extraction/retry` | `InboundController` · `ExtractionRetryService` | `extraction_retry_request` | d/extraction-retry.test.ts |
| FR-EXT-005 공급자 · failover | UC-09 | — | py/`providers.py` · `llm_adapters.py` · `config.py` | — | py/test_config.py · py/test_ai_server.py |
| FR-TRUTH-001 후보 → 임시 사실 | UC-09 | — | `PromotionService` · `truth/promotion-rules.ts` · `EventWriter` | `event` · `event_entity_link` · `extraction` · `canonical_fact` | u/truth-rules.test.ts · d/truth.test.ts |
| FR-TRUTH-002 사실 조회 | UC-12 | `GET /truth/facts` | `TruthController` · `TruthQueryService` | `canonical_fact` · `event` | d/truth.test.ts · fe/api/truth.test.ts |
| FR-TRUTH-003 확인 · 거절 · 정정 · 철회 | UC-12 | `POST /truth/events/{eventId}/confirm` · `/reject` · `/correct` · `/revoke` | `TruthController` · `FactActionService` | `event` · `event_verification_target` · `canonical_fact` | d/truth.test.ts |
| FR-TRUTH-004 직접 입력 | UC-11 | `POST /truth/facts/manual` | `FactActionService` | `raw_input` · `event` · `canonical_fact` | d/truth.test.ts |
| FR-TRUTH-005 Reconciliation | UC-09 · 11 · 12 | — | `TruthService` · `truth/reconcile-rules.ts` · `WorkerRunner`(재판정) | `canonical_fact` · `conflict` | u/truth-rules.test.ts · d/truth.test.ts |
| FR-TRUTH-006 신선도 | UC-12 | — | `truth/truth-policy.ts` | `canonical_fact` | u/truth-rules.test.ts |
| FR-TRUTH-007 충돌 | UC-12 | — | `truth/reconcile-rules.ts` | `conflict` · `verification_request` | u/truth-rules.test.ts |
| FR-INPUT-001 컨테이너 입력 | UC-24 | `POST · GET /planning/runs/{runId}/inputs/containers` · `GET /planning/inputs/batches/{batchId}` | `PlanningInputController` · `PlanningInputService` · `planning/live-input.ts` · `planning/operational-import.ts` | `planning_input_batch` · `planning_container_record` · `container` | u/live-input.test.ts · d/live-planning.test.ts |
| FR-INPUT-002 요율 입력 | UC-24 | `POST · GET /planning/inputs/rates` | 위와 같음 | `tariff_rate` · `planning_input_batch` | u/live-input.test.ts · d/live-planning.test.ts |
| FR-INPUT-003 시설 계획 정보 | UC-24 | `POST · GET /planning/inputs/facility-profiles` | 위와 같음 | `facility_planning_profile` | d/live-planning.test.ts |
| FR-INPUT-004 준비도 | UC-13 | `GET /planning/runs/{runId}/input-readiness` | `PlanningController` · `RecoveryPlanService` · `planning/live-input.ts` | 입력 표 · `canonical_fact` | d/live-planning.test.ts |
| FR-PLAN-001 비용 · 위험 | UC-14 | `GET /planning/runs/{runId}/costs` · Tool `calculate_recovery_costs` | `planning/engine/cost-engine.ts` · `cost-policy.ts` · `RecoveryPlanService` | 읽기(사실 · 요율 · 컨테이너) | u/cost-engine.test.ts |
| FR-PLAN-002 기준안 | UC-14 | (계산 안) | `planning/engine/baseline.ts` | `recovery_plan`(`baseline_*`) | u/cost-engine.test.ts · u/solver.test.ts |
| FR-SOLVER-001 최적 배정 | UC-14 | Tool `solve_recovery` · 재계산 | `planning/engine/solver.ts` | `recovery_plan_item` | u/solver.test.ts |
| FR-PLAN-003 판 저장 · 조회 | UC-14 | `GET /planning/runs/{runId}/plans` · `GET /planning/plans/{planId}` · Tool `propose_recovery_plan` · `get_recovery_plan` | `PlanningController` · `RecoveryPlanService` · `planning/plan-view.ts` | `recovery_plan` · `recovery_plan_item` · `planning_snapshot` | d/recovery-plan.test.ts · fe/api/plans.test.ts |
| FR-PLAN-004 계획 승인 | UC-15 | `POST /planning/plans/{planId}/approve` | `RecoveryPlanService` | `recovery_plan` · `audit_log` | d/recovery-plan.test.ts |
| FR-PLAN-005 OUTDATED | UC-17 | — | `RecoveryPlanService` | `recovery_plan`(`outdated_reasons`) | d/recovery-plan.test.ts · d/live-planning.test.ts |
| FR-PLAN-006 재계산 | UC-18 | `POST /planning/runs/{runId}/plans` | `PlanningController` · `RecoveryPlanService` | `recovery_plan` · `recovery_plan_item` | d/recovery-plan.test.ts · d/live-planning.test.ts |
| FR-FU-001 후속 요청 | UC-16 | `GET · POST /planning/plans/{planId}/follow-ups` | `PlanFollowUpController` · `PlanFollowUpService` · `planning/follow-up.ts` | `plan_follow_up` · `comm_message` | u/follow-up.test.ts · d/recovery-plan.test.ts |
| FR-FU-002 정정 | UC-19 | 위와 같음 | 위와 같음 | `plan_follow_up`(`follow_up_kind`, `refers_to_message_id`) | u/follow-up.test.ts · d/recovery-plan.test.ts |
| FR-FU-003 취소 | UC-20 | 위와 같음 | 위와 같음 | 위와 같음 | u/follow-up.test.ts · d/recovery-plan.test.ts |
| FR-FU-004 후속 받는 주소 | UC-16 · 22 | 위 + `.../follow-ups/contact-selection` | `PlanFollowUpService` · `registry/contact-gate.ts` | `contact_selection` | d/contact-routing.test.ts · d/contact-lifecycle.test.ts |
| FR-PUB-001 입항 선박 | UC-25 | `POST /public-data/vessel-calls/fetch` · `GET /public-data/*` | `PublicDataController` · `PublicDataService` · `DataGoKrHttpTransport` · `public-data/adapters/*` | `public_data_fetch` · `raw_input` · `vessel_call` | u/public-data.test.ts · d/public-data.test.ts |
| FR-PUB-002 적하목록 | UC-25 | `POST /public-data/vessel-calls/{vesselCallId}/manifest/fetch` | 위와 같음 · `public-data/normalization/*` | `container` · `bl` · `container_bl` · `external_identifier` | 위와 같음 |
| FR-PUB-003 replay / live | UC-25 | — | `ReplayTransport` · `DisabledTransport` · `config/env.ts` | — | u/public-data.test.ts · u/config.test.ts |
| FR-AUDIT-001 감사 | 전체 | — | `AuditRecorder` · `persistence/catalog.ts` | `audit_log` | d/persistence.test.ts · d/invariants.test.ts |
| FR-AUDIT-002 시스템 오류 | 전체 | — | `SystemErrorRecorder` · `ApiErrorFilter` | `system_error` | d/persistence.test.ts · u/context-errors.test.ts |
| FR-OPS-001 상태 확인 | — | `GET /health/live` · `GET /health` | `HealthController` · `DatabaseHealth` · `RedisExecutionQueue` | — | d/api.e2e.test.ts · d/queue.test.ts · d/portfolio.test.ts |
| FR-OPS-002 API 계약 | — | `GET /openapi.json` | `http/openapi.ts` · `openapi/emit-openapi.ts` | — | d/api.e2e.test.ts · fe/api/contract.test.ts |
| FR-DEMO-001 시연 도우미 | UC-07 · 08 | `GET /dev/demo/status` · `POST /dev/demo/mock-reply` | `DemoController` | — | d/portfolio.test.ts |
| FR-DEMO-002 포트폴리오 모드 | UC-01 | `/auth/demo-session` · 전체(요청 한도) | `config/env.ts` · `http/public-guards.ts` · `SendService` · `DemoController` · py/`config.py` · fe/`app/PortfolioDemo.tsx` · `app/LoginGate.tsx` | `user_account` · `user_session` | u/portfolio.test.ts · d/portfolio.test.ts · py/test_config.py · fe/app/portfolio.test.tsx |

## 2. 비기능 요구사항 추적

| 요구사항 | 구현 위치 | 시험 · 근거 |
| --- | --- | --- |
| NFR-SEC-001 | `AuthGuard` · `auth/permissions.ts` | d/auth.test.ts |
| NFR-SEC-002 | `AuthService` · `AuthController` · `config/env.ts` | d/auth.test.ts · u/config.test.ts |
| NFR-SEC-003 | `config/env.ts` · `ai/cera_ai/config.py` · `front/web/src/api/config.ts` | u/env-example.test.ts · fe/app/portfolio.test.tsx |
| NFR-SEC-004 | `ApprovalService` · `SendService` · `registry/contact-gate.ts` · DB 트리거(`fn_cera_guard_approval_decision`) | d/approvals.test.ts · d/send.test.ts · d/invariants.test.ts |
| NFR-SEC-005 | `registry/contact-gate.ts`(`devSafetyApplies`) | u/contact-gate.test.ts |
| NFR-SEC-006 | `config/env.ts` · `ai/cera_ai/config.py` | u/config.test.ts · py/test_config.py |
| NFR-SEC-007 | `http/public-guards.ts` · `app/create-api.ts` · `infra/portfolio/*` | u/portfolio.test.ts · d/portfolio.test.ts |
| NFR-SEC-008 | `ApiErrorFilter` | d/portfolio.test.ts · d/api.e2e.test.ts |
| NFR-REL-001 | `RedisExecutionQueue` · `DisabledExecutionQueue` · `SignalToQueueBridge` · `WorkerRunner` | d/queue.test.ts · u/execution-queue.test.ts |
| NFR-REL-002 | `AgentCoordinator` · `AgentReconciler` · `RuntimeStoreRepository` · py/`agent/checkpointer.py` | d/processes.test.ts · d/agent-runtime.test.ts |
| NFR-REL-003 | `OutboxDispatcher` · DB 트리거(`fn_cera_guard_send_attempt_*`) | d/send.test.ts |
| NFR-REL-004 | `ToolExecutor` · `FactActionService` · `PlanningInputService` · `InboundProcessor` | d/agent-tools.test.ts · d/inbound.test.ts · d/truth.test.ts |
| NFR-REL-005 | `ExtractionProcessor` · `PromotionService` | d/extraction.test.ts · d/truth.test.ts |
| NFR-INT-001 | migration M07 · M08 · M09 등 guard(트리거 함수 `fn_cera_reject_*`) | d/invariants.test.ts · d/permissions-migrations.test.ts |
| NFR-INT-002 | `shared/money`(`Krw`) · `shared/time`(`Instant` · `CLOCK`) | u/krw.test.ts · u/time.test.ts |
| NFR-INT-003 | 복합 FK(`is_simulated`) | d/invariants.test.ts |
| NFR-INT-004 | `docs/24` 22절 ↔ 카탈로그 | d/schema-catalog.test.ts |
| NFR-AUDIT-001 | `AuditRecorder` · `shared/context/request-context.ts` | d/persistence.test.ts |
| NFR-PERF-001 | `planning/engine/solver.ts` | u/solver.test.ts · ADR-038 |
| NFR-PERF-002 | `config/env.ts` · `ai/cera_ai/config.py` | u/config.test.ts |
| NFR-OBS-001 | `http/request-context.middleware.ts` · `app/logger.ts` | u/context-errors.test.ts |
| NFR-OBS-002 | `dev/runtime-stats.ts` | (도구) |
| NFR-DEP-001 | `infra/local/*` · `infra/portfolio/*` · Dockerfile 3개 | 10-27 · 10-28 Docker E2E |
| NFR-DEP-002 | `infra/README.md` · `infra/portfolio/README.md` | 10-27 새 설치 · 백업/복원 실측 |
| NFR-MNT-001 | `openapi/emit-openapi.ts` · `agent-tools/emit-tool-contracts.ts` · `dev/validator-conformance.ts` · py/`emit_schema.py` | d/api.e2e.test.ts · u/validator-conformance.test.ts · fe/api/contract.test.ts |
| NFR-MNT-002 | `dev/env-check.ts` · py/`config.py` | u/env-example.test.ts · py/test_config.py |
| NFR-MNT-003 | `db/migrate.ts` · `drizzle.config.ts` | d/permissions-migrations.test.ts · d/drizzle-kit.test.ts |

## 3. Coverage

| 항목 | 값 |
| --- | --- |
| 기능 요구사항 | 73 / 73 — 모두 Service/Module 위치와 시험이 1개 이상 연결됨 |
| 비기능 요구사항 | 27 / 27 — 구현 위치 연결. 시험 대신 실측 · 도구로 근거가 있는 항목: NFR-OBS-002 · NFR-DEP-001 · NFR-DEP-002 |
| Use Case | 26 / 26 — 각 UC 가 요구사항 1개 이상에 연결 |
| 사람용 API(부록 B, Internal 제외 71) | 모두 1개 이상 요구사항에 연결(공공데이터 조회 GET 은 FR-PUB-001 로 묶음) |
| Table | 51 / 51 — [05](05_data-model-and-tables.md) 3절 "관련 기능"에 연결(`verification_request_handling` 은 전용 API 없음 — [향후]) |

시험 파일 위치는 2026-10-28 HEAD 기준이다. 시험 이름은 `describe` · `it` 문구로 찾는다(예: `grep -n "contact-selection" back/test/db/contact-lifecycle.test.ts`).
