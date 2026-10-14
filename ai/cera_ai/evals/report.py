"""Compare run directories -> Markdown tables + one CSV (one row per run). Numbers only from metrics.json."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path
from typing import Any

EXTRACTION_COLUMNS = [
    ("case_exact_match", "사례 완전 일치"),
    ("field_exact_accuracy", "칸 정확(문자 그대로)"),
    ("normalized_value_accuracy", "값 정확(정규화)"),
    ("missing_answer_rate", "놓친 답"),
    ("wrong_value_rate", "틀린 값"),
    ("hallucinated_field_rate", "환각 칸"),
    ("question_scope_violation_rate", "질문 범위 위반"),
    ("spurious_values_on_no_answer_cases", "답 없는 회신에 값 생성"),
    ("evidence_exact_grounding", "인용 원문 일치"),
    ("evidence_aligned_with_gold_span", "인용 위치 정답 일치"),
    ("correct_values_backend_accepts", "맞은 값 Backend 통과"),
    ("bad_values_backend_rejects", "틀린 값 Backend 차단"),
    ("schema_failure_rate", "스키마 실패"),
    ("call_failure_rate", "호출 실패"),
    ("latency_ms_p50", "지연 p50(ms)"),
    ("latency_ms_p95", "지연 p95(ms)"),
    ("estimated_cost_usd_per_1k_replies", "비용 $/1천 회신"),
]

DECISION_COLUMNS = [
    ("answer_type.accuracy", "답 유형 정확도"),
    ("answer_type.macro_f1", "답 유형 macro-F1"),
    ("commitment.accuracy", "확정성 정확도"),
    ("commitment.macro_f1", "확정성 macro-F1"),
    ("firm.f1", "확정 F1"),
    ("conditional.f1", "조건부 F1"),
    ("conditional.brier", "조건부 Brier"),
    ("answers_question.f1", "질문에 답함 F1"),
    ("needs_human_review.precision", "검토필요 정밀도"),
    ("needs_human_review.recall", "검토필요 재현율"),
    ("needs_human_review.f1", "검토필요 F1"),
    ("needs_human_review.brier", "검토필요 Brier"),
    ("needs_human_review.brier_skill_vs_base_rate", "Brier skill"),
    ("needs_human_review.ece_10bin", "검토필요 ECE"),
    ("needs_human_review.auroc", "검토필요 AUROC"),
    ("needs_human_review.confident_wrong_ge_0_9", "확신 오답(≥0.9)"),
    ("needs_human_review_derived.f1", "검토(파생) F1"),
    ("needs_human_review_derived.auroc", "검토(파생) AUROC"),
    ("failure_rate", "호출 실패"),
    ("latency_ms_p50", "지연 p50(ms)"),
    ("estimated_cost_usd_per_1k_replies", "비용 $/1천 회신"),
]


def _get(doc: dict[str, Any], dotted: str) -> Any:
    cur: Any = doc
    for part in dotted.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _fmt(v: Any) -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.3f}" if v < 10 else f"{v:,.1f}"
    return str(v)


def build_report(run_dirs: list[Path]) -> tuple[str, str]:
    runs = []
    for d in run_dirs:
        meta = json.loads((d / "run.json").read_text(encoding="utf-8"))
        metrics = json.loads((d / "metrics.json").read_text(encoding="utf-8"))
        runs.append((d, meta, metrics))
    lines = ["# CERA reply eval — run comparison", ""]
    rows_csv: list[dict[str, Any]] = []
    for task, columns in (("extraction", EXTRACTION_COLUMNS), ("decision", DECISION_COLUMNS)):
        chosen = [r for r in runs if r[1]["task"] == task]
        if not chosen:
            continue
        lines += [f"## {task}", "", "| 항목 | " + " | ".join(f"{m['provider']} / {m['model']}" for _, m, _ in chosen) + " |",
                  "|---|" + "---|" * len(chosen)]
        lines.append("| 실제 API 호출 | " + " | ".join("예" if m.get("real_api_call") else "아니오" for _, m, _ in chosen) + " |")
        lines.append("| 사례 수 | " + " | ".join(str(m["cases"]) for _, m, _ in chosen) + " |")
        for key, label in columns:
            lines.append(f"| {label} | " + " | ".join(_fmt(_get(x, key)) for _, _, x in chosen) + " |")
        lines.append("")
        for d, m, x in chosen:
            rows_csv.append({"run": d.name, "task": task, "provider": m["provider"], "model": m["model"], "cases": m["cases"],
                             "real_api_call": m.get("real_api_call"), **{k: _get(x, k) for k, _ in columns}})
    buf = io.StringIO()
    keys: list[str] = []
    for r in rows_csv:
        keys += [k for k in r if k not in keys]
    writer = csv.DictWriter(buf, fieldnames=keys)
    writer.writeheader()
    writer.writerows(rows_csv)
    return "\n".join(lines), buf.getvalue()
