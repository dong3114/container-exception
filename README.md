# CERA — Container Exception Recovery Agent

> **CERA는 수입 컨테이너 물류의 예외 상황에서 정보 수집, 외부 커뮤니케이션, 사실 검증, 비용 · 제약 최적화, 승인과 후속 조치까지 연결하는 Human-in-the-loop 복구 의사결정 시스템입니다.**

CERA 는 System of Record(기록 시스템)가 아니라 **System of Decision / Action Layer** 다. 핵심 질문은 "컨테이너가 어디 있나?"가 아니라 **"지금 무엇을 믿을 수 있고, 무엇을 해야 총손실이 가장 작은가?"** 이다.

## 무엇을 해결하나

수입 컨테이너 운영의 사실은 공공 API · 메일 · 계약서 · 현장 담당자에게 흩어져 있다. 창고가 갑자기 받을 수 있는 물량을 줄이면(예: 20대 → 8대) 담당자는 운송사 · 보세창고(ODCY) · 창고에 일일이 묻고, 답을 모아 손으로 재배치를 계산하고, 상황이 또 바뀌면 처음부터 다시 한다.

CERA 의 흐름:

1. 예외가 생기면 계획에 **어떤 정보가 필요한지** 확인한다
2. 정보가 부족하면 **담당 업체를 찾아 문의 초안**을 만들고, **사람 승인 뒤에** 연락한다
3. 답장이 오면 AI 가 읽어 **후보**를 만들고, Backend 의 결정론 검증을 통과한 것만 **임시 사실**이 된다. 확실하지 않으면 사람이 확인한다
4. 확정된 사실로 **비용과 운영 제약을 계산**하고, **Solver(HiGHS MIP)** 가 최소 손실 복구 계획을 제안한다
5. 사람이 계획을 **승인**하면 후속 요청 초안을 만든다
6. 상황이 바뀌면 기존 계획을 **무효화하고 다시 계산**한다. 이미 보낸 요청은 지우지 않고 **정정 · 취소 요청을 새로 만들어** 사람 승인 뒤 보낸다

## 핵심 원칙

- **숫자는 결정론 엔진에서만** — LLM 은 비용 · 배정 · 상태를 정하지 않는다. LLM 출력은 언제나 후보다
- **외부 행동은 사람 승인 뒤에만** — 문의 · 정정 · 취소 · 계획 승인 모두 사람이 한다. Agent 는 권한 주체가 아니다
- **Mock · Simulated · Real 을 구분** — 시나리오 · 합성 값은 화면과 데이터에 그렇게 표시한다
- **fail-closed** — AI 가 확신하지 못한 값은 반영하지 않고 사람 검토로 넘긴다

## Architecture

```text
Browser ──HTTPS──> Caddy ──> nginx(정적 화면 + /backend 프록시)
                                   │
                                   ▼
                     Main Backend (NestJS · TypeScript)  ← 권한 · 업무 사실 · 결정론 엔진(Cost · Risk · Solver) · 승인 · 감사 · Outbox
                       │        │            │
                       │        │            └── Worker(발송 · 수신 · 추출 · Agent 재조정)
                       │        └── Redis(실행 큐 — 빠른 전달만, 멈춰도 PostgreSQL 폴링)
                       └── PostgreSQL(업무 정본 · append-only 기록 · DB 트리거 방어)
                     Python AI Server(FastAPI + LangGraph Agent Runtime) ← Backend 만 부른다. 부작용은 Backend typed Tool 로만
```

- 브라우저는 Backend 만 부른다. AI Server · DB · Redis 는 내부망에만 있다
- 정본 문서: `docs/` (색인 `docs/README.md`, 결정 `docs/14_decisions.md`)

## Tech Stack

| 영역 | 기술 |
| --- | --- |
| Frontend | Vite · React · TypeScript (CSR SPA) |
| Backend | Node.js 22 · NestJS · Drizzle ORM · PostgreSQL 18 · Redis 7 |
| Optimization | HiGHS MIP Solver · 결정론 Cost / Risk Engine |
| AI | Python 3.12 · FastAPI · LangGraph · 공급자 추상화(녹화 재생 · Gemini · OpenAI · 로컬 모델) |
| 외부 통신 | Gmail API(OAuth 2.0) · Mock 채널 |
| 배포 | Docker Compose · Caddy(HTTPS) · nginx |

## 공개 데모(Portfolio Demo)

공개 링크는 **안전한 체험 환경**이다(`infra/portfolio`, ADR-039). 방문자는 [데모 시작] 으로 데모 방문자 세션을 받아 핵심 흐름(예외 → Agent → 문의 초안 승인 → Mock 회신 → AI 추출 · 검증 → 사실 → Solver 계획 → 승인 → 사실 변경 → 재계획 → 정정 · 취소)을 직접 눌러 볼 수 있다. 첫 단계의 예외(창고 수용량 부족)는 사람이 만든 것이 아니라 **CERA 의 결정론 예외 탐지기가 합성 데이터에서 스스로 찾아 복구 실행을 만든 것**이다(T-132 — 실행 목록의 [자동 탐지] 배지).

| 이 데모에서 | 상태 |
| --- | --- |
| 외부 메일 | **Mock** — 실제로 전송되지 않는다(실제 Gmail 채널은 설정 단계에서 꺼지고 API 도 거부) |
| 기업 내부 운영 데이터 · 업체 · 담당자 | **합성 데이터**(`*.invalid` 주소) |
| AI 추출 | **녹화 재생** — 상용 LLM 을 호출하지 않는다(방문자가 비용을 만들 수 없다) |
| 관리자 기능 · 실제 운영 입력(CSV) · 등록부 변경 · 공공데이터 조회 | 데모 방문자 역할에는 없다(Backend 가 403) |
| 공유 환경 | 여러 방문자가 같은 상태를 본다. 한동안 조작이 없으면 처음 상태로 초기화된다 |

