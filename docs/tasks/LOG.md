# 작업 인계 로그

- 새 항목은 **맨 위**에 추가한다. 기존 항목은 수정하지 않는다(append-only).
- 다음 에이전트는 최근 3개 항목을 읽고 시작한다.

## 템플릿

```markdown
## YYYY-MM-DD · T-NNN · 에이전트명
- 상태: 완료 | 중단 | 차단
- 한 일:
  - ...
- 변경 파일:
  - ...
- 검증: 실행한 테스트·확인 방법과 결과
- 남은 일 / 다음 한 걸음:
  - ...
- 큐 변경: 추가·상태변경한 태스크 ID
- 주의사항: 다음 작업자가 알아야 할 것
```

---

## 2026-09-10 · (사용자 지시) git 초기화 · Claude Code (claude-opus-5)
- 상태: 완료 (원격 푸시는 사람 작업 대기)
- 한 일:
  - 커밋 전 민감정보 점검: md 문서(키·토큰·이메일 패턴 없음), 원본 기획서 DOCX(본문이 PDF와 동일, 메타데이터 작성자 `python-docx`), PDF(작성자 `python-docx`, 생성기 LibreOffice) → 개인정보·비밀정보 없음
  - `git init -b main`, 로컬 user.name/user.email 설정(저장소 로컬 한정), `.gitignore` 추가, 첫 커밋
- 변경 파일: `.gitignore`(신규), `docs/tasks/QUEUE.md`(T-003에서 git init 항목 완료 표시), `docs/tasks/LOG.md`
- 검증: `git status`, `git log`로 커밋 작성자 확인
- 남은 일 / 다음 한 걸음:
  - 사람: GitHub에 private 저장소 생성 → remote 연결 → 해당 계정으로 인증 후 push
- 큐 변경: 없음 (T-003 범위 일부 선행)
- 주의사항: 이 PC의 Git Credential Manager에는 다른 GitHub 계정이 저장돼 있다. remote URL에 사용자명을 넣어(`https://<user>@github.com/...`) 계정을 구분할 것.

## 2026-09-10 · T-000 · Claude Code (claude-opus-5)
- 상태: 완료
- 한 일:
  - 원본 기획서 `Container_Exception_Recovery_Agent_V0.1_Claude_Review.pdf`(13쪽)를 읽고 문서 체계 초안을 만듦
  - 공공데이터포털·웹에서 공공 API 확인
    - `관세청_화물통관진행정보`(15126268): 존재, XML, 개발 자동승인/운영 심의승인, UNI-PASS 가입 필요, 3년 이내 조회
    - 기획서의 해수부 링크(dataset/15011649)는 404. `해양수산부_외항화물컨테이너정보`(15131742)를 대체 후보로 찾음(필드: 항만명, 입항년도, 호출부호, 선박명, 적하목록관리번호, BL번호, MSN, 입출항일시, 반출입구분, 컨테이너번호·규격·사이즈)
    - UNI-PASS 엔드포인트·파라미터·응답 태그는 2차 출처(블로그)에서만 확인 → `[TO VERIFY]`
  - 기획서 내부 불일치 기록: 34대 vs 37대(Q-01), ₩18,720,000 vs ₩18,420,000(Q-02), RequiredHandlingBuffer 누락(Q-06)
  - 기획서에 없던 설계를 제안(ADR Proposed): 상태 = 마일스톤 유도 + 예외 오버레이, 최적화 2단계 분해, 위험 등급 기준, Baseline 정의, 적응형 폴링, Watchlist 온보딩
- 변경 파일: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`, `docs/01_project-rules.md` ~ `docs/10_open-questions.md`, `docs/tasks/QUEUE.md`, `docs/tasks/LOG.md` (모두 신규)
- 검증: 문서 간 교차 참조(태스크 ID, ADR 번호, 질문 ID)를 수동 확인. 코드 없음.
- 남은 일 / 다음 한 걸음:
  - 사람: T-001(검토·ADR 승인), T-002(API 키)
  - 에이전트: T-004(공식 명세·필드 사전) 또는 T-017(인터뷰 가이드)
- 큐 변경: T-001~T-008, T-017, T-029를 큐에 등록. T-000 DONE.
- 주의사항: 모든 문서가 Draft다. 사람 승인 전에는 ADR Proposed 내용을 확정 사실처럼 코드에 굳히지 말 것. 원본 기획서 PDF/DOCX는 루트에 그대로 있음(이동 여부 Q-16). DOCX는 PDF와 같은 내용으로 보고 따로 열어보지 않음.
