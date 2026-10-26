"""T-099 evaluation tooling: dataset integrity, scoring, validator port, adapters (fake clients — no network)."""

from __future__ import annotations

import json
import runpy
from pathlib import Path
from types import SimpleNamespace

import pytest

from cera_ai.decision import ANSWER_TYPES, COMMITMENTS, CRITERIA, DecisionInput, JevDecisionProvider, LlmJudgeDecisionProvider
from cera_ai.evals.__main__ import main as cli
from cera_ai.evals.dataset import DATASETS_DIR, load_dataset, validate_dataset
from cera_ai.evals.scoring import backend_checks, binary_metrics, choice_metrics, score_extraction_case
from cera_ai.llm_adapters import PROVIDER_OUTPUT_SCHEMA, AnthropicProvider, GeminiProvider, OpenAIProvider
from cera_ai.providers import LiveProviderSlot, ProviderError, provider_from_env

DS_DIR = DATASETS_DIR / "cera-reply-eval-v1"


# ----------------------------------------------------------------------------------------------------- dataset
def test_dataset_matches_its_source_and_is_valid() -> None:
    source = runpy.run_path(str(DS_DIR / "source.py"))
    assert source["to_jsonl"](source["build"]()) == (DS_DIR / "cases.jsonl").read_text(encoding="utf-8")
    ds = load_dataset("cera-reply-eval-v1")
    assert validate_dataset(ds) == []
    assert len(ds.cases) >= 100
    assert {c.doc["category"] for c in ds.cases} == set("ABCDEFGHIJKLMN")
    assert all(c.doc["label_status"] == "DRAFT_NEEDS_HUMAN_REVIEW" for c in ds.cases)


def test_requests_sent_to_models_carry_no_gold() -> None:
    for c in load_dataset("cera-reply-eval-v1").cases:
        sent = json.dumps(c.extraction_request().model_dump(by_alias=True, mode="json"), ensure_ascii=False)
        sent += json.dumps(JevDecisionProvider().request_body(c.decision_input()), ensure_ascii=False)
        assert "gold" not in sent and "review_reasons" not in sent
        if c.gold["note"]:
            assert c.gold["note"] not in sent


# ---------------------------------------------------------------------------------------------- validator port
ASK = load_dataset("cera-reply-eval-v1", ["A01"]).cases[0].ask


def _a(field: str, value: str, unit: str | None, quote: str, ask_id: str = "Q1") -> dict:
    return {"ask_id": ask_id, "field": field, "raw_value": value, "value": value, "unit": unit, "evidence": {"quote": quote}, "confidence": None}


@pytest.mark.parametrize(
    ("source", "answer", "failed"),
    [  # same expectations as back/test/unit/extraction-rules.test.ts
        ("차량 4대까지 가능합니다", _a("quantity", "4", "TRUCK", "차량 4대까지 가능합니다"), []),
        ("차량 4대 가능", _a("quantity", "4", "TRUCK", "트럭 4대"), ["QUOTE_NOT_IN_SOURCE"]),
        ("대당 35만원", _a("quantity", "350000", "KRW", "대당 35만원"), ["UNIT_MISMATCH:KRW", "VALUE_NOT_IN_QUOTE"]),
        ("대당 35만원", _a("rate", "350000", "KRW", "대당 35만원"), ["FIELD_NOT_ASKED"]),
        ("두 대 가능", _a("quantity", "2", "TRUCK", "두 대"), []),
        ("15시부터", _a("available_from", "15:00", None, "15시부터"), []),
        ("3시 반부터", _a("available_from", "15:30", None, "3시 반부터"), ["VALUE_NOT_IN_QUOTE"]),
        ("오후 3시", _a("available_from", "3pm", None, "오후 3시"), ["BAD_TIME", "VALUE_NOT_IN_QUOTE"]),
    ],
)
def test_backend_validator_port_matches_typescript(source: str, answer: dict, failed: list[str]) -> None:
    assert backend_checks(ASK, source, [answer], [])[0]["failed"] == failed


def test_backend_validator_port_conflict() -> None:
    out = backend_checks(ASK, "2대 또는 3대", [_a("quantity", "2", "TRUCK", "2대"), _a("quantity", "3", "TRUCK", "3대")], [])
    assert [r["failed"] for r in out] == [["CONFLICTING_CANDIDATES"], ["CONFLICTING_CANDIDATES"]]


# ----------------------------------------------------------------------------------------------------- scoring
def _gold_output(case: dict) -> dict:
    answers = [_a(x["field"], x["value"], x["unit"], x["evidence"][0]) for x in case["gold"]["extraction"] if not x["optional"]]
    return {"outcome": "VALUES" if answers else "NO_CHANGE", "answers": answers, "unmapped_statements": [], "ambiguity_flags": []}


