# infra/ — 배포 구성 영역

**로컬 개발용 PostgreSQL 만 있다**(`infra/local/` — T-085 U0). 배포용 Dockerfile · 클라우드 설정은 아직 없다.

- `infra/local/compose.yaml`: PostgreSQL **18.6**(판 고정), 호스트 `127.0.0.1:55442`(루프백만 — 외부에 열지 않는다). 실행 명령은 `AGENTS.md` 6절
- `infra/local/postgres-init/01-roles.sh`: 최초 초기화 때 역할 `cera_owner`(migration 소유) · `cera_app`(실행 앱)과 DB `cera` · `cera_test` 를 만든다(`docs/24` 12.2). 표 권한은 U1 migration 이 준다
- `infra/local/.env.example` → `.env`(커밋 금지): 로컬 전용 비밀번호

앞으로 둘 것: 서비스별 Docker Image 구성(front / back. `ai/` 는 Python 전용 요구로 별도 서비스가 될 때만 따로 — `docs/23` 11절), 로컬 실행용 compose, 클라우드 배포, 리버스 프록시, 환경변수 템플릿(`.env.example`).

원칙: 하나의 Monorepo에서 서비스별 이미지로 나눠 배포한다(ADR-024). 비밀정보는 저장소에 두지 않는다(`docs/01_project-rules.md` 6절). 로그 저장소·관측 제품은 미정이다(Q-67, `docs/23` 4·5절).
