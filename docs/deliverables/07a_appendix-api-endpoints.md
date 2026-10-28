# 부록 B. API 엔드포인트 전체 목록 (자동 생성)

> 상태: **자동 생성 — 손으로 고치지 않는다.** 원천 = `back/src/**/*.controller.ts` 의 `@Controller` · `@Get/@Post/...` · `@RequirePermission` · `@Public` 데코레이터(2026-10-28, T-132 · T-133 반영). 업무 설명은 [07 인터페이스 · API 연계 설계서](07_interface-api.md).
> 권한 열: `PUBLIC` = 사람 로그인 Guard 를 건너뜀(상태 확인 · 로그인 · 데모 입구 · **서비스 토큰을 컨트롤러가 따로 검사하는 Internal 경로**). `read` = 선언 없는 GET 의 기본 권한. 역할별 권한은 `back/src/auth/permissions.ts`.
> 화면은 이 경로를 `/backend` 접두사로 부른다(nginx · Vite 프록시). 브라우저가 부르는 쪽은 Internal 을 뺀 경로뿐이다(공개 배포는 `/backend/internal/*` 404).

합계: 85 경로(사람 · 화면용 79 · Internal 6)

## Health

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/health/live` | `PUBLIC` | `HealthController.live` | `back/src/health/health.controller.ts:34` |
| GET | `/health` | `PUBLIC` | `HealthController.check` | `back/src/health/health.controller.ts:40` |

## Auth · Demo session

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | `PUBLIC` | `AuthController.login` | `back/src/auth/auth.controller.ts:28` |
| POST | `/auth/logout` | `PUBLIC` | `AuthController.logout` | `back/src/auth/auth.controller.ts:43` |
| GET | `/auth/me` | `read` | `AuthController.me` | `back/src/auth/auth.controller.ts:51` |
| GET | `/auth/demo-session` | `PUBLIC` | `DemoSessionController.info` | `back/src/auth/auth.controller.ts:97` |
| POST | `/auth/demo-session` | `PUBLIC` | `DemoSessionController.start` | `back/src/auth/auth.controller.ts:109` |

## 사용자 관리

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/admin/users` | `users.manage` | `AdminUsersController.list` | `back/src/auth/auth.controller.ts:64` |
| POST | `/admin/users` | `users.manage` | `AdminUsersController.create` | `back/src/auth/auth.controller.ts:70` |
| PATCH | `/admin/users/{userId}` | `users.manage` | `AdminUsersController.update` | `back/src/auth/auth.controller.ts:76` |

## Registry(거래처 · 연락처 · 시설 · 트럭 풀)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/registry/counterparties` | `read` | `RegistryController.listCounterparties` | `back/src/registry/registry.controller.ts:18` |
| GET | `/registry/facilities` | `read` | `RegistryController.listFacilities` | `back/src/registry/registry.controller.ts:25` |
| PATCH | `/registry/facilities/{facilityId}/operator` | `registry.manage` | `RegistryController.setFacilityOperator` | `back/src/registry/registry.controller.ts:33` |
| POST | `/registry/facilities` | `registry.manage` | `RegistryController.createFacility` | `back/src/registry/registry.controller.ts:49` |
| POST | `/registry/truck-pools` | `registry.manage` | `RegistryController.createTruckPool` | `back/src/registry/registry.controller.ts:60` |
| POST | `/registry/counterparties` | `registry.manage` | `RegistryController.createCounterparty` | `back/src/registry/registry.controller.ts:71` |
| POST | `/registry/counterparties/{counterpartyId}/contacts` | `registry.manage` | `RegistryController.createContact` | `back/src/registry/registry.controller.ts:85` |
| POST | `/registry/addresses/{addressId}/approve` | `registry.manage` | `RegistryController.approveAddress` | `back/src/registry/registry.controller.ts:101` |
| PATCH | `/registry/addresses/{addressId}/status` | `registry.manage` | `RegistryController.setAddressStatus` | `back/src/registry/registry.controller.ts:116` |
| POST | `/registry/addresses/{addressId}/reject` | `registry.manage` | `RegistryController.rejectAddress` | `back/src/registry/registry.controller.ts:131` |
| PATCH | `/registry/contacts/{contactId}` | `registry.manage` | `RegistryController.setContactActive` | `back/src/registry/registry.controller.ts:146` |
| GET | `/registry/addresses/{addressId}/eligibility` | `read` | `RegistryController.getEligibility` | `back/src/registry/registry.controller.ts:159` |