def test_gold_output_scores_perfectly_and_mistakes_are_named() -> None:
    ds = load_dataset("cera-reply-eval-v1")
    for c in ds.cases:
        r = score_extraction_case(c.doc, _gold_output(c.doc), None)
        assert r["case_exact"], c.case_id
    f01 = load_dataset("cera-reply-eval-v1", ["F01"]).cases[0].doc
    out = _gold_output(f01)
    out["answers"].append(_a("unit_price", "350000", "KRW", "35만원"))  # asked nothing about price
    out["answers"].append(_a("available_from", "15:00", None, "차량 2대"))  # copied the window
    r = score_extraction_case(f01, out, None)
    assert (r["scope_violations"], r["hallucinated"], r["case_exact"]) == (1, 1, False)
    r = score_extraction_case(f01, None, {"code": "PROVIDER_OUTPUT_INVALID"})
    assert r["missing"] == 1 and r["error"] == "PROVIDER_OUTPUT_INVALID"


def test_decision_metrics() -> None:
    labels = ["AVAILABLE", "UNAVAILABLE", "DEFERRED", "UNCLEAR"]
    perfect = [{k: float(k == g) for k in ANSWER_TYPES} for g in labels]
    m = choice_metrics(perfect, labels, ANSWER_TYPES)
    assert (m["accuracy"], m["macro_f1"], m["multiclass_brier"]) == (1.0, 1.0, 0.0)
    always_available = [{k: float(k == "AVAILABLE") for k in ANSWER_TYPES}] * 4
    assert choice_metrics(always_available, labels, ANSWER_TYPES)["macro_f1"] == pytest.approx(0.1, abs=1e-3)  # unpredicted classes count as 0
    b = binary_metrics([0.95, 0.95, 0.05], [True, False, False])
    assert b["confident_wrong_ge_0_9"] == 1 and b["auroc"] == 0.75


# ---------------------------------------------------------------------------------------- adapters (fake clients)
VALID = json.dumps({"outcome": "VALUES", "answers": [_a("quantity", "4", "TRUCK", "차량 4대")], "unmapped_statements": [], "ambiguity_flags": []})
REQUEST = load_dataset("cera-reply-eval-v1", ["A01"]).cases[0].extraction_request()


class _Recorder:
    def __init__(self, response: object) -> None:
        self.response, self.kwargs = response, {}

    def __call__(self, **kwargs: object) -> object:
        self.kwargs = kwargs
        return self.response


def test_anthropic_adapter_uses_structured_output_and_handles_refusal() -> None:
    rec = _Recorder(SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=VALID)], usage=SimpleNamespace(input_tokens=10, output_tokens=5)))
    p = AnthropicProvider("claude-haiku-5-5", client=SimpleNamespace(messages=SimpleNamespace(create=rec)))
    result = p.extract(REQUEST, "prompt")
    assert result.output.answers[0].value == "4" and result.usage.input_tokens == 10
    assert rec.kwargs["output_config"]["format"] == {"type": "json_schema", "schema": PROVIDER_OUTPUT_SCHEMA}
    assert "thinking" not in rec.kwargs and "temperature" not in rec.kwargs
    rec.response = SimpleNamespace(stop_reason="refusal", content=[], usage=SimpleNamespace(input_tokens=1, output_tokens=0))
    with pytest.raises(ProviderError) as err:
        p.extract(REQUEST, "prompt")
    assert err.value.code == "PROVIDER_REFUSED"


def test_openai_and_gemini_adapters_parse_and_flag_schema_failures() -> None:
    rec = _Recorder(SimpleNamespace(output_text=VALID, usage=SimpleNamespace(input_tokens=7, output_tokens=3)))
    p = OpenAIProvider("gpt-6-luna", client=SimpleNamespace(responses=SimpleNamespace(create=rec)))
    assert p.extract(REQUEST, "prompt").output.answers[0].field == "quantity"
    assert rec.kwargs["text"]["format"]["strict"] is True
    rec.response = SimpleNamespace(output_text='{"outcome":"VALUES","answers":[{"bogus":1}]}', usage=None)
    with pytest.raises(ProviderError) as err:
        p.extract(REQUEST, "prompt")
    assert err.value.code == "PROVIDER_OUTPUT_INVALID"
    meta = SimpleNamespace(prompt_token_count=9, candidates_token_count=4, thoughts_token_count=6)
    g = GeminiProvider("gemini-3.8-flash", client=SimpleNamespace(models=SimpleNamespace(generate_content=_Recorder(SimpleNamespace(text="not json", usage_metadata=meta)))))
    with pytest.raises(ProviderError) as err:
        g.extract(REQUEST, "prompt")
    assert err.value.code == "PROVIDER_OUTPUT_NOT_JSON"


