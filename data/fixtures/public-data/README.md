# 공공데이터 replay fixture (합성)

`CERA_PUBLIC_DATA_MODE=replay` 일 때 Backend 의 Public Data Adapter(`back/src/public-data/`)가 네트워크 대신 이 파일을 돌려준다.

- **전부 합성이다.** 호출부호(`D7CR0x`) · 선명(`CERA SYNTH …`) · B/L(`SYNBL…`) · 적하목록관리번호(`26SYNT…`) · 컨테이너 번호(소유자 코드 `ZZZ`) · 선석 이름은 지어낸 값이다. 실제 응답 · 실제 B/L · 실제 컨테이너 번호 · 인증키는 저장소에 두지 않는다(`AGENTS.md` 규칙 5).
- XML **모양**만 공식 가이드를 따른다: DS-03 선박운항정보 `FILE_000000007708406` · DS-02 외항화물컨테이너정보 `FILE_000000007709092`(포털 수정 2026-10-06).
- replay 결과는 시뮬레이션이다 — 호출 원장 `mode = REPLAY` · `is_simulated = true` · 사건은 시나리오 `public-data-replay` 에 속한다(규칙 9).
- 실제 응답은 `CERA_PUBLIC_DATA_MODE=live` 로 받고 `data/raw/`(gitignore)에만 남는다. 실제 응답에서 fixture 를 만들 때는 식별자를 반드시 바꾼다.

| 파일 | 데이터셋 | 무엇을 시험하나 |
| --- | --- | --- |
| `ds03/busan-20261020-20261021-p1.xml` | DS-03 | 입항 신고 일시(받은 시각 기준 지난 · 앞) · 신청구분 최초 · 변경 · 최종 · `*` 비표준 계선 시설 코드 · 오프셋 없는 일시(Asia/Seoul 가정) · 컨테이너선 아님 · 키가 빠진 행 |
| `ds02/D7CR01-2026-041-p1.xml` · `p2.xml` | DS-02 | 53행 = 2쪽 · B/L 하나에 컨테이너 여럿 · ISO 규격 5종 · 체크 숫자 불일치 1 · 수입 아닌 줄 1 · 번호 모양 틀림 1 |
| `ds02/D7CR02-2026-017-p1.xml` | DS-02 | 데이터 없음(`00` + 0건 — 실제 응답 모양) |

다시 만들기: `python data/fixtures/public-data/generate.py` (`index.json` 이 조회 조건 → 파일 대응이다).
