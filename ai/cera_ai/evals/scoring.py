"""Scoring for extraction and decision runs. Metrics stay separate — no single "roughly right" score.

``backend_checks`` is a **port** of ``back/src/communication/extraction-rules.ts`` (validateAnswers) used only to report
how many model answers the current Backend validator would accept or reject. The TypeScript module stays the authority;
``tests/test_evals.py`` pins the port on known cases.
"""

from __future__ import annotations

import math
import re
import statistics
from collections import Counter, defaultdict
from typing import Any

from ..decision import ANSWER_TYPES, COMMITMENTS

# ------------------------------------------------------------------------------------ Backend validator (port)
_KOREAN_NUMBERS = {"한": 1, "하나": 1, "두": 2, "둘": 2, "세": 3, "셋": 3, "네": 4, "넷": 4, "다섯": 5, "여섯": 6, "일곱": 7, "여덟": 8, "아홉": 9, "열": 10}
_FORMAT = {"QUANTITY": re.compile(r"^\d{1,6}$"), "TIME": re.compile(r"^([01]\d|2[0-3]):[0-5]\d$"), "MONEY": re.compile(r"^\d{1,12}$")}


def _quantity_in_quote(value: str, quote: str) -> bool:
    n = int(value)
    if re.search(rf"(^|[^0-9]){n}([^0-9]|$)", quote.replace(",", "")):
        return True
    return any(num == n and re.search(rf"{word}\s*(대|개|명|칸|TEU|teu)", quote) for word, num in _KOREAN_NUMBERS.items())


def _time_in_quote(value: str, quote: str) -> bool:
    h, m = (int(p) for p in value.split(":"))
    if value in quote:
        return True

    def minute_ok(text: str) -> bool:
        return m == 0 or bool(re.search(rf"{m}\s*분", text)) or (m == 30 and "반" in text)

    if re.search(rf"(^|[^0-9]){h}\s*시", quote) and minute_ok(quote):
        return True
    h12 = h - 12 if h > 12 else h
    meridiem = "오후" if h >= 12 else "오전"
    return bool(re.search(rf"{meridiem}\s*{h12}\s*시", quote)) and minute_ok(quote)


def backend_checks(ask: dict[str, Any], source_text: str, answers: list[dict[str, Any]], ambiguity_flags: list[str]) -> list[dict[str, Any]]:
    """Per answer: {passed, failed:[codes]} — same checks and order as validateAnswers (incl. CONSISTENCY)."""
    fields = {f["name"]: f for f in ask["fields"]}
    out = []
    for a in answers:
        failed: list[str] = []
        field = fields.get(a["field"]) if a["ask_id"] == ask["ask_id"] else None
        if a["ask_id"] != ask["ask_id"]:
            failed.append("UNKNOWN_ASK")
        elif field is None:
            failed.append("FIELD_NOT_ASKED")
        quote = a["evidence"]["quote"]
        if quote not in source_text:
            failed.append("QUOTE_NOT_IN_SOURCE")
        if field:
            fmt = _FORMAT[field["kind"]]
            format_ok = bool(fmt.match(a["value"]))
            if not format_ok:
                failed.append(f"BAD_{field['kind']}")
            if (a.get("unit") or None) != (field.get("unit") or None):
                failed.append("UNIT_MISMATCH")
            in_quote = format_ok and (_time_in_quote(a["value"], quote) if field["kind"] == "TIME" else _quantity_in_quote(a["value"], quote))
            if not in_quote:
                failed.append("VALUE_NOT_IN_QUOTE")
        out.append({"field": a["field"], "value": a["value"], "failed": failed})
    groups: dict[str, set[str]] = defaultdict(set)
    for a, r in zip(answers, out, strict=True):
        if not r["failed"]:
            groups[f"{a['ask_id']}|{a['field']}"].add(a["value"])
    for a, r in zip(answers, out, strict=True):
        if not r["failed"] and len(groups[f"{a['ask_id']}|{a['field']}"]) > 1:
            r["failed"].append("CONFLICTING_CANDIDATES")
    for r in out:
        r["passed"] = not r["failed"]
    return out


