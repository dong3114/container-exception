# 10. CERA 화면 정의서 — 1차 초안

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | **DRAFT / NON-FINAL** — 현재 구현된 화면을 정보 구조 · 기능 중심으로 옮긴 1차 초안이다. 사용자가 UI 를 검토하고 추가 개발할 예정이므로 **최종 화면 사양이 아니다** |
| 확정하지 않는 것 | 픽셀 · 색상 · 글꼴 · 최종 컴포넌트 위치 · 모바일 UX · 디자인 시스템 |
| 기준 | HEAD `5881529` · `front/web/src/App.tsx`(경로) · `app/LoginGate.tsx` · `app/PortfolioDemo.tsx` · `app/ops/OpsConsole.tsx` · `components/ops/*` · `app/demo/DemoPage.tsx` · 화면 문구 `components/ops/opsLabels.ts` |
| 관련 문서 | [`docs/16_frontend-prototype.md`](../16_frontend-prototype.md) 13 · 14절 · [03 유스케이스](03_use-cases.md) · [07 API](07_interface-api.md) · [11 용어집](11_glossary.md) |

## 1. 경로와 공통 규칙

| 경로 | 화면 | 로그인 |
| --- | --- | --- |
| `/` | 운영 콘솔(SCR-02~12) | 필요 |
| `/demo` | 단계별 체험(시연 콘솔, SCR-13) | 필요 |
| `/prototype` | 옛 Mock 시나리오 재생 + Backend 초안 · 받은 메일 · 보류함 카드(SCR-14) | 필요 |
| `/dev/api` | Backend 응답 확인(개발용, SCR-15) | 없음(화면 자체) |
| 그 밖 | 운영 콘솔로 | — |

공통: 5초마다 다시 읽기(화면이 안 보이면 건너뜀 · 겹쳐 부르지 않음) · 권한(`/auth/me` 의 `permissions`)으로 버튼을 숨기거나 끔(최종 판정은 Backend 401 · 403) · 오류는 코드를 쉬운 말로 + 펼치면 코드 · HTTP · request id · 상태를 색만으로 나타내지 않음(기호 · 글자 함께) · WebSocket 없음.

## 2. 화면 목록

| ID | 화면 | 상태 |
| --- | --- | --- |
| SCR-01 | 로그인 · 공개 데모 소개 | 구현 |
| SCR-02 | 운영 콘솔 — 상단(상태 · 세션 · 포트폴리오 띠) | 구현 |
| SCR-03 | 지금 해야 할 일 | 구현 |
| SCR-04 | 복구 실행 목록 · 새 실제 실행 | 구현 |
| SCR-05 | 실행 상세 — 개요 | 구현 |
| SCR-06 | 실행 상세 — Agent(+ 연락처 문제 해결) | 구현 |
| SCR-07 | 실행 상세 — 정보 · 사실 | 구현 |
| SCR-08 | 실행 상세 — 연락(+ 답장 검토) | 구현 |
| SCR-09 | 실행 상세 — 복구 계획 | 구현 |
| SCR-10 | 실행 상세 — 변경 · 후속 | 구현 |
| SCR-11 | 실행 상세 — 기록 | 구현 |
| SCR-12 | 실행 상세 — 운영 입력(실제 실행만) | 구현 |
| SCR-13 | 단계별 체험(`/demo`) | 구현 |
| SCR-14 | Mock 재생(`/prototype`) | 구현(옛 화면) |
| SCR-15 | Backend 응답 확인(`/dev/api`) | 구현(개발용) |
| SCR-16 | 사용자 관리 | **없음** [향후] — API 만 있음 |

## 3. 화면 상세

### SCR-01 로그인 · 공개 데모 소개
- 목적: 세션을 만든다 · 공개 배포면 처음 방문자를 데모로 안내
- 접근: 누구나 · 진입: 세션이 없을 때
- 영역: (일반) 아이디 · 비밀번호 · [로그인] / (포트폴리오 모드) 소개 카드(CERA 란 · 흐름 · 기술) · "이 데모에서 무엇이 진짜인가"(검증 범위 · Mock · 합성 · 녹화 재생) · [데모 시작] · 접힌 "관리자 로그인"
- 조회: `GET /auth/me`(401 이면 이 화면) · `GET /auth/demo-session`(있으면 포트폴리오 모드)
- Action: 로그인 → `POST /auth/login` / 데모 시작 → `POST /auth/demo-session` → `/demo`
- Error: 로그인 실패(계정 존재 여부 숨김) · 잠시 막힘 · 데모 준비 안 됨
- 비고: 데모 종료(로그아웃) 시 소개 화면으로 돌아감