## 실제 검증 범위

| 구분 | 내용 |
| --- | --- |
| **실제로 검증됨(별도 환경)** | Gmail API 실제 왕복(발송 · 실제 회신 · 원문 보존 · Agent 재개) · 상용 LLM(Gemini) 추출 smoke 1건(추출 → 결정론 검증 → 후보 → 임시 사실) · 로그인 · 역할 권한 · PostgreSQL 영속 · Redis 장애 대체 · 프로세스 재시작 뒤 Agent 재개 · 새 설치 · 백업/복원 · 운영 입력 기반 실제 계획 · Solver · 재계획 · 정정 / 취소 · 브라우저 E2E · 창고 수용량 부족 자동 탐지 → 복구 실행 자동 생성(로컬 Private Staging, 시나리오 팩 없이 운영 기준 계획 + 수용량 사실 — 재시작 · Redis 정지에도 중복 없음) |
| **실제 데이터** | 연결된 공공데이터(선박 입항 · 적하목록, data.go.kr) — 공개 데모에서는 꺼 둔다 |
| **합성 데이터** | 기업 내부 컨테이너 운영 데이터 · 계약 요율 · 시설 / 트럭 운영 데이터 · 업체와 담당자 |
| **아직 미확인** | 상용 LLM 의 실제 업무 회신 대량 처리 · 최종 모델 선정 · 실제 고객 TMS / WMS / FMS 연동 · 창고 수용량 부족 외 예외 유형의 자동 탐지 |

"실제 부산항 기업 데이터를 최적화했다", "완전 자동으로 외부 지시를 보낸다"는 사실이 아니다.

## Local Run

Node 22 · Python 3.12 · Docker.

```bash
# 시연 스택(로컬, 합성 시나리오) — 정본: infra/README.md
cp infra/local/.env.example infra/local/.env      # 값 채우기
docker compose -p cera-demo -f infra/local/compose.yaml -f infra/local/compose.demo.yaml --env-file infra/local/.env --profile app --profile web up -d --build --wait
docker compose -p cera-demo -f infra/local/compose.yaml -f infra/local/compose.demo.yaml --env-file infra/local/.env --profile app run --rm migrate npm run db:seed
# → http://127.0.0.1:3000  (/ 운영 콘솔 · /demo 단계별 체험)

# 시험
cd back && npm test            # unit + DB(로컬 PostgreSQL)
cd ai && python -m pytest -q
cd front/web && npm test
```

공개 포트폴리오 배포: `infra/portfolio/README.md`(배포 · migration · 재시작 · 로그 · 상태 · 백업 · 복원 · 데모 초기화 · 키 교체).

Private Staging(실제 Gmail · 상용 LLM · 공공데이터 · 실제 운영 입력 — 비공개): `infra/staging/README.md`. 관리자 · 운영자는 운영 콘솔에서 화물 예외와 함께 CERA 자체 상태(Worker · Redis · AI · Gmail · 대기 작업)를 한 화면에서 본다(T-133). 같은 코드 · 다른 설정 · 다른 데이터(ADR-040). 공개 데모와 DB · Redis · ContentStore · 세션을 공유하지 않는다.

## Security Boundary

- 인터넷에 열리는 것은 HTTPS 프록시 하나. PostgreSQL · Redis · AI Server 는 외부 경로가 없는 내부망
- 세션 = HttpOnly · Secure · SameSite=Strict 쿠키(토큰은 DB 에 지문만). 변경 요청은 Origin 검사(CSRF 2차 방어). CORS 를 열지 않는다(같은 출처)
- 권한은 Backend Guard 가 강제 — 화면이 버튼을 숨기는 것은 편의일 뿐이다. 선언 없는 변경 경로는 거부
- 공개 데모: Gmail · 실제 수신자 · 공공데이터 · 상용 LLM 설정이면 기동 거부 · 실제 채널 발송 요청 403 · IP 별 요청 한도와 하루 Agent 실행 한도
- 비밀값은 환경변수로만. 화면 번들이 읽는 환경변수는 비밀이 아닌 두 개뿐(시험이 검사). 오류 응답은 `code · message · request_id` 만(스택 · SQL · 경로 없음)

## Known Limitations

- 공개 데모는 **공유 상태**다 — 방문자별 격리(멀티테넌시)는 없다. 한가할 때 자동 초기화로 되돌린다
- 공개 데모의 AI 추출은 녹화 재생이라 정해진 답장 문장만 값을 얻는다(그 밖의 문장은 사람 검토 경로)
- 상용 LLM 공급자 · 모델의 최종 선정은 연속 평가 대상이다(ADR-037)
- 고객 TMS / WMS / FMS · 배차 시스템 연동은 대상이 정해지면 붙인다
- 화면은 데스크톱 우선(모바일 레이아웃은 범위 밖)

## Development Workflow

여러 AI 도구를 역할별로 쓰되 인수인계는 Git 안의 문서로 한다: `AGENTS.md`(규칙) · `docs/tasks/CURRENT.md`(현재) · `docs/tasks/QUEUE.md`(예정) · `docs/tasks/LOG.md`(기록). 상세 `docs/17_ai-development-workflow.md`. 전체 규칙 `docs/01_project-rules.md`.