# ------------------------------------------------------------------------------------------------ normalization
def normalize_value(kind: str, value: str) -> str | None:
    v = value.strip()
    if kind == "QUANTITY":
        digits = re.findall(r"\d+", v.replace(",", ""))
        return str(int(digits[0])) if len(digits) == 1 else None
    if kind == "TIME":
        mt = re.match(r"^(\d{1,2}):(\d{2})(?::\d{2})?$", v)
        return f"{int(mt.group(1)):02d}:{mt.group(2)}" if mt else None
    return v


def _span_overlaps(source: str, quote: str, gold_quotes: list[str]) -> bool:
    at = source.find(quote)
    if at < 0:
        return False
    q = (at, at + len(quote))
    for g in gold_quotes:
        start = 0
        while (gi := source.find(g, start)) >= 0:
            if q[0] < gi + len(g) and gi < q[1]:
                return True
            start = gi + 1
    return False


# --------------------------------------------------------------------------------------------- extraction scoring
def score_extraction_case(case: dict[str, Any], output: dict[str, Any] | None, error: dict[str, Any] | None) -> dict[str, Any]:
    gold = case["gold"]["extraction"]
    ask = case["ask"]
    kinds = {f["name"]: f["kind"] for f in ask["fields"]}
    source = case["source_text"]
    r: dict[str, Any] = {
        "case_id": case["case_id"], "category": case["category"], "language": case["language"],
        "error": (error or {}).get("code"), "required": 0, "correct_exact": 0, "correct_norm": 0, "wrong": 0, "missing": 0,
        "predictions": 0, "scope_violations": 0, "hallucinated": 0, "grounded": 0,
        "correct_aligned": 0, "correct_backend_pass": 0, "wrong_backend_reject": 0, "spurious": 0,
        "per_field": {}, "case_exact": False,
    }
    required = [g for g in gold if not g["optional"]]
    r["required"] = len(required)
    if error is not None or output is None:
        r["missing"] = len(required)
        for g in required:
            r["per_field"][g["field"]] = "MISSING"
        return r
    answers = output.get("answers", [])
    checks = backend_checks(ask, source, answers, output.get("ambiguity_flags", []))
    by_field: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    gold_by_field = {g["field"]: g for g in gold}
    r["predictions"] = len(answers)
    for a, chk in zip(answers, checks, strict=True):
        if a["evidence"]["quote"] in source:
            r["grounded"] += 1
        in_scope = a["ask_id"] == ask["ask_id"] and a["field"] in kinds
        if not in_scope:
            r["scope_violations"] += 1
            continue
        if a["field"] not in gold_by_field:
            r["hallucinated"] += 1
            if not required:
                r["spurious"] += 1
            if not chk["passed"]:
                r["wrong_backend_reject"] += 1
            continue
        by_field[a["field"]].append((a, chk))
    for g in gold:
        preds = by_field.get(g["field"], [])
        kind = kinds[g["field"]]
        if not preds:
            if not g["optional"]:
                r["missing"] += 1
                r["per_field"][g["field"]] = "MISSING"
            continue
        values = {normalize_value(kind, a["value"]) for a, _ in preds}
        exact = len(preds) == 1 and preds[0][0]["value"] == g["value"]
        norm_ok = values == {g["value"]}
        if norm_ok:
            if not g["optional"]:
                r["correct_norm"] += 1
                r["correct_exact"] += int(exact)
            a, chk = preds[0]
            r["correct_aligned"] += int(_span_overlaps(source, a["evidence"]["quote"], g["evidence"]))
            r["correct_backend_pass"] += int(all(c["passed"] for _, c in preds))
            r["per_field"][g["field"]] = "CORRECT" if exact else "CORRECT_NORMALIZED"
        else:
            r["wrong"] += 1
            r["wrong_backend_reject"] += int(not all(c["passed"] for _, c in preds))
            r["per_field"][g["field"]] = "WRONG"
    r["case_exact"] = (
        r["scope_violations"] == 0 and r["hallucinated"] == 0 and r["wrong"] == 0 and r["missing"] == 0
        and r["correct_exact"] == r["required"]
    )
    return r