def test_missing_key_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ProviderError) as err:
        JevDecisionProvider().decide(DecisionInput("q", "r", "2026-10-12"))
    assert err.value.code == "PROVIDER_KEY_MISSING"


def test_live_mode_runs_an_adapter_only_when_both_are_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CERA_LLM_MODE", "live")
    monkeypatch.delenv("CERA_LLM_PROVIDER", raising=False)
    monkeypatch.delenv("CERA_LLM_MODEL", raising=False)
    assert isinstance(provider_from_env(), LiveProviderSlot)
    monkeypatch.setenv("CERA_LLM_PROVIDER", "openai")
    monkeypatch.setenv("CERA_LLM_MODEL", "gpt-6-luna")
    assert isinstance(provider_from_env(), OpenAIProvider)


def test_jev_and_judge_parse_typed_answers() -> None:
    doc = {
        "model": "typesafe/jev-1.13-20260917",
        "answers": {
            "answer_type": {"type": "choice", "choice": "AVAILABLE", "probabilities": {"AVAILABLE": 0.8, "UNAVAILABLE": 0.1, "DEFERRED": 0.1, "UNCLEAR": 0}},
            "commitment": {"type": "choice", "choice": "CONDITIONAL", "probabilities": {"FIRM": 0.2, "CONDITIONAL": 0.7, "UNKNOWN": 0.1}},
            "answers_question": {"type": "noul", "noul": 0.9},
            "needs_human_review": {"type": "noul", "noul": 0.85},
        },
        "usage": {"input_tokens": 500, "output_tokens": 40, "cost": 0.00002},
    }
    post = _Recorder(SimpleNamespace(status_code=200, json=lambda: doc))
    jev = JevDecisionProvider(client=SimpleNamespace(post=lambda url, headers, json: post(url=url, json=json)))
    item = DecisionInput("10월 13일 트럭 2대", "오후라면 2대 정도는 가능할 것 같습니다.", "2026-10-12", "2026-10-13", "15:00-17:00")
    out = jev.decide(item)
    assert out.commitment["CONDITIONAL"] == pytest.approx(0.7) and out.reported_cost_usd == 0.00002
    body = post.kwargs["json"]
    assert body["questions"]["commitment"]["criteria"] == CRITERIA["commitment"]["options"]
    assert set(body["questions"]["answer_type"]["criteria"]) == set(ANSWER_TYPES)
    judge_doc = {"answer_type": {k: 0.25 for k in ANSWER_TYPES}, "commitment": {k: 1.0 for k in COMMITMENTS}, "answers_question": 1.4, "needs_human_review": 0.5}
    adapter = SimpleNamespace(complete_json=lambda prompt, schema: (json.dumps(judge_doc), SimpleNamespace(input_tokens=1, output_tokens=1)))
    j = LlmJudgeDecisionProvider("openai", "gpt-6-luna", adapter=adapter).decide(item)
    assert j.commitment["FIRM"] == pytest.approx(1 / 3) and j.answers_question == 1.0


# -------------------------------------------------------------------------------------------- runner end to end
def test_runner_records_rescore_and_report(tmp_path: Path) -> None:
    assert cli(["extract", "--provider", "null", "--model", "null", "--cases", "A,B", "--run-id", "null-run", "--out-dir", str(tmp_path)]) == 0
    run = tmp_path / "null-run"
    assert {p.name for p in run.iterdir()} == {"run.json", "outputs.jsonl", "metrics.json", "per_case.csv"}
    meta = json.loads((run / "run.json").read_text(encoding="utf-8"))
    assert meta["real_api_call"] is False and meta["cases"] == 22
    assert cli(["extract", "--provider", "replay-run", "--from-run", str(run), "--model", "null", "--cases", "A,B", "--run-id", "replayed", "--out-dir", str(tmp_path)]) == 0
    assert json.loads((tmp_path / "replayed" / "metrics.json").read_text(encoding="utf-8"))["missing_answer_rate"] == 1.0
    assert cli(["decide", "--provider", "prior", "--model", "prior", "--cases", "A,B", "--run-id", "prior-run", "--out-dir", str(tmp_path)]) == 0
    assert cli(["rescore", "--run", str(run)]) == 0
    out = tmp_path / "report.md"
    assert cli(["report", "--runs", str(run), str(tmp_path / "prior-run"), "--out", str(out), "--csv", str(tmp_path / "r.csv")]) == 0
    text = out.read_text(encoding="utf-8")
    assert "## extraction" in text and "## decision" in text