## Communication(초안 · 승인 · 발송 · 수신 · 추출)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/communication/approvers` | `read` | `ApprovalController.approvers` | `back/src/communication/approval.controller.ts:38` |
| POST | `/communication/drafts/{messageId}/approve` | `communication.approve` | `ApprovalController.approve` | `back/src/communication/approval.controller.ts:46` |
| POST | `/communication/drafts/{messageId}/reject` | `communication.approve` | `ApprovalController.reject` | `back/src/communication/approval.controller.ts:69` |
| POST | `/communication/approvals/{approvalId}/revoke` | `communication.approve` | `ApprovalController.revoke` | `back/src/communication/approval.controller.ts:85` |
| POST | `/communication/drafts` | `communication.draft` | `DraftController.create` | `back/src/communication/draft.controller.ts:32` |
| GET | `/communication/drafts` | `read` | `DraftController.list` | `back/src/communication/draft.controller.ts:45` |
| GET | `/communication/drafts/{messageId}` | `read` | `DraftController.get` | `back/src/communication/draft.controller.ts:52` |
| POST | `/communication/drafts/{messageId}/revisions` | `communication.draft` | `DraftController.revise` | `back/src/communication/draft.controller.ts:63` |
| GET | `/communication/inbound` | `read` | `InboundController.list` | `back/src/communication/inbound.controller.ts:42` |
| POST | `/communication/inbound/{messageId}/extraction/retry` | `extraction.retry` | `InboundController.retry` | `back/src/communication/inbound.controller.ts:52` |
| POST | `/communication/drafts/{messageId}/send` | `communication.send` | `SendController.send` | `back/src/communication/send.controller.ts:31` |

## Truth(사실)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/truth/facts` | `read` | `TruthController.facts` | `back/src/truth/truth.controller.ts:43` |
| POST | `/truth/events/{eventId}/revoke` | `truth.review` | `TruthController.revoke` | `back/src/truth/truth.controller.ts:55` |
| POST | `/truth/facts/manual` | `truth.manual_entry` | `TruthController.enter` | `back/src/truth/truth.controller.ts:72` |
| POST | `/truth/events/{eventId}/confirm` | `truth.review` | `TruthController.confirm` | `back/src/truth/truth.controller.ts:88` |
| POST | `/truth/events/{eventId}/reject` | `truth.review` | `TruthController.reject` | `back/src/truth/truth.controller.ts:105` |
| POST | `/truth/events/{eventId}/correct` | `truth.review` | `TruthController.correct` | `back/src/truth/truth.controller.ts:122` |

## Agent 실행

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/agent-runs` | `read` | `AgentRunsController.list` | `back/src/agent-tools/agent-runs.controller.ts:31` |
| GET | `/agent-runs/runtime` | `read` | `AgentRunsController.runtime` | `back/src/agent-tools/agent-runs.controller.ts:40` |
| POST | `/agent-runs` | `agent_run.manage` | `AgentRunsController.create` | `back/src/agent-tools/agent-runs.controller.ts:48` |
| GET | `/agent-runs/{agentRunId}` | `read` | `AgentRunsController.get` | `back/src/agent-tools/agent-runs.controller.ts:68` |
| POST | `/agent-runs/{agentRunId}/start` | `agent_run.manage` | `AgentRunsController.start` | `back/src/agent-tools/agent-runs.controller.ts:77` |
| POST | `/agent-runs/{agentRunId}/resume` | `agent_run.manage` | `AgentRunsController.resume` | `back/src/agent-tools/agent-runs.controller.ts:88` |
| POST | `/agent-runs/{agentRunId}/cancel` | `agent_run.manage` | `AgentRunsController.cancel` | `back/src/agent-tools/agent-runs.controller.ts:100` |
| POST | `/agent-runs/{agentRunId}/contact-selection` | `contact.select` | `AgentRunsController.selectContact` | `back/src/agent-tools/agent-runs.controller.ts:112` |

## Planning(실행 · 운영 입력 · 운영 기준 계획 · 비용 · 계획 · 후속)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/planning/runs` | `read` | `PlanningRunController.list` | `back/src/communication/draft.controller.ts:88` |
| GET | `/planning/plans/{planId}/follow-ups` | `read` | `PlanFollowUpController.list` | `back/src/planning/follow-up.controller.ts:22` |
| POST | `/planning/plans/{planId}/follow-ups` | `communication.draft` | `PlanFollowUpController.create` | `back/src/planning/follow-up.controller.ts:31` |
| POST | `/planning/plans/{planId}/follow-ups/contact-selection` | `contact.select` | `PlanFollowUpController.selectContact` | `back/src/planning/follow-up.controller.ts:42` |
| POST | `/planning/runs` | `planning.input` | `PlanningInputController.createRun` | `back/src/planning/planning-input.controller.ts:153` |
| POST | `/planning/inputs/containers` | `planning.input` | `PlanningInputController.importBaselineContainers` | `back/src/planning/planning-input.controller.ts:166` |
| GET | `/planning/inputs/containers` | `read` | `PlanningInputController.baselineContainers` | `back/src/planning/planning-input.controller.ts:180` |
| POST | `/planning/runs/{runId}/inputs/containers` | `planning.input` | `PlanningInputController.importContainers` | `back/src/planning/planning-input.controller.ts:187` |
| GET | `/planning/runs/{runId}/inputs/containers` | `read` | `PlanningInputController.containers` | `back/src/planning/planning-input.controller.ts:203` |
| POST | `/planning/inputs/rates` | `planning.input` | `PlanningInputController.importRates` | `back/src/planning/planning-input.controller.ts:212` |
| GET | `/planning/inputs/rates` | `read` | `PlanningInputController.rates` | `back/src/planning/planning-input.controller.ts:226` |
| POST | `/planning/inputs/facility-profiles` | `planning.input` | `PlanningInputController.importProfiles` | `back/src/planning/planning-input.controller.ts:234` |
| GET | `/planning/inputs/facility-profiles` | `read` | `PlanningInputController.profiles` | `back/src/planning/planning-input.controller.ts:245` |
| GET | `/planning/inputs/batches/{batchId}` | `read` | `PlanningInputController.batch` | `back/src/planning/planning-input.controller.ts:252` |
| GET | `/planning/runs/{runId}/costs` | `read` | `PlanningController.costs` | `back/src/planning/planning.controller.ts:41` |
| GET | `/planning/runs/{runId}/input-readiness` | `read` | `PlanningController.readiness` | `back/src/planning/planning.controller.ts:66` |
| GET | `/planning/runs/{runId}/plans` | `read` | `PlanningController.list` | `back/src/planning/planning.controller.ts:75` |
| POST | `/planning/runs/{runId}/plans` | `plan.recalculate` | `PlanningController.propose` | `back/src/planning/planning.controller.ts:87` |
| GET | `/planning/plans/{planId}` | `read` | `PlanningController.get` | `back/src/planning/planning.controller.ts:102` |
| POST | `/planning/plans/{planId}/approve` | `plan.approve` | `PlanningController.approve` | `back/src/planning/planning.controller.ts:112` |