def _rate(n: float, d: float) -> float | None:
    return round(n / d, 4) if d else None


def aggregate_extraction(rows: list[dict[str, Any]], latencies: list[int], usage: dict[str, int], cost_usd: float | None) -> dict[str, Any]:
    tot = Counter()
    for r in rows:
        for k in ("required", "correct_exact", "correct_norm", "wrong", "missing", "predictions", "scope_violations", "hallucinated",
                  "grounded", "correct_aligned", "correct_backend_pass", "wrong_backend_reject", "spurious"):
            tot[k] += r[k]
    n = len(rows)
    errors = Counter(r["error"] for r in rows if r["error"])
    schema_fail = sum(v for k, v in errors.items() if k.startswith("PROVIDER_OUTPUT"))
    in_scope_preds = tot["predictions"] - tot["scope_violations"]
    correct_total = sum(1 for r in rows for v in r["per_field"].values() if v.startswith("CORRECT"))
    wrong_or_halluc = tot["wrong"] + tot["hallucinated"]
    per_field: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        for f, v in r["per_field"].items():
            per_field[f][v] += 1
    by_cat: dict[str, list[bool]] = defaultdict(list)
    by_lang: dict[str, list[bool]] = defaultdict(list)
    for r in rows:
        by_cat[r["category"]].append(r["case_exact"])
        by_lang[r["language"]].append(r["case_exact"])
    no_gold_cases = sum(1 for r in rows if r["required"] == 0 and not r["error"])
    return {
        "cases": n,
        "case_exact_match": _rate(sum(r["case_exact"] for r in rows), n),
        "field_exact_accuracy": _rate(tot["correct_exact"], tot["required"]),
        "normalized_value_accuracy": _rate(tot["correct_norm"], tot["required"]),
        "missing_answer_rate": _rate(tot["missing"], tot["required"]),
        "wrong_value_rate": _rate(tot["wrong"], tot["required"]),
        "question_scope_violation_rate": _rate(tot["scope_violations"], tot["predictions"]),
        "cases_with_scope_violation": _rate(sum(1 for r in rows if r["scope_violations"]), n),
        "hallucinated_field_rate": _rate(tot["hallucinated"], in_scope_preds),
        "cases_with_hallucinated_field": _rate(sum(1 for r in rows if r["hallucinated"]), n),
        "spurious_values_on_no_answer_cases": _rate(sum(1 for r in rows if r["required"] == 0 and r["spurious"]), no_gold_cases),
        "evidence_exact_grounding": _rate(tot["grounded"], tot["predictions"]),
        "evidence_aligned_with_gold_span": _rate(tot["correct_aligned"], correct_total),
        "correct_values_backend_accepts": _rate(tot["correct_backend_pass"], correct_total),
        "bad_values_backend_rejects": _rate(tot["wrong_backend_reject"], wrong_or_halluc),
        "schema_failure_rate": _rate(schema_fail, n),
        "call_failure_rate": _rate(sum(errors.values()) - schema_fail, n),
        "errors": dict(errors),
        "per_field_accuracy": {
            f: {"accuracy": _rate(c["CORRECT"] + c["CORRECT_NORMALIZED"], c["CORRECT"] + c["CORRECT_NORMALIZED"] + c["WRONG"] + c["MISSING"]), **dict(c)}
            for f, c in sorted(per_field.items())
        },
        "case_exact_by_category": {k: _rate(sum(v), len(v)) for k, v in sorted(by_cat.items())},
        "case_exact_by_language": {k: _rate(sum(v), len(v)) for k, v in sorted(by_lang.items())},
        **latency_usage(latencies, usage, cost_usd, n),
    }


