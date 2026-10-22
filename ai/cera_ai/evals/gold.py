"""Gold status tools (T-099): blind second annotation agreement and the human review sheet.

The answer key was authored by an AI from the rubric (README.md 1) — it is a draft until a person reviews it.

  agreement  --labels FILE.jsonl     compare an independent, blind annotation (same rubric, no access to the key)
                                     → review/blind-agreement.json (AGREED / CONTESTED per case + differences)
  sheet                              → review/gold-review.csv (Excel): CONTESTED first; a person fills
                                     reviewer_decision = OK | FIX | UNSURE (+ reviewer_note). Re-running keeps those columns.

Agreement between two AI annotations does not replace a person — it only shows where a person should look first.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from .dataset import DATASETS_DIR, EvalCase, load_dataset
from .scoring import normalize_value

DECIDED = ("answer_type", "commitment", "needs_human_review")


def _values(case: EvalCase, items: list[dict[str, Any]], *, required_only: bool) -> dict[str, str | None]:
    kinds = {f["name"]: f["kind"] for f in case.ask["fields"]}
    out: dict[str, str | None] = {}
    for x in items:
        if required_only and x.get("optional"):
            continue
        out[x["field"]] = normalize_value(kinds.get(x["field"], "TEXT"), str(x["value"]))
    return out


def compare(case: EvalCase, blind: dict[str, Any]) -> dict[str, Any]:
    g = case.gold
    diffs: list[str] = []
    gold_req = _values(case, g["extraction"], required_only=True)
    gold_any = _values(case, g["extraction"], required_only=False)
    blind_vals = _values(case, blind.get("extraction") or [], required_only=False)
    for field, value in gold_req.items():
        if blind_vals.get(field) != value:
            diffs.append(f"{field}: key={value} blind={blind_vals.get(field)}")
    for field, value in blind_vals.items():
        if field not in gold_any:
            diffs.append(f"{field}: key=(none) blind={value}")
        elif field not in gold_req and gold_any[field] != value:
            diffs.append(f"{field}: key(optional)={gold_any[field]} blind={value}")
    for k in DECIDED:
        if blind.get(k) != g[k]:
            diffs.append(f"{k}: key={g[k]} blind={blind.get(k)}")
    evidence_differs = [
        x["field"]
        for x in blind.get("extraction") or []
        for gx in g["extraction"]
        if gx["field"] == x["field"] and not any(ev in x.get("evidence", "") or x.get("evidence", "") in ev for ev in gx["evidence"])
    ]
    uncertain = bool(blind.get("uncertain"))
    return {
        "verdict": "CONTESTED" if diffs or uncertain else "AGREED",
        "differences": diffs,
        "blind_uncertain": uncertain,
        "blind_note": blind.get("note") or "",
        "evidence_differs": evidence_differs,
    }


def agreement(dataset: str, labels_path: Path, annotator: str) -> dict[str, Any]:
    ds = load_dataset(dataset)
    blind = {json.loads(line)["case_id"]: json.loads(line) for line in labels_path.read_text(encoding="utf-8").splitlines() if line.strip()}
    cases = {c.case_id: compare(c, blind.get(c.case_id, {"note": "NOT_LABELED", "uncertain": True})) for c in ds.cases}
    counts = {"AGREED": sum(v["verdict"] == "AGREED" for v in cases.values()), "CONTESTED": sum(v["verdict"] == "CONTESTED" for v in cases.values())}
    doc = {
        "method": "blind second annotation with the README rubric; no access to the key. CONTESTED = any difference on a scored item, or the annotator marked the case uncertain",
        "annotator": annotator,
        "dataset_sha256": ds.sha256,
        "counts": counts,
        "cases": cases,
    }
    out = DATASETS_DIR / dataset / "review" / "blind-agreement.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    return doc


SHEET_COLUMNS = [
    "case_id", "gold_tier", "category", "language", "question", "source_text", "key_values", "key_ignored", "key_answer_type",
    "key_commitment", "key_conditional", "key_firm", "key_needs_human_review", "key_review_reasons", "key_note", "blind_differences",
    "blind_note", "reviewer_decision", "reviewer_note",
]


def sheet(dataset: str) -> Path:
    ds = load_dataset(dataset)
    path = DATASETS_DIR / dataset / "review" / "gold-review.csv"
    kept: dict[str, dict[str, str]] = {}
    if path.is_file():
        with path.open(encoding="utf-8-sig", newline="") as fh:
            kept = {r["case_id"]: {"reviewer_decision": r.get("reviewer_decision", ""), "reviewer_note": r.get("reviewer_note", "")} for r in csv.DictReader(fh)}
    agree_path = DATASETS_DIR / dataset / "review" / "blind-agreement.json"
    agree = json.loads(agree_path.read_text(encoding="utf-8"))["cases"] if agree_path.is_file() else {}
    order = {"CONTESTED": 0, "DRAFT": 1, "AGREED": 2}
    rows = []
    for c in sorted(ds.cases, key=lambda c: (order.get(c.gold_tier, 3), c.case_id)):
        g = c.gold
        a = agree.get(c.case_id, {})
        rows.append({
            "case_id": c.case_id,
            "gold_tier": c.gold_tier,
            "category": c.doc["category_name"],
            "language": c.doc["language"],
            "question": c.ask["question"],
            "source_text": c.source_text,
            "key_values": "; ".join(f"{x['field']}={x['value']}{' (optional)' if x['optional'] else ''} ← \"{x['evidence'][0]}\"" for x in g["extraction"]) or "(no value)",
            "key_ignored": "; ".join(g["ignored"]),
            "key_answer_type": g["answer_type"],
            "key_commitment": g["commitment"],
            "key_conditional": g["commitment"] == "CONDITIONAL",
            "key_firm": g["commitment"] == "FIRM",
            "key_needs_human_review": g["needs_human_review"],
            "key_review_reasons": " ".join(g["review_reasons"]),
            "key_note": g["note"],
            "blind_differences": " | ".join(a.get("differences", [])),
            "blind_note": a.get("blind_note", ""),
            **kept.get(c.case_id, {"reviewer_decision": "", "reviewer_note": ""}),
        })
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=SHEET_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path
