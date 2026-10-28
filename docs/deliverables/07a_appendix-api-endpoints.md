# 부록 B. API 엔드포인트 전체 목록 (자동 생성)

> 상태: **자동 생성 — 손으로 고치지 않는다.** 원천 = `back/src/**/*.controller.ts` 의 `@Controller` · `@Get/@Post/...` · `@RequirePermission` · `@Public` 데코레이터(2026-10-28, HEAD `5881529`). 업무 설명은 [07 인터페이스 · API 연계 설계서](07_interface-api.md).
> 권한 열: `PUBLIC` = 사람 로그인 Guard 를 건너뜀(상태 확인 · 로그인 · 데모 입구 · **서비스 토큰을 컨트롤러가 따로 검사하는 Internal 경로**). `read` = 선언 없는 GET 의 기본 권한. 역할별 권한은 `back/src/auth/permissions.ts`.
> 화면은 이 경로를 `/backend` 접두사로 부른다(nginx · Vite 프록시). 브라우저가 부르는 쪽은 Internal 을 뺀 경로뿐이다(공개 배포는 `/backend/internal/*` 404).

합계: 77 경로(사람 · 화면용 71 · Internal 6)

## Health

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/health/live` | `PUBLIC` | `HealthController.live` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\health\health.controller.ts:34` |
| GET | `/health` | `PUBLIC` | `HealthController.check` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\health\health.controller.ts:40` |

## Auth · Demo session

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | `PUBLIC` | `AuthController.login` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\auth\auth.controller.ts:28` |
| POST | `/auth/logout` | `PUBLIC` | `AuthController.logout` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\auth\auth.controller.ts:43` |
| GET | `/auth/me` | `read` | `AuthController.me` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\auth\auth.controller.ts:51` |
| GET | `/auth/demo-session` | `PUBLIC` | `DemoSessionController.info` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\auth\auth.controller.ts:97` |
| POST | `/auth/demo-session` | `PUBLIC` | `DemoSessionController.start` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\auth\auth.controller.ts:109` |

## 사용자 관리

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/admin/users` | `users.manage` | `AdminUsersController.list` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\auth\auth.controller.ts:64` |
| POST | `/admin/users` | `users.manage` | `AdminUsersController.create` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\auth\auth.controller.ts:70` |
| PATCH | `/admin/users/{userId}` | `users.manage` | `AdminUsersController.update` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\auth\auth.controller.ts:76` |