def latency_usage(latencies: list[int], usage: dict[str, int], cost_usd: float | None, n: int) -> dict[str, Any]:
    lat = sorted(latencies)
    return {
        "latency_ms_p50": int(statistics.median(lat)) if lat else None,
        "latency_ms_p95": lat[min(len(lat) - 1, math.ceil(0.95 * len(lat)) - 1)] if lat else None,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "estimated_cost_usd": round(cost_usd, 6) if cost_usd is not None else None,
        "estimated_cost_usd_per_1k_replies": round(cost_usd / n * 1000, 4) if cost_usd is not None and n else None,
    }


# ----------------------------------------------------------------------------------------------- decision scoring
def _prf(tp: int, fp: int, fn: int) -> dict[str, float | None]:
    p = _rate(tp, tp + fp)
    rc = _rate(tp, tp + fn)
    if tp + fp + fn == 0:
        f1 = None
    elif tp == 0:
        f1 = 0.0  # a class that exists but is never predicted (or only wrongly) scores 0, not "undefined"
    else:
        f1 = round(2 * tp / (2 * tp + fp + fn), 4)
    return {"precision": p, "recall": rc, "f1": f1}


def binary_metrics(probs: list[float], labels: list[bool]) -> dict[str, Any]:
    n = len(labels)
    if not n:
        return {}
    pred = [p >= 0.5 for p in probs]
    tp = sum(1 for p, y in zip(pred, labels, strict=True) if p and y)
    fp = sum(1 for p, y in zip(pred, labels, strict=True) if p and not y)
    fn = sum(1 for p, y in zip(pred, labels, strict=True) if not p and y)
    brier = sum((p - float(y)) ** 2 for p, y in zip(probs, labels, strict=True)) / n
    base = sum(labels) / n
    brier_ref = base * (1 - base)
    bins = []
    ece = 0.0
    for b in range(10):
        lo, hi = b / 10, (b + 1) / 10
        idx = [i for i, p in enumerate(probs) if (lo <= p < hi) or (b == 9 and p == 1.0)]
        if idx:
            conf = sum(probs[i] for i in idx) / len(idx)
            acc = sum(labels[i] for i in idx) / len(idx)
            ece += len(idx) / n * abs(conf - acc)
            bins.append({"bin": f"{lo:.1f}-{hi:.1f}", "n": len(idx), "mean_p": round(conf, 3), "observed": round(acc, 3)})
    return {
        "accuracy_at_0_5": _rate(sum(1 for p, y in zip(pred, labels, strict=True) if p == y), n),
        **_prf(tp, fp, fn),
        "brier": round(brier, 4),
        "brier_skill_vs_base_rate": round(1 - brier / brier_ref, 4) if brier_ref else None,
        "ece_10bin": round(ece, 4),
        "auroc": _auroc(probs, labels),
        "confident_wrong_ge_0_9": sum(1 for p, y in zip(probs, labels, strict=True) if (p >= 0.9 and not y) or (p <= 0.1 and y)),
        "reliability": bins,
    }


def _auroc(probs: list[float], labels: list[bool]) -> float | None:
    pos = [p for p, y in zip(probs, labels, strict=True) if y]
    neg = [p for p, y in zip(probs, labels, strict=True) if not y]
    if not pos or not neg:
        return None
    wins = sum(1.0 if a > b else 0.5 if a == b else 0.0 for a in pos for b in neg)
    return round(wins / (len(pos) * len(neg)), 4)


def choice_metrics(dists: list[dict[str, float]], labels: list[str], classes: tuple[str, ...]) -> dict[str, Any]:
    n = len(labels)
    pred = [max(classes, key=lambda k: d.get(k, 0.0)) for d in dists]
    confusion = {g: {p: 0 for p in classes} for g in classes}
    for g, p in zip(labels, pred, strict=True):
        confusion[g][p] += 1
    per_class = {}
    for c in classes:
        tp = confusion[c][c]
        fp = sum(confusion[g][c] for g in classes if g != c)
        fn = sum(confusion[c][p] for p in classes if p != c)
        per_class[c] = {**_prf(tp, fp, fn), "support": sum(confusion[c].values())}
    f1s = [v["f1"] for v in per_class.values() if v["support"] and v["f1"] is not None]
    brier = sum(sum((d.get(c, 0.0) - (1.0 if g == c else 0.0)) ** 2 for c in classes) for d, g in zip(dists, labels, strict=True)) / n
    return {
        "accuracy": _rate(sum(1 for g, p in zip(labels, pred, strict=True) if g == p), n),
        "macro_f1": round(sum(f1s) / len(f1s), 4) if f1s else None,
        "multiclass_brier": round(brier, 4),
        "per_class": per_class,
        "confusion": confusion,
    }