## Exceptions(운영 예외 탐지 — T-132)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/exceptions` | `read` | `ExceptionController.list` | `back/src/detection/exception.controller.ts:16` |
| GET | `/exceptions/{exceptionId}` | `read` | `ExceptionController.get` | `back/src/detection/exception.controller.ts:22` |
| POST | `/exceptions/detect` | `plan.recalculate` | `ExceptionController.detect` | `back/src/detection/exception.controller.ts:29` |

## Ops(운영 시스템 상태 — T-133)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/ops/system-status` | `system.monitor` | `OpsController.systemStatus` | `back/src/ops/ops.controller.ts:16` |

## Public Data(공공데이터)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/public-data/status` | `read` | `PublicDataController.status` | `back/src/public-data/public-data.controller.ts:65` |
| POST | `/public-data/vessel-calls/fetch` | `public_data.fetch` | `PublicDataController.fetchVesselCalls` | `back/src/public-data/public-data.controller.ts:73` |
| POST | `/public-data/vessel-calls/{vesselCallId}/manifest/fetch` | `public_data.fetch` | `PublicDataController.fetchManifest` | `back/src/public-data/public-data.controller.ts:90` |
| GET | `/public-data/vessel-calls` | `read` | `PublicDataController.listVesselCalls` | `back/src/public-data/public-data.controller.ts:105` |
| GET | `/public-data/vessel-calls/{vesselCallId}` | `read` | `PublicDataController.vesselCall` | `back/src/public-data/public-data.controller.ts:114` |
| GET | `/public-data/fetches` | `read` | `PublicDataController.fetches` | `back/src/public-data/public-data.controller.ts:124` |

## Demo 도우미(/dev/demo — local · test · 포트폴리오에서만)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/dev/demo/status` | `PUBLIC` | `DemoController.status` | `back/src/dev/demo.controller.ts:57` |
| POST | `/dev/demo/mock-reply` | `communication.draft` | `DemoController.mockReply` | `back/src/dev/demo.controller.ts:107` |

## Internal — Agent Runtime 전용(서비스 토큰)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| PUT | `/internal/agent-runtime/runs/{agentRunId}/checkpoints` | `PUBLIC` | `AgentRuntimeController.put` | `back/src/agent-tools/agent-runtime.controller.ts:22` |
| POST | `/internal/agent-runtime/runs/{agentRunId}/checkpoint-writes` | `PUBLIC` | `AgentRuntimeController.writes` | `back/src/agent-tools/agent-runtime.controller.ts:32` |
| GET | `/internal/agent-runtime/runs/{agentRunId}/checkpoints` | `PUBLIC` | `AgentRuntimeController.list` | `back/src/agent-tools/agent-runtime.controller.ts:42` |
| POST | `/internal/agent-runtime/runs/{agentRunId}/steps` | `PUBLIC` | `AgentRuntimeController.steps` | `back/src/agent-tools/agent-runtime.controller.ts:55` |
| GET | `/internal/agent-tools` | `PUBLIC` | `AgentToolsController.catalog` | `back/src/agent-tools/agent-tools.controller.ts:43` |
| POST | `/internal/agent-tools/{tool}` | `PUBLIC` | `AgentToolsController.call` | `back/src/agent-tools/agent-tools.controller.ts:52` |