### SCR-02 운영 콘솔 상단
- 영역: (포트폴리오) PORTFOLIO DEMO 띠 — 합성 데이터 · 외부 메일 Mock · AI 녹화 재생 · [단계별 체험] · [운영 콘솔] / 세션 줄(이름 · 역할 · 로그아웃 또는 데모 종료) / 시스템 상태("✓ Backend · DB 정상" · "✓ 실행 큐" 또는 "! 실행 큐 없음(폴링으로 동작)" · "! Agent Runtime 응답 없음" · "✕ Backend 연결 안 됨")
- 조회: `GET /health` · `GET /agent-runs/runtime`

### SCR-03 지금 해야 할 일
- 목적: 사람이 할 일을 한곳에(같은 일은 한 번만)
- 영역: 할 일 목록(아이콘 · 제목 · 설명 · [열기])
- 항목 유형(코드 → 화면 문구): `HUMAN_APPROVAL_REQUIRED` "문의 초안 승인이 필요합니다" · `AWAITING_SEND_REQUEST` "승인된 문의의 발송 요청이 필요합니다" · `REPLY_REVIEW_REQUIRED` "답장이 왔지만 AI 가 내용을 확정하지 못했습니다" · `AWAITING_FACT_VERIFICATION` "임시 값의 확인이 필요합니다" · `AWAITING_PLAN_DECISION` "복구 계획 승인이 필요합니다" · `CONTACT_REGISTRATION_REQUIRED` "연락 가능한 담당자가 없습니다" · `CONTACT_SELECTION_REQUIRED` "연락할 담당자를 선택해야 합니다" · `HUMAN_ACTION_REQUIRED` "문의 초안을 고쳐야 합니다" · 후속 담당자 필요
- 조회: `GET /agent-runs` · `GET /communication/drafts` · `GET /communication/inbound` · `GET /planning/runs/{runId}/plans`
- Action: [열기] → 해당 실행 · 탭 · 항목으로
- Empty: 할 일 없음 표시

### SCR-04 복구 실행 목록 · 새 실제 실행
- 영역: 묶음(사람 조치 필요 · 진행 중 · 완료 · 중단/오류) · 실행마다 시뮬레이션 배지 · Agent 상태 · 대기 사유 · 현재 판 / [+ 새 실제 실행] (`planning.input` 만)
- 조회: `GET /planning/runs` · Action: 새 실제 실행 → `POST /planning/runs`

### SCR-05 실행 상세 — 개요
- 영역: 지금 하는 일 · 기다리는 것 · 마지막 작업 · 다음 예상(기록된 단계로만) · 현재 판 요약
- 조회: `GET /agent-runs/{id}` · `GET /planning/runs/{runId}/plans`

### SCR-06 Agent (+ 연락처 문제 해결)
- 영역: Agent 상태 · 대기 사유 쉬운 말 · [Agent 시작] (수량 등 시작 매개변수) · [다시 확인] · [취소] / 연락처 문제 패널:
  - 등록 필요(관리자): 운영 회사 등록 · 담당자 이름 · 주소 · "CERA 밖에서 확인함" · [담당자 등록 · 승인]
  - 선택 필요: 그 회사 담당자만 표시 · 쓸 수 없는 주소(중지 · 퇴사 · 미승인)는 상태와 함께 보이되 선택 불가 · **처음에 아무것도 선택 안 됨** · [이 담당자로 진행]
  - 트럭 풀 소유 운송사: 그 풀에 이미 나간 문의의 받는 회사로 추정(없으면 운송사 목록 + 안내)
- API: `POST /agent-runs` · `/start` · `/resume` · `/cancel` · `/contact-selection` · `/registry/*`
- Error: `WRONG_COUNTERPARTY` · `NOT_WAITING_FOR_CONTACT_SELECTION` 등 쉬운 말

### SCR-07 정보 · 사실
- 영역: 필요한 정보 표(무엇 · 대상 · 상태 · 누구에게 물었나 · 답장 · 지금 값 · 확정) · 사실 목록(값 · 상태 · 출처 · 인용 · 후보) · [확인] · [거절] · [정정] · [철회] · 접힌 "직접 입력"(종류 · 대상 · 날짜 · 시간대 · 값 · 출처 메모)
- 조회: `GET /truth/facts` · 문의 · 준비도 조합(정보 공백 API 는 Agent 전용이라 화면이 다시 조합)
- Action: `POST /truth/events/{id}/confirm|reject|correct|revoke` · `POST /truth/facts/manual`
- 권한: 현장 담당자는 직접 입력만

