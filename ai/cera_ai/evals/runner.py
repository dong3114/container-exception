"""Benchmark runner: one dataset x one provider/model -> a run directory with outputs, metrics and a per-case CSV.

A run directory (``ai/evals/runs/<run_id>/``) holds:
  run.json      what ran (dataset + sha256, task, provider, model, prompt/spec version, counts) — no secrets
  outputs.jsonl per case: the provider output (or error code), latency, usage — the reproducible eval artifact
  metrics.json  aggregated metrics (scoring.py)
  per_case.csv  one row per case for diffing runs
Recorded outputs can be re-scored later without calling the provider (``rescore``). Source texts are synthetic.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ..decision import DECISION_SPEC_VERSION, DecisionOutput
from ..extraction import PROMPT_VERSION, build_prompt
from ..providers import ProviderError
from .dataset import AI_ROOT, DATASET_SCHEMA, Dataset, EvalCase, tier_subsets
from .pricing import estimate_cost
from .scoring import aggregate_decision, aggregate_extraction, derived_review_probability, score_extraction_case

RUNS_DIR = AI_ROOT / "evals" / "runs"


def _slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip("-")


def default_run_id(task: str, provider: str, model: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")  # tooling only — not core logic
    return _slug(f"{stamp}-{task}-{provider}-{model}")


def _call_with_retry(fn: Callable[[], Any], attempts: int = 3) -> tuple[Any, int]:
    for attempt in range(attempts):
        started = time.monotonic()
        try:
            return fn(), int((time.monotonic() - started) * 1000)
        except ProviderError as error:
            if not error.retryable or attempt == attempts - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


def _progress(done: int, total: int) -> None:
    if done == total or done % 10 == 0:
        print(f"  {done}/{total}", file=sys.stderr)


def _map(cases: list[EvalCase], work: Callable[[EvalCase], dict[str, Any]], concurrency: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any] | None] = [None] * len(cases)
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        futures = {pool.submit(work, c): i for i, c in enumerate(cases)}
        for done, fut in enumerate(futures, start=1):
            results[futures[fut]] = fut.result()
            _progress(done, len(cases))
    return [r for r in results if r is not None]


# --------------------------------------------------------------------------------------------------- extraction
def run_extraction(ds: Dataset, provider: Any, model: str, concurrency: int = 4) -> list[dict[str, Any]]:
    def work(c: EvalCase) -> dict[str, Any]:
        request = c.extraction_request()
        if hasattr(provider, "for_case"):
            provider.for_case(c.case_id)
        try:
            result, latency = _call_with_retry(lambda: provider.extract(request, build_prompt(request)))
        except ProviderError as error:
            return {"case_id": c.case_id, "error": {"code": error.code, "retryable": error.retryable}}
        usage = result.usage.model_dump() if result.usage else {}
        return {"case_id": c.case_id, "output": result.output.model_dump(mode="json"), "model_version": result.model_version, "latency_ms": latency, "usage": usage}

    return _map(ds.cases, work, concurrency)


def score_extraction_records(ds: Dataset, records: list[dict[str, Any]], model: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    by_id = {r["case_id"]: r for r in records}
    rows, lat, usage = [], [], {"input_tokens": 0, "output_tokens": 0}
    for c in ds.cases:
        rec = by_id.get(c.case_id, {"error": {"code": "NOT_RUN"}})
        rows.append(score_extraction_case(c.doc, rec.get("output"), rec.get("error")))
        if "latency_ms" in rec:
            lat.append(rec["latency_ms"])
        for k in usage:
            usage[k] += int((rec.get("usage") or {}).get(k) or 0)
    cost = estimate_cost(model, usage["input_tokens"], usage["output_tokens"]) if usage["input_tokens"] else None
    metrics = aggregate_extraction(rows, lat, usage, cost)
    keep = ("cases", "case_exact_match", "field_exact_accuracy", "normalized_value_accuracy", "pipeline_field_accuracy", "missing_answer_rate",
            "wrong_value_rate", "question_scope_violation_rate", "hallucinated_field_rate", "evidence_exact_grounding", "bad_values_backend_accepts")
    metrics["by_gold_tier"] = {
        name: {k: v for k, v in aggregate_extraction([r for r in rows if r["case_id"] in ids], [], {}, None).items() if k in keep}
        for name, ids in tier_subsets(ds.cases).items()
        if ids
    }
    for r in rows:
        r["gold_tier"] = next(c.gold_tier for c in ds.cases if c.case_id == r["case_id"])
    return metrics, rows


# ----------------------------------------------------------------------------------------------------- decision
def run_decision(ds: Dataset, provider: Any, concurrency: int = 4) -> list[dict[str, Any]]:
    def work(c: EvalCase) -> dict[str, Any]:
        if hasattr(provider, "for_case"):
            provider.for_case(c.case_id)
        try:
            out, latency = _call_with_retry(lambda: provider.decide(c.decision_input()))
        except ProviderError as error:
            return {"case_id": c.case_id, "error": {"code": error.code, "retryable": error.retryable}}
        return {"case_id": c.case_id, "output": out.to_json(), "latency_ms": latency}

    return _map(ds.cases, work, concurrency)


def score_decision_records(ds: Dataset, records: list[dict[str, Any]], model: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    by_id = {r["case_id"]: r for r in records}
    cases, outputs, errors, lat = [], [], [], []
    usage = {"input_tokens": 0, "output_tokens": 0}
    reported = 0.0
    has_reported = False
    rows = []
    for c in ds.cases:
        rec = by_id.get(c.case_id, {"error": {"code": "NOT_RUN"}})
        out = rec.get("output")
        cases.append(c.doc)
        outputs.append(out)
        errors.append((rec.get("error") or {}).get("code"))
        if "latency_ms" in rec:
            lat.append(rec["latency_ms"])
        u = (out or {}).get("usage") or {}
        for k in usage:
            usage[k] += int(u.get(k) or 0)
        if u.get("reported_cost_usd") is not None:
            reported += float(u["reported_cost_usd"])
            has_reported = True
        g = c.gold
        row = {"case_id": c.case_id, "category": c.doc["category"], "language": c.doc["language"], "error": errors[-1],
               "gold_answer_type": g["answer_type"], "gold_commitment": g["commitment"], "gold_answers_question": g["answers_question"], "gold_review": g["needs_human_review"]}
        if out:
            row.update({
                "pred_answer_type": max(out["answer_type"], key=out["answer_type"].get),
                "pred_commitment": max(out["commitment"], key=out["commitment"].get),
                "p_firm": round(out["commitment"].get("FIRM", 0.0), 4),
                "p_conditional": round(out["commitment"].get("CONDITIONAL", 0.0), 4),
                "p_answers_question": round(out["answers_question"], 4),
                "p_review": round(out["needs_human_review"], 4),
                "p_review_derived": round(derived_review_probability(out), 4),
            })
        rows.append(row)
    cost = reported if has_reported else (estimate_cost(model, usage["input_tokens"], usage["output_tokens"]) if usage["input_tokens"] else None)
    metrics = aggregate_decision(cases, outputs, errors, lat, usage, cost)
    tiers: dict[str, Any] = {}
    for name, ids in tier_subsets(ds.cases).items():
        idx = [i for i, c in enumerate(cases) if c["case_id"] in ids]
        if idx:
            sub = aggregate_decision([cases[i] for i in idx], [outputs[i] for i in idx], [errors[i] for i in idx], [], {}, None)
            tiers[name] = {k: sub.get(k) for k in ("cases", "answer_type", "commitment", "conditional", "firm", "answers_question", "needs_human_review")}
            for k in ("answer_type", "commitment"):
                if isinstance(tiers[name].get(k), dict):
                    tiers[name][k] = {m: tiers[name][k].get(m) for m in ("accuracy", "macro_f1")}
            for k in ("conditional", "firm", "answers_question", "needs_human_review"):
                if isinstance(tiers[name].get(k), dict):
                    tiers[name][k] = {m: tiers[name][k].get(m) for m in ("accuracy_at_0_5", "precision", "recall", "f1", "brier", "ece_10bin")}
    metrics["by_gold_tier"] = tiers
    for row in rows:
        row["gold_tier"] = next(c.gold_tier for c in ds.cases if c.case_id == row["case_id"])
    metrics["cost_source"] = "provider_reported" if has_reported else ("list_price_estimate" if cost is not None else "none (local model)")
    return metrics, rows


# ------------------------------------------------------------------------------------------------------- files
def write_run(run_dir: Path, meta: dict[str, Any], records: list[dict[str, Any]], metrics: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "run.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (run_dir / "outputs.jsonl").open("w", encoding="utf-8", newline="\n") as fh:
        for r in sorted(records, key=lambda r: r["case_id"]):
            fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
    write_scores(run_dir, metrics, rows)


def write_scores(run_dir: Path, metrics: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    (run_dir / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    flat = [{k: (json.dumps(v, ensure_ascii=False) if isinstance(v, dict | list) else v) for k, v in r.items()} for r in rows]
    keys: list[str] = []
    for r in flat:
        keys += [k for k in r if k not in keys]
    with (run_dir / "per_case.csv").open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=keys)
        writer.writeheader()
        writer.writerows(flat)


def read_records(run_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    meta = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    records = [json.loads(line) for line in (run_dir / "outputs.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    return meta, records


def run_meta(ds: Dataset, task: str, provider: str, model: str, records: list[dict[str, Any]], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    versions = {model}
    for r in records:
        mv = r.get("model_version") or (r.get("output") or {}).get("model_version")
        if mv:
            versions.add(mv)
    return {
        "task": task,
        "dataset": ds.name,
        "dataset_sha256": ds.sha256,
        "cases": len(ds.cases),
        "provider": provider,
        "model": model,
        "served_model_versions": sorted(versions),
        "prompt_version": PROMPT_VERSION if task == "extraction" else DECISION_SPEC_VERSION,
        "created_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "real_api_call": provider not in {"replay-run", "null", "prior"} and not provider.startswith("hf-"),
        "eval_version": DATASET_SCHEMA,
        "contract_version": "reply-extract/1" if task == "extraction" else DECISION_SPEC_VERSION,
        "case_ids": [c.case_id for c in ds.cases],
        "gold_tiers": dict(Counter(c.gold_tier for c in ds.cases)),
        **(extra or {}),
    }


def decision_from_record(record: dict[str, Any]) -> DecisionOutput:
    return DecisionOutput.from_json(record["output"])
