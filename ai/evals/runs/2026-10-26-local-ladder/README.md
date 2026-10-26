# 로컬 소형 모델 사다리 (T-099, 2026-10-26)

모델 선정 근거로 남기는 **요약**이다. 원본 출력(`outputs.jsonl` · `per_case.csv`)은 재생성 가능한 일회성 실행이라 커밋하지 않는다(`../.gitignore`). 모델 출처 · 라이선스 · 해시는 `../../local-models.json`.

- 비교표: `report.md` · `report.csv`. 모델별 `metrics.json` · `run.json` 은 하위 폴더.
- 실행: `infra/local/eval-ladder.sh`(Docker, llama.cpp). 0.5B · 1.5B · 3B · 4B-2507 는 GPU(GTX 1650, 4GB), 7B 는 CPU 5건.
- **20건은 데이터셋 앞쪽 범주만이다. 모델 순위를 확정하지 않는다.** AGREED 119건 평가가 아니다.

| 모델 | 판정 |
| --- | --- |
| Qwen2.5-0.5B | LocalProvider 연결 smoke 용. Production 후보 아님, 별도 튜닝 안 함 |
| Qwen2.5-1.5B | 일부 값 추출 능력은 있으나 답 없는 회신에서 값을 만드는 환각이 심각 → 제외 |
| Qwen2.5-3B | 성능 우위 없음 + Qwen Research License(상업 불가) → 연구 기준선으로만 |
| **Qwen3-4B-Instruct-2507** (unsloth GGUF) | 로컬 후보 중 추가 평가 가치가 가장 높음(답 없는 회신 값 생성 0.0). Production 선정 아님 |
| Qwen2.5-7B | 5건 값 정확도는 흥미롭지만 표본이 너무 작고 CPU 41.6초/건은 비현실적 → VRAM 충분한 GPU 에서 재평가 |

현재 결론: **Qwen3-4B 계열을 Local candidate 로 유지하고, 상용 모델 benchmark 이후 전체 평가 여부를 결정한다.**
