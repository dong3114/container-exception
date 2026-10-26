#!/usr/bin/env bash
# 작은 모델부터 큰 모델 순서로 같은 평가를 돌린다(T-099 로컬 소형 모델 비교). 저장소 루트에서:
#   bash infra/local/eval-ladder.sh [케이스 수, 기본 5] [모델 이름 ...]      # 이름을 주면 그 모델만(예: qwen2.5-1.5b-instruct-q4_k_m)
#   CERA_COMPOSE_EXTRA=infra/local/compose.gpu.yaml bash infra/local/eval-ladder.sh 5     # GPU 로
# 모델마다 llm 컨테이너를 그 모델로 다시 띄우고, 준비되면 평가를 돌린 뒤 결과를 ai/evals/runs/ 에 남긴다.
# 첫 실행은 모델을 내려받는다. 느리거나 메모리가 모자라 실패하면 그 단계에서 멈추고 이유를 출력한다 — 위 단계는 이미 결과가 남아 있다.
# 5건 → 20건 → (가치가 있을 때만) 전체 순서로 올린다. 이 스크립트는 한 번에 한 크기만 돌린다 — 탈락 판단은 사람이 결과를 보고 한다.
#
# 모델 정보 (Hugging Face API 로 2026-10-26 확인, 파일 크기는 Q4_K_M 기준):
#   이름                               저장소:양자화                                       크기      라이선스            상업 사용
#   qwen2.5-0.5b-instruct-q4_k_m      Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M             0.49GB   Apache-2.0         가능
#   qwen2.5-1.5b-instruct-q4_k_m      Qwen/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M             1.12GB   Apache-2.0         가능
#   qwen2.5-3b-instruct-q4_k_m        Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M               2.10GB   Qwen Research      **불가** — 연구·평가 전용(LICENSE 에 "Non-Commercial = research or evaluation purposes only"). 비교용으로만
#   qwen3-4b-instruct-2507-q4_k_m     unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M         2.50GB   Apache-2.0         가능 (3B 의 상업 사용 가능한 대체. 사고 모드 없는 Instruct-2507, 비공식 변환 저장소)
#   qwen2.5-7b-instruct-q4_k_m        Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M               4.68GB   Apache-2.0         가능 (파일 2개로 분할 — llama.cpp 가 함께 읽는다)
set -euo pipefail
LIMIT="${1:-5}"
shift || true
PICK=("$@")
DC=(docker compose -f infra/local/compose.yaml --env-file infra/local/.env --profile llm --profile eval)
[ -n "${CERA_COMPOSE_EXTRA:-}" ] && DC=(docker compose -f infra/local/compose.yaml -f "$CERA_COMPOSE_EXTRA" --env-file infra/local/.env --profile llm --profile eval)
LADDER=(
  "Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M qwen2.5-0.5b-instruct-q4_k_m"
  "Qwen/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M qwen2.5-1.5b-instruct-q4_k_m"
  "Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M qwen2.5-3b-instruct-q4_k_m"
  "unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M qwen3-4b-instruct-2507-q4_k_m"
  "Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M qwen2.5-7b-instruct-q4_k_m"
)
for step in "${LADDER[@]}"; do
  hf="${step% *}"; name="${step#* }"
  if [ ${#PICK[@]} -gt 0 ] && [[ ! " ${PICK[*]} " =~ " $name " ]]; then continue; fi
  echo "== $name ($hf)"
  CERA_LLM_HF="$hf" "${DC[@]}" up -d --force-recreate --wait --wait-timeout 1200 llm
  echo "   RAM(llm 컨테이너): $("${DC[@]}" ps -q llm | xargs docker stats --no-stream --format '{{.MemUsage}}')"
  command -v nvidia-smi >/dev/null && echo "   VRAM(GPU 전체 사용량): $(nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader)"
  # 컨테이너 경로(/srv/...)를 인자로 넘기지 않는다: Windows Git Bash 가 C:/Program Files/Git/... 로 바꿔 결과가 컨테이너 안에 갇힌다
  "${DC[@]}" run --rm eval extract \
    --dataset cera-reply-eval-v1 --provider local --model "$name" --limit "$LIMIT" --concurrency 1 --run-id "ladder-$name-n$LIMIT"
done
"${DC[@]}" stop llm
