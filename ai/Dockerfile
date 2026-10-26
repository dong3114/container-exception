# CERA AI Server / Agent Runtime / 평가 CLI — 한 이미지, 명령만 다르다(compose 의 ai · eval).
# 빌드 맥락 = 저장소 루트(Agent Runtime 이 packages/contracts/agent-tools 의 Backend 생성 계약 파일을 읽는다 — 코드가 ai/ 의 3단계 위에서 찾는다).
#   docker build -f ai/Dockerfile .      (compose 가 이 맥락으로 부른다. 제외 목록 = ai/Dockerfile.dockerignore)
# 평가 데이터(evals/)와 녹화(fixtures/)가 이미지에 들어 있다. 평가 결과 폴더는 compose 가 붙인다.
# eval extra(anthropic · openai · google-genai SDK)까지 설치한다: 공급자를 .env 만 바꿔 고른다. 로컬 모델(local)은 SDK 가 필요 없다.
FROM python:3.12-slim
WORKDIR /srv/ai
ENV PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 PIP_NO_CACHE_DIR=1
COPY ai/pyproject.toml ./
COPY ai/cera_ai ./cera_ai
RUN pip install -e ".[eval]"
COPY ai/ ./
COPY packages/contracts /srv/packages/contracts
EXPOSE 8100
CMD ["python", "-m", "cera_ai"]
