"""CLI — ``python -m cera_ai.evals <command>`` (run from ai/).

  validate  --dataset cera-reply-eval-v1
  estimate  --dataset cera-reply-eval-v1 --model claude-haiku-5-5            rough cost before a paid run
  extract   --dataset cera-reply-eval-v1 --provider anthropic|openai|gemini|null|replay-run --model <id> [--from-run DIR]
  decide    --dataset cera-reply-eval-v1 --provider jev|llm-judge:<vendor>|hf-nli|prior|replay-run --model <id> [--from-run DIR]
  rescore   --run DIR                                                         re-score recorded outputs
  report    --runs DIR [DIR ...] [--out FILE.md] [--csv FILE.csv]              compare runs
  gold-agreement --labels FILE.jsonl --annotator NAME                         blind second annotation → review/blind-agreement.json
  gold-sheet                                                                  → review/gold-review.csv (a person fills reviewer_decision)

Common: --cases A01,B,... (ids or categories) · --limit N · --concurrency N · --run-id NAME · --out-dir DIR.
Keys come from the environment only (ANTHROPIC_API_KEY · OPENAI_API_KEY · GEMINI_API_KEY · OPENROUTER_API_KEY).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from ..contracts import ProviderOutput
from ..decision import ANSWER_TYPES, COMMITMENTS, JevDecisionProvider, LlmJudgeDecisionProvider, PriorDecisionProvider, RecordedDecisionProvider
from ..extraction import build_prompt
from ..providers import ProviderError, ProviderResult
from .dataset import load_dataset, validate_dataset
from .pricing import PRICES, estimate_cost
from .runner import (
    RUNS_DIR, default_run_id, read_records, run_decision, run_extraction, run_meta, score_decision_records,
    score_extraction_records, write_run, write_scores,
)


class NullExtractor:
    """Floor: answers nothing. Shows the missing-answer rate a model must beat."""

    name = "null"

    def extract(self, request: Any, prompt: str) -> ProviderResult:  # noqa: ARG002
        return ProviderResult(output=ProviderOutput(outcome="NO_CHANGE"), model_version="null", usage=None)


class RecordedExtractor:
    name = "replay-run"

    def __init__(self, records: dict[str, dict[str, Any]]) -> None:
        self._records = records
        self._current = ""

    def for_case(self, case_id: str) -> RecordedExtractor:
        self._current = case_id
        return self

    def extract(self, request: Any, prompt: str) -> ProviderResult:  # noqa: ARG002
        rec = self._records.get(self._current)
        if rec is None or rec.get("error"):
            raise ProviderError((rec or {}).get("error", {}).get("code", "NO_RECORDING"), "no recorded output", retryable=False)
        return ProviderResult(output=ProviderOutput.model_validate(rec["output"]), model_version=rec.get("model_version", "recorded"), usage=None)


def _cases_arg(value: str | None) -> list[str] | None:
    return [v.strip() for v in value.split(",") if v.strip()] if value else None


def _prior(ds: Any) -> PriorDecisionProvider:
    n = len(ds.cases)
    at = Counter(c.gold["answer_type"] for c in ds.cases)
    cm = Counter(c.gold["commitment"] for c in ds.cases)
    return PriorDecisionProvider(
        {k: at[k] / n for k in ANSWER_TYPES}, {k: cm[k] / n for k in COMMITMENTS},
        sum(c.gold["answers_question"] for c in ds.cases) / n, sum(c.gold["needs_human_review"] for c in ds.cases) / n,
    )


def cmd_validate(args: argparse.Namespace) -> int:
    ds = load_dataset(args.dataset)
    problems = validate_dataset(ds)
    for p in problems:
        print(p)
    print(f"{ds.name}: {len(ds.cases)} cases, sha256 {ds.sha256[:12]}, problems {len(problems)}", file=sys.stderr)
    return 1 if problems else 0


def cmd_estimate(args: argparse.Namespace) -> int:
    ds = load_dataset(args.dataset, _cases_arg(args.cases), args.limit)
    # Rough: ~1 token per 1.6 UTF-8 bytes for mixed Korean/JSON prompts; output ~250 tokens/case plus reasoning.
    in_tok = sum(int(len(build_prompt(c.extraction_request()).encode("utf-8")) / 1.6) for c in ds.cases)
    out_tok = 250 * len(ds.cases)
    for model in [args.model] if args.model else sorted(PRICES):
        cost = estimate_cost(model, in_tok, out_tok)
        print(f"{model:28s} ~{in_tok:>8,} in / ~{out_tok:>7,} out tokens -> ~${cost:.4f} (x3 for reasoning headroom: ${cost * 3:.4f})" if cost is not None else f"{model}: no price")
    return 0


def _run_dir(args: argparse.Namespace, task: str, provider: str, model: str) -> Path:
    return Path(args.out_dir) / (args.run_id or default_run_id(task, provider, model))


def cmd_extract(args: argparse.Namespace) -> int:
    ds = load_dataset(args.dataset, _cases_arg(args.cases), args.limit)
    if args.provider == "null":
        provider: Any = NullExtractor()
    elif args.provider == "replay-run":
        _, records = read_records(Path(args.from_run))
        provider = RecordedExtractor({r["case_id"]: r for r in records})
        args.concurrency = 1
    else:
        from ..llm_adapters import make_provider

        provider = make_provider(args.provider, args.model)
    records = run_extraction(ds, provider, args.model, args.concurrency)
    metrics, rows = score_extraction_records(ds, records, args.model)
    run_dir = _run_dir(args, "extraction", args.provider, args.model)
    write_run(run_dir, run_meta(ds, "extraction", args.provider, args.model, records), records, metrics, rows)
    _print_summary(run_dir, metrics)
    return 0


def cmd_decide(args: argparse.Namespace) -> int:
    ds = load_dataset(args.dataset, _cases_arg(args.cases), args.limit)
    if args.provider == "jev":
        provider: Any = JevDecisionProvider(args.model)
    elif args.provider.startswith("llm-judge:"):
        provider = LlmJudgeDecisionProvider(args.provider.split(":", 1)[1], args.model)
    elif args.provider == "hf-nli":
        from ..decision import NliDecisionProvider

        provider = NliDecisionProvider(args.model)
        args.concurrency = 1
    elif args.provider == "prior":
        provider = _prior(load_dataset(args.dataset))
    elif args.provider == "replay-run":
        _, records = read_records(Path(args.from_run))
        provider = RecordedDecisionProvider({r["case_id"]: r for r in records}, "replay-run")
        args.concurrency = 1
    else:
        print(f"unknown decision provider {args.provider}", file=sys.stderr)
        return 2
    records = run_decision(ds, provider, args.concurrency)
    metrics, rows = score_decision_records(ds, records, args.model)
    run_dir = _run_dir(args, "decision", args.provider, args.model)
    write_run(run_dir, run_meta(ds, "decision", args.provider, args.model, records), records, metrics, rows)
    _print_summary(run_dir, metrics)
    return 0


def cmd_rescore(args: argparse.Namespace) -> int:
    run_dir = Path(args.run)
    meta, records = read_records(run_dir)
    ds = load_dataset(meta["dataset"], [r["case_id"] for r in records])
    if ds.sha256 != meta["dataset_sha256"]:
        print("note: dataset changed since this run — scores use the current labels", file=sys.stderr)
    score = score_extraction_records if meta["task"] == "extraction" else score_decision_records
    metrics, rows = score(ds, records, meta["model"])
    write_scores(run_dir, metrics, rows)
    _print_summary(run_dir, metrics)
    return 0


def _print_summary(run_dir: Path, metrics: dict[str, Any]) -> None:
    keys = [k for k, v in metrics.items() if not isinstance(v, dict | list)]
    print(f"run: {run_dir}")
    for k in keys:
        print(f"  {k}: {metrics[k]}")
    for k in ("answer_type", "commitment"):
        if k in metrics:
            print(f"  {k}: accuracy {metrics[k]['accuracy']} macro_f1 {metrics[k]['macro_f1']}")
    for k in ("firm", "conditional", "answers_question", "needs_human_review", "needs_human_review_derived"):
        if k in metrics and metrics[k]:
            m = metrics[k]
            print(f"  {k}: acc {m['accuracy_at_0_5']} f1 {m['f1']} brier {m['brier']} ece {m['ece_10bin']} auroc {m['auroc']}")


def cmd_report(args: argparse.Namespace) -> int:
    from .report import build_report

    text, csv_text = build_report([Path(p) for p in args.runs])
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8", newline="\n")
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(text)
    if args.csv:
        Path(args.csv).write_text(csv_text, encoding="utf-8-sig", newline="")
    return 0


def cmd_gold_agreement(args: argparse.Namespace) -> int:
    from .gold import agreement

    doc = agreement(args.dataset, Path(args.labels), args.annotator)
    print(json.dumps(doc["counts"]), file=sys.stderr)
    return 0


def cmd_gold_sheet(args: argparse.Namespace) -> int:
    from .gold import sheet

    print(sheet(args.dataset), file=sys.stderr)
    return 0


def load_local_env(path: Path) -> None:
    """KEY=VALUE lines from ai/.env (gitignored) for keys not already set. Values are never printed."""
    if not path.is_file():
        return
    import os

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() and value.strip() and not os.environ.get(key.strip()):
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


def main(argv: list[str] | None = None) -> int:
    from .dataset import AI_ROOT

    load_local_env(AI_ROOT / ".env")
    parser = argparse.ArgumentParser(prog="python -m cera_ai.evals")
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--dataset", default="cera-reply-eval-v1")
        p.add_argument("--cases")
        p.add_argument("--limit", type=int)

    p = sub.add_parser("validate"); common(p); p.set_defaults(fn=cmd_validate)
    p = sub.add_parser("estimate"); common(p); p.add_argument("--model"); p.set_defaults(fn=cmd_estimate)
    for name, fn in (("extract", cmd_extract), ("decide", cmd_decide)):
        p = sub.add_parser(name); common(p)
        p.add_argument("--provider", required=True)
        p.add_argument("--model", default="none")
        p.add_argument("--from-run")
        p.add_argument("--concurrency", type=int, default=4)
        p.add_argument("--run-id")
        p.add_argument("--out-dir", default=str(RUNS_DIR))
        p.set_defaults(fn=fn)
    p = sub.add_parser("rescore"); p.add_argument("--run", required=True); p.set_defaults(fn=cmd_rescore)
    p = sub.add_parser("gold-agreement"); p.add_argument("--dataset", default="cera-reply-eval-v1"); p.add_argument("--labels", required=True)
    p.add_argument("--annotator", required=True); p.set_defaults(fn=cmd_gold_agreement)
    p = sub.add_parser("gold-sheet"); p.add_argument("--dataset", default="cera-reply-eval-v1"); p.set_defaults(fn=cmd_gold_sheet)
    p = sub.add_parser("report"); p.add_argument("--runs", nargs="+", required=True); p.add_argument("--out"); p.add_argument("--csv"); p.set_defaults(fn=cmd_report)
    args = parser.parse_args(argv)
    return int(args.fn(args))


if __name__ == "__main__":
    raise SystemExit(main())
