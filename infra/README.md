# infra/ — 배포 구성 영역

**현재 구현 전.** Dockerfile, docker-compose, 클라우드 설정은 아직 없다.

앞으로 둘 것: 서비스별 Docker Image 구성(front / back / ai), 로컬 실행용 compose, 클라우드 배포, 리버스 프록시, 환경변수 템플릿(`.env.example`).

원칙: 하나의 Monorepo에서 서비스별 이미지로 나눠 배포한다(ADR-024). 비밀정보는 저장소에 두지 않는다(`docs/01_project-rules.md` 6절).
