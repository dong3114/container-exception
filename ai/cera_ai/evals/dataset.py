"""Eval dataset loading (cera-reply-eval/v1). Datasets live in ``ai/evals/datasets/<name>/cases.jsonl``."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..contracts import ExtractionRequest
from ..decision import DecisionInput

AI_ROOT = Path(__file__).resolve().parents[2]
DATASETS_DIR = AI_ROOT / "evals" / "datasets"
DATASET_SCHEMA = "cera-reply-eval/v1"


@dataclass(frozen=True)
class EvalCase:
    doc: dict[str, Any]

    @property
    def case_id(self) -> str:
        return self.doc["case_id"]

    @property
    def gold(self) -> dict[str, Any]:
        return self.doc["gold"]

    @property
    def source_text(self) -> str:
        return self.doc["source_text"]

    @property
    def ask(self) -> dict[str, Any]:
        return self.doc["ask"]

    def extraction_request(self) -> ExtractionRequest:
        """The same request the Backend would send (reply-extract/1) — no gold inside."""
        return ExtractionRequest.model_validate(
            {
                "schema_version": "reply-extract/1",
                "inbound_message_id": f"eval-{self.case_id}",
                "reference_date": self.doc["reference_date"],
                "counterparty_name": self.doc["counterparty_name"],
                "asks": [self.ask],
                "message_text": self.source_text,
            }
        )

    def decision_input(self) -> DecisionInput:
        window = self.ask.get("window")
        return DecisionInput(
            question=self.ask["question"],
            reply_text=self.source_text,
            reference_date=self.doc["reference_date"],
            asked_date=window["date"] if window else None,
            asked_window=f"{window['from']}-{window['to']}" if window else None,
        )


@dataclass(frozen=True)
class Dataset:
    name: str
    path: Path
    sha256: str
    cases: list[EvalCase]


def dataset_path(name_or_path: str) -> Path:
    candidate = Path(name_or_path)
    if candidate.suffix == ".jsonl" and candidate.exists():
        return candidate
    return DATASETS_DIR / name_or_path / "cases.jsonl"


def load_dataset(name_or_path: str, only: list[str] | None = None, limit: int | None = None) -> Dataset:
    path = dataset_path(name_or_path)
    raw = path.read_bytes()
    cases = []
    for line in raw.decode("utf-8").splitlines():
        if not line.strip():
            continue
        doc = json.loads(line)
        if doc.get("schema") != DATASET_SCHEMA:
            raise ValueError(f"{doc.get('case_id')}: schema must be {DATASET_SCHEMA}")
        cases.append(EvalCase(doc))
    if only:
        wanted = set(only)
        cases = [c for c in cases if c.case_id in wanted or c.doc["category"] in wanted]
    if limit is not None:
        cases = cases[:limit]
    return Dataset(name=path.parent.name, path=path, sha256=hashlib.sha256(raw).hexdigest(), cases=cases)


def validate_dataset(ds: Dataset) -> list[str]:
    """Structural checks; returns problems (empty = ok)."""
    problems: list[str] = []
    seen: set[str] = set()
    for c in ds.cases:
        cid = c.case_id
        if cid in seen:
            problems.append(f"{cid}: duplicate id")
        seen.add(cid)
        try:
            c.extraction_request()
        except Exception as error:  # pydantic.ValidationError
            problems.append(f"{cid}: ask does not fit reply-extract/1 ({type(error).__name__})")
        fields = {f["name"] for f in c.ask["fields"]}
        for x in c.gold["extraction"]:
            if x["field"] not in fields:
                problems.append(f"{cid}: gold field {x['field']} was not asked")
            for ev in x["evidence"]:
                if ev not in c.source_text:
                    problems.append(f"{cid}: gold evidence not in source_text")
        g = c.gold
        if g["answers_question"] != (g["answer_type"] in ("AVAILABLE", "UNAVAILABLE")):
            problems.append(f"{cid}: answers_question inconsistent with answer_type")
        if g["needs_human_review"] != bool(g["review_reasons"]):
            problems.append(f"{cid}: needs_human_review inconsistent with review_reasons")
    return problems