### SCR-08 연락 (+ 답장 검토)
- 영역: 문의 · [요청] · [정정] · [취소]와 답장을 시간 순서로 · 이전 계획 기준 초안 표시 · 항목을 펼치면 초안 화면(받는 사람 · 내용 · 구조화 값 · 숫자 검사 · Gate · [승인] · [반려] · [발송 요청]) · 답장(원문 미리보기 · 추출 시도 · 실패 이유 · 후보 · [다시 추출]) · 물은 정보가 이미 채워진 답장은 "✓ 처리 완료"
- 조회: `GET /communication/drafts*` · `GET /communication/inbound`
- Action: approve · reject · send · extraction retry
- 권한: 현장 담당자에게 "승인 · 발송은 운영자 · 관리자만" 안내
- Empty: 연락 없음

### SCR-09 복구 계획
- 영역: 입력 준비도(실제 실행 — 빠진 값 필드 단위) · 판 · KPI(총 예상 손실 · 기본 비용 · 기준안 · 절감 · Solver 상태) · 컨테이너별 조치 · OUTDATED 이유("다시 계산해야 합니다") · [지금 사실로 다시 계산] · [이 계획 승인]
- 조회: `GET /planning/runs/{runId}/input-readiness` · `/plans` · `GET /planning/plans/{planId}`
- Action: `POST /planning/runs/{runId}/plans` · `POST /planning/plans/{planId}/approve`
- 비고: 승인은 배차 · 발송 지시가 아님을 화면에 표시

### SCR-10 변경 · 후속
- 영역: 판 비교(컨테이너별 추가 · 빠짐 · 변경 · 같음, KPI 차이, 무효 이유) · 승인된 판의 후속 목록(종류 · 대상 · 수량 · 상태 · 막힌 이유) · [필요한 초안 만들기] · 후속 담당자 선택
- API: `GET /planning/plans/{planId}` · `GET · POST /planning/plans/{planId}/follow-ups` · `.../contact-selection`
- 한계: 후속 목록 조회(GET)에는 막힌 이유가 없어 [필요한 초안 만들기] 뒤에 보임

### SCR-11 기록
- 영역: Agent 단계 · 초안 · 승인 · 발송 · 답장 · AI 읽기 시도 · 계획을 시간 순서로(새 이벤트 시스템 없이 기존 기록 조합)

### SCR-12 운영 입력(실제 실행만)
- 영역: 종류(컨테이너 · 요율 · 시설 계획 정보) · CSV 붙여넣기 · 파일 · [검증만] · 결과 표(행 · 필드 · 이유, "저장 안 됨") · [저장] (오류 0 이고 같은 내용일 때만)
- API: `POST /planning/runs/{runId}/inputs/containers` · `/planning/inputs/rates` · `/planning/inputs/facility-profiles`(`dry_run`)
- 권한: `planning.input`(데모 방문자 · 현장 담당자 없음)

### SCR-13 단계별 체험(`/demo`)
- 목적: 처음 보는 사람이 버튼마다 무엇이 일어나는지 보며 핵심 흐름을 따라감
- 영역: 단계 목차 · 12단계 카드(각 카드 = 예상 결과 + 버튼 + 지금 상태): 1 환경 점검 · 2 예외 발생 · 현장 값 5건 입력 · 3 Agent 시작 · 4 문의 초안 승인 · 5 발송 요청 → Worker 발송 · 6 업체 회신(Mock — 정해진 문장 선택) · 7 AI 추출 → 임시 사실 · 8 복구 계획 v1 · 9 사람 확인 → v2 · 10 사실 변경(ODCY A 4 → 2) → v3 · 11 계획 승인 · 12 후속 문의 초안
- 조회: `GET /dev/demo/status` · `GET /agent-runs/runtime` · 사실 · 계획 · 초안 API
- Action: 위 단계의 API · `POST /dev/demo/mock-reply`
- 비고: 포트폴리오 모드에서는 직접 쓴 회신 문장 칸을 숨김(Backend 도 거부) · 공유 상태라 앞 단계가 이미 "완료"일 수 있음

### SCR-14 Mock 재생(`/prototype`)
- 목적: 초기 프로토타입(합성 시나리오 재생 · KPI · 2D 운영 지도)과 Backend 초안 · 받은 메일 · **보류함** 확인
- 비고: 보류함은 이 화면에만 있음 · 재생 값은 시나리오 값(SIMULATED)

### SCR-15 Backend 응답 확인(`/dev/api`)
- 개발용 — 주요 GET 응답을 그대로 표시

## 4. 다음 검토 때 정할 것 (사용자)

- 디자인 시스템 · 색 · 글꼴 · 배치 · 모바일
- 사용자 관리 화면(SCR-16) · 보류함을 운영 콘솔로 옮길지
- 정보 공백을 화면용 API 로 줄지(현재는 화면이 조합)
- 후속 목록 조회에 막힌 이유를 미리 보일지
- 공개 데모의 진입(지금은 `/demo`)과 운영 콘솔 안내
