"""T-099 gold status — blind agreement decides AGREED / CONTESTED; a person's review decides the human tiers."""

import csv
import json
from pathlib import Path

from cera_ai.evals.dataset import EvalCase, _apply_review, tier_subsets
from cera_ai.evals.gold import compare

CASE = EvalCase(
    {
        "case_id": "Z01",
        "category": "A",
        "ask": {"ask_id": "Q1", "fields": [{"name": "quantity", "kind": "QUANTITY", "unit": "TRUCK"}, {"name": "available_from", "kind": "TIME", "unit": None}]},
        "source_text": "오후 3시부터 차량 4대 가능합니다.",
        "gold": {
            "extraction": [
                {"field": "quantity", "value": "4", "evidence": ["차량 4대"], "optional": False},
                {"field": "available_from", "value": "15:00", "evidence": ["오후 3시부터"], "optional": True},
            ],
            "answer_type": "AVAILABLE",
            "commitment": "FIRM",
            "needs_human_review": False,
        },
    }
)
BLIND = {"extraction": [{"field": "quantity", "value": "4", "evidence": "4대"}], "answer_type": "AVAILABLE", "commitment": "FIRM", "needs_human_review": False, "uncertain": False}


def test_same_scored_labels_agree_even_with_different_evidence_and_missing_optional():
    out = compare(CASE, BLIND)
    assert out["verdict"] == "AGREED" and out["differences"] == []


def test_any_scored_difference_or_uncertainty_is_contested():
    assert compare(CASE, {**BLIND, "commitment": "CONDITIONAL"})["differences"] == ["commitment: key=FIRM blind=CONDITIONAL"]
    assert compare(CASE, {**BLIND, "extraction": [{"field": "quantity", "value": "3", "evidence": "x"}]})["verdict"] == "CONTESTED"
    assert compare(CASE, {**BLIND, "extraction": [*BLIND["extraction"], {"field": "available_from", "value": "16:00", "evidence": "x"}]})["verdict"] == "CONTESTED"
    assert compare(CASE, {**BLIND, "uncertain": True, "note": "?"})["verdict"] == "CONTESTED"


def test_a_persons_review_wins_over_the_ai_agreement(tmp_path: Path):
    review = tmp_path / "review"
    review.mkdir()
    (review / "blind-agreement.json").write_text(json.dumps({"cases": {"Z01": {"verdict": "AGREED"}, "Z02": {"verdict": "CONTESTED"}, "Z03": {"verdict": "AGREED"}}}), encoding="utf-8")
    with (review / "gold-review.csv").open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["case_id", "reviewer_decision"])
        w.writeheader()
        w.writerows([{"case_id": "Z02", "reviewer_decision": "ok"}, {"case_id": "Z03", "reviewer_decision": "UNSURE"}])
    cases = [EvalCase({"case_id": f"Z0{i}"}) for i in (1, 2, 3, 4)]
    _apply_review(tmp_path, cases)
    assert [c.gold_tier for c in cases] == ["AGREED", "HUMAN_VERIFIED", "HUMAN_DISPUTED", "DRAFT"]
    subsets = tier_subsets(cases)
    assert subsets["agreed_or_human"] == {"Z01", "Z02"} and subsets["human_reviewed"] == {"Z02"} and "Z03" not in subsets["all_draft"]
