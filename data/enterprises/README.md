# 가상 기업 데이터 팩 (T-144 Hybrid Live E2E)

실제 고객사 데이터 없이 CERA 를 실제 서비스에 가깝게 검증하기 위한 **합성 기업 데이터**다. 실제 기업 · 시설 · 요율이 아니다(이름에 "(가상)").

| 팩 | 기업 | 구성 |
| --- | --- | --- |
| `cera-logistics/` | CERA Logistics (가상) — 기업 A | 창고 2 · ODCY 1 · 협력 운송사 · 자사 · 협력 트럭 풀 · 담당자 3 · 요율 28 · 운영 계획 24대 |
| `sfb-small/` | SFB 소형물류 (가상) — 기업 B(소형) | 창고 1 · ODCY 1 · 협력 운송사(자사 트럭 없음) · 요율 15 · 운영 계획 10대 |

## 원칙

- **업무 로직은 기업을 모른다.** 팩은 기존 API 로만 들어간다(등록부 · 시설 · 트럭 풀 · 시설 계획 정보 · 요율 · 운영 기준 계획 · 사람 직접 입력 사실). Truth · 예외 탐지 · Agent · Cost/Risk · Solver · 계획에 기업 이름이나 코드를 넣지 않는다
- **실제인 것은 공공데이터뿐이다.** 실제 입항 신고(Port-MIS)를 고르고, 그 적하목록 컨테이너 번호를 실행 때 골라 운영 계획에 붙인다. 번호는 이 폴더 · 저장소에 남기지 않는다
- **비밀 · 주소는 저장소에 없다.** 연락처 주소는 팩의 `address_env` 가 가리키는 환경변수, 로그인 비밀번호는 `CERA_SEED_ADMIN_PASSWORD` · `CERA_SEED_OPERATOR_PASSWORD`
- 정책 · 요율 숫자는 합성값이다. CERA 정책 가정값(허용 오차 60분 · 검증 위험 벌점 30,000원 · 신선도 24h/72h)은 여전히 [ASSUMPTION]

## 형식(`enterprise-pack/1`)

`enterprise.json` — `counterparties` · `contacts`(주소 = 환경변수 이름) · `facilities` · `truck_pools` · `profiles_csv` · `rates_csv` · `terminal_code` · `carrier_code` · `plan.groups`(목적지 · 규격별 대수 · 출발 시각 · LFD 오프셋 · 우선) · `initial_facts`(수용량 · 트럭 가용, `day_offset` = 계획일 기준 며칠 뒤). CSV 는 `POST /planning/inputs/facility-profiles` · `/planning/inputs/rates` 형식 그대로.

## 적재

깨끗한 DB(migration · `npm run db:bootstrap`)와 떠 있는 API 가 필요하다. 실제 입항 신고 · 적하목록을 먼저 받는다.

```bash
# back 폴더 — 운영자 세션으로 POST /public-data/vessel-calls/fetch → .../manifest/fetch 를 먼저
npx tsx src/dev/hybrid-enterprise.ts --pack ../data/enterprises/cera-logistics --vessel-call <vessel_call_id> [--plan-day YYYY-MM-DD] [--out <json>]
```

- 같은 이름의 트럭 풀이 있으면 멈춘다(깨끗한 DB 전제). 등록부 목록은 연락처가 있는 거래처만 보여 주므로 로더는 거래처를 만들고 곧바로 연락처를 붙인다
- 수용량을 바꿀 때는 새 직접 입력이 아니라 **정정**(`POST /truth/events/:id/correct`)을 쓴다 — 같은 사실의 두 사람 값은 충돌로 남는다

결과 기록: `docs/24` 18.31.