## Registry(거래처 · 연락처 · 시설)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/registry/counterparties` | `read` | `RegistryController.listCounterparties` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:18` |
| GET | `/registry/facilities` | `read` | `RegistryController.listFacilities` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:25` |
| PATCH | `/registry/facilities/{facilityId}/operator` | `registry.manage` | `RegistryController.setFacilityOperator` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:33` |
| POST | `/registry/counterparties` | `registry.manage` | `RegistryController.createCounterparty` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:49` |
| POST | `/registry/counterparties/{counterpartyId}/contacts` | `registry.manage` | `RegistryController.createContact` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:63` |
| POST | `/registry/addresses/{addressId}/approve` | `registry.manage` | `RegistryController.approveAddress` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:79` |
| PATCH | `/registry/addresses/{addressId}/status` | `registry.manage` | `RegistryController.setAddressStatus` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:94` |
| POST | `/registry/addresses/{addressId}/reject` | `registry.manage` | `RegistryController.rejectAddress` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:109` |
| PATCH | `/registry/contacts/{contactId}` | `registry.manage` | `RegistryController.setContactActive` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:124` |
| GET | `/registry/addresses/{addressId}/eligibility` | `read` | `RegistryController.getEligibility` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\registry\registry.controller.ts:137` |

## Communication(초안 · 승인 · 발송 · 수신 · 추출)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/communication/approvers` | `read` | `ApprovalController.approvers` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\approval.controller.ts:38` |
| POST | `/communication/drafts/{messageId}/approve` | `communication.approve` | `ApprovalController.approve` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\approval.controller.ts:46` |
| POST | `/communication/drafts/{messageId}/reject` | `communication.approve` | `ApprovalController.reject` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\approval.controller.ts:69` |
| POST | `/communication/approvals/{approvalId}/revoke` | `communication.approve` | `ApprovalController.revoke` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\approval.controller.ts:85` |
| POST | `/communication/drafts` | `communication.draft` | `DraftController.create` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\draft.controller.ts:32` |
| GET | `/communication/drafts` | `read` | `DraftController.list` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\draft.controller.ts:45` |
| GET | `/communication/drafts/{messageId}` | `read` | `DraftController.get` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\draft.controller.ts:52` |
| POST | `/communication/drafts/{messageId}/revisions` | `communication.draft` | `DraftController.revise` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\draft.controller.ts:63` |
| GET | `/communication/inbound` | `read` | `InboundController.list` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\inbound.controller.ts:42` |
| POST | `/communication/inbound/{messageId}/extraction/retry` | `extraction.retry` | `InboundController.retry` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\inbound.controller.ts:52` |
| POST | `/communication/drafts/{messageId}/send` | `communication.send` | `SendController.send` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\send.controller.ts:31` |

## Truth(사실)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/truth/facts` | `read` | `TruthController.facts` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\truth\truth.controller.ts:43` |
| POST | `/truth/events/{eventId}/revoke` | `truth.review` | `TruthController.revoke` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\truth\truth.controller.ts:55` |
| POST | `/truth/facts/manual` | `truth.manual_entry` | `TruthController.enter` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\truth\truth.controller.ts:72` |
| POST | `/truth/events/{eventId}/confirm` | `truth.review` | `TruthController.confirm` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\truth\truth.controller.ts:88` |
| POST | `/truth/events/{eventId}/reject` | `truth.review` | `TruthController.reject` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\truth\truth.controller.ts:105` |
| POST | `/truth/events/{eventId}/correct` | `truth.review` | `TruthController.correct` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\truth\truth.controller.ts:122` |

## Agent 실행

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/agent-runs` | `read` | `AgentRunsController.list` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runs.controller.ts:31` |
| GET | `/agent-runs/runtime` | `read` | `AgentRunsController.runtime` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runs.controller.ts:40` |
| POST | `/agent-runs` | `agent_run.manage` | `AgentRunsController.create` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runs.controller.ts:48` |
| GET | `/agent-runs/{agentRunId}` | `read` | `AgentRunsController.get` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runs.controller.ts:68` |
| POST | `/agent-runs/{agentRunId}/start` | `agent_run.manage` | `AgentRunsController.start` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runs.controller.ts:77` |
| POST | `/agent-runs/{agentRunId}/resume` | `agent_run.manage` | `AgentRunsController.resume` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runs.controller.ts:88` |
| POST | `/agent-runs/{agentRunId}/cancel` | `agent_run.manage` | `AgentRunsController.cancel` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runs.controller.ts:100` |
| POST | `/agent-runs/{agentRunId}/contact-selection` | `contact.select` | `AgentRunsController.selectContact` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runs.controller.ts:112` |

## Planning(실행 · 운영 입력 · 비용 · 계획 · 후속)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/planning/runs` | `read` | `PlanningRunController.list` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\communication\draft.controller.ts:88` |
| GET | `/planning/plans/{planId}/follow-ups` | `read` | `PlanFollowUpController.list` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\follow-up.controller.ts:22` |
| POST | `/planning/plans/{planId}/follow-ups` | `communication.draft` | `PlanFollowUpController.create` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\follow-up.controller.ts:31` |
| POST | `/planning/plans/{planId}/follow-ups/contact-selection` | `contact.select` | `PlanFollowUpController.selectContact` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\follow-up.controller.ts:42` |
| POST | `/planning/runs` | `planning.input` | `PlanningInputController.createRun` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning-input.controller.ts:153` |
| POST | `/planning/runs/{runId}/inputs/containers` | `planning.input` | `PlanningInputController.importContainers` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning-input.controller.ts:166` |
| GET | `/planning/runs/{runId}/inputs/containers` | `read` | `PlanningInputController.containers` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning-input.controller.ts:182` |
| POST | `/planning/inputs/rates` | `planning.input` | `PlanningInputController.importRates` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning-input.controller.ts:191` |
| GET | `/planning/inputs/rates` | `read` | `PlanningInputController.rates` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning-input.controller.ts:205` |
| POST | `/planning/inputs/facility-profiles` | `planning.input` | `PlanningInputController.importProfiles` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning-input.controller.ts:213` |
| GET | `/planning/inputs/facility-profiles` | `read` | `PlanningInputController.profiles` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning-input.controller.ts:224` |
| GET | `/planning/inputs/batches/{batchId}` | `read` | `PlanningInputController.batch` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning-input.controller.ts:231` |
| GET | `/planning/runs/{runId}/costs` | `read` | `PlanningController.costs` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning.controller.ts:41` |
| GET | `/planning/runs/{runId}/input-readiness` | `read` | `PlanningController.readiness` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning.controller.ts:66` |
| GET | `/planning/runs/{runId}/plans` | `read` | `PlanningController.list` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning.controller.ts:75` |
| POST | `/planning/runs/{runId}/plans` | `plan.recalculate` | `PlanningController.propose` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning.controller.ts:87` |
| GET | `/planning/plans/{planId}` | `read` | `PlanningController.get` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning.controller.ts:102` |
| POST | `/planning/plans/{planId}/approve` | `plan.approve` | `PlanningController.approve` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\planning\planning.controller.ts:112` |