def derived_review_probability(out: dict[str, Any]) -> float:
    """A fixed policy over the model's own probabilities: review unless it is a firm, real answer."""
    at, cm = out["answer_type"], out["commitment"]
    return 1 - cm.get("FIRM", 0.0) * (at.get("AVAILABLE", 0.0) + at.get("UNAVAILABLE", 0.0))


def threshold_sweep(probs: list[float], labels: list[bool]) -> list[dict[str, Any]]:
    rows = []
    for t in (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
        flagged = [p >= t for p in probs]
        rows.append({
            "threshold": t,
            "missed_reviews_fn": sum(1 for f, y in zip(flagged, labels, strict=True) if y and not f),
            "unneeded_reviews_fp": sum(1 for f, y in zip(flagged, labels, strict=True) if f and not y),
            "flagged_share": _rate(sum(flagged), len(flagged)),
        })
    return rows


def aggregate_decision(cases: list[dict[str, Any]], outputs: list[dict[str, Any] | None], errors: list[str | None],
                       latencies: list[int], usage: dict[str, int], cost_usd: float | None) -> dict[str, Any]:
    ok = [(c, o) for c, o in zip(cases, outputs, strict=True) if o is not None]
    gold = [c["gold"] for c, _ in ok]
    outs = [o for _, o in ok]
    review_p = [o["needs_human_review"] for o in outs]
    review_y = [g["needs_human_review"] for g in gold]
    derived = [derived_review_probability(o) for o in outs]
    by_lang: dict[str, list[bool]] = defaultdict(list)
    by_cat: dict[str, list[bool]] = defaultdict(list)
    for (c, o) in ok:
        hit = max(COMMITMENTS, key=lambda k: o["commitment"].get(k, 0.0)) == c["gold"]["commitment"]
        by_lang[c["language"]].append(hit)
        by_cat[c["category"]].append(hit)
    err = Counter(e for e in errors if e)
    return {
        "cases": len(cases),
        "scored": len(ok),
        "failure_rate": _rate(sum(err.values()), len(cases)),
        "errors": dict(err),
        "answer_type": choice_metrics([o["answer_type"] for o in outs], [g["answer_type"] for g in gold], ANSWER_TYPES),
        "commitment": choice_metrics([o["commitment"] for o in outs], [g["commitment"] for g in gold], COMMITMENTS),
        "firm": binary_metrics([o["commitment"].get("FIRM", 0.0) for o in outs], [g["commitment"] == "FIRM" for g in gold]),
        "conditional": binary_metrics([o["commitment"].get("CONDITIONAL", 0.0) for o in outs], [g["commitment"] == "CONDITIONAL" for g in gold]),
        "answers_question": binary_metrics([o["answers_question"] for o in outs], [g["answers_question"] for g in gold]),
        "needs_human_review": binary_metrics(review_p, review_y),
        "needs_human_review_derived": binary_metrics(derived, review_y),
        "needs_human_review_threshold_sweep": threshold_sweep(review_p, review_y),
        "needs_human_review_derived_threshold_sweep": threshold_sweep(derived, review_y),
        "commitment_accuracy_by_language": {k: _rate(sum(v), len(v)) for k, v in sorted(by_lang.items())},
        "commitment_accuracy_by_category": {k: _rate(sum(v), len(v)) for k, v in sorted(by_cat.items())},
        **latency_usage(latencies, usage, cost_usd, len(cases)),
    }
