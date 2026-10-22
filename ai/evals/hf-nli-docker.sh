#!/usr/bin/env bash
# HF zero-shot NLI decision baselines (T-099) inside a Linux container — Windows App Control blocks scipy DLLs on the host,
# so the baseline runs in Docker instead of working around that policy. CPU only; no API key.
#
# From the repository root:
#   docker run --rm -v "$PWD/ai:/ai:ro" -v "$PWD/ai/evals/runs/local:/out" -v cera-hf-cache:/root/.cache \
#     -e PYTHONIOENCODING=utf-8 -e HF_HUB_DISABLE_TELEMETRY=1 python:3.12-slim bash /ai/evals/hf-nli-docker.sh
# Model weights stay in the docker volume (cera-hf-cache) — never in the repository. Results: run.json · outputs.jsonl · metrics.json · per_case.csv
set -euo pipefail
pip install -q --root-user-action=ignore torch --index-url https://download.pytorch.org/whl/cpu
pip install -q --root-user-action=ignore "transformers>=4.45,<5" sentencepiece protobuf
pip install -q --root-user-action=ignore "fastapi>=0.115" "pydantic>=2.9" "uvicorn>=0.30" "httpx>=0.27" "langgraph==1.2.11" "langgraph-checkpoint==4.2.0"
cp -r /ai /tmp/ai
cd /tmp/ai
# bge-m3-zeroshot-v2.0-c: MIT, commercially friendly training data. mDeBERTa-…-2mil7: research comparison only (non-commercial ANLI in training data)
for m in MoritzLaurer/bge-m3-zeroshot-v2.0-c MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7; do
  id="t099-decision-hf-$(echo "$m" | tr '/' '_' | tr 'A-Z' 'a-z')"
  python -m cera_ai.evals decide --provider hf-nli --model "$m" --run-id "$id" --out-dir /out
done