## Public Data(공공데이터)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/public-data/status` | `read` | `PublicDataController.status` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\public-data\public-data.controller.ts:65` |
| POST | `/public-data/vessel-calls/fetch` | `public_data.fetch` | `PublicDataController.fetchVesselCalls` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\public-data\public-data.controller.ts:73` |
| POST | `/public-data/vessel-calls/{vesselCallId}/manifest/fetch` | `public_data.fetch` | `PublicDataController.fetchManifest` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\public-data\public-data.controller.ts:90` |
| GET | `/public-data/vessel-calls` | `read` | `PublicDataController.listVesselCalls` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\public-data\public-data.controller.ts:105` |
| GET | `/public-data/vessel-calls/{vesselCallId}` | `read` | `PublicDataController.vesselCall` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\public-data\public-data.controller.ts:114` |
| GET | `/public-data/fetches` | `read` | `PublicDataController.fetches` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\public-data\public-data.controller.ts:124` |

## Demo 도우미(/dev/demo — local · test · 포트폴리오에서만)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| GET | `/dev/demo/status` | `PUBLIC` | `DemoController.status` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\dev\demo.controller.ts:57` |
| POST | `/dev/demo/mock-reply` | `communication.draft` | `DemoController.mockReply` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\dev\demo.controller.ts:97` |

## Internal — Agent Runtime 전용(서비스 토큰)

| Method | Path | 권한 | Handler | 위치 |
| --- | --- | --- | --- | --- |
| PUT | `/internal/agent-runtime/runs/{agentRunId}/checkpoints` | `PUBLIC` | `AgentRuntimeController.put` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runtime.controller.ts:22` |
| POST | `/internal/agent-runtime/runs/{agentRunId}/checkpoint-writes` | `PUBLIC` | `AgentRuntimeController.writes` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runtime.controller.ts:32` |
| GET | `/internal/agent-runtime/runs/{agentRunId}/checkpoints` | `PUBLIC` | `AgentRuntimeController.list` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runtime.controller.ts:42` |
| POST | `/internal/agent-runtime/runs/{agentRunId}/steps` | `PUBLIC` | `AgentRuntimeController.steps` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-runtime.controller.ts:55` |
| GET | `/internal/agent-tools` | `PUBLIC` | `AgentToolsController.catalog` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-tools.controller.ts:43` |
| POST | `/internal/agent-tools/{tool}` | `PUBLIC` | `AgentToolsController.call` | `C:/Users/PC/Desktop/workspace/container_exception/back/src\agent-tools\agent-tools.controller.ts:52` |

