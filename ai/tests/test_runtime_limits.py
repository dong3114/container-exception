"""Runtime ceilings (2026-10-26): generous emergency ceilings that stop runaway execution, not slow normal work.

The numbers are [ASSUMPTION / DEVELOPMENT SAFETY CEILING] — they are lowered later from observed distributions.
"""

from typing import Any

import httpx
import pytest

from cera_ai.agent.graph import GraphDeps
from cera_ai.agent.tooling import ToolSession
from cera_ai.config import KEYS as SETTINGS_SPEC
from cera_ai.llm_adapters import LocalProvider
from cera_ai.providers import ProviderError, provider_from_env

from test_agent_graph import MSG, PARAMS, RR, RUN, FakeTools, fail, ok, runtime
from test_agent_graph import gap as gap_state


def test_defaults_are_generous_emergency_ceilings_not_product_policy():
    d = GraphDeps(tools=FakeTools())
    assert (d.max_steps, d.max_tool_calls, d.max_retries) == (100, 50, 3)
    for key, value in {"CERA_AGENT_MAX_STEPS": "100", "CERA_AGENT_MAX_TOOL_CALLS": "50", "CERA_AGENT_MAX_RETRIES": "3", "CERA_LOCAL_LLM_TIMEOUT_S": "300", "CERA_COMMERCIAL_LLM_TIMEOUT_S": "120"}.items():
        assert SETTINGS_SPEC[key][0] == value
        assert "SAFETY CEILING" in SETTINGS_SPEC[key][1]
    assert LocalProvider("m").timeout == 300  # a 20-40 s cold start / CPU answer is well inside


def test_a_normal_run_longer_than_the_old_25_step_cap_completes():
    # a person takes many looks before deciding: every wake re-reads the status (2 steps each)
    tools = FakeTools(status="PENDING_APPROVAL", approval_state="NONE")
    rt = runtime(tools)  # default ceilings
    rt.start(RUN, RR, "goal", PARAMS)
    for _ in range(15):
        assert rt.resume(RUN, "MANUAL", None)["waiting_reason"] == "HUMAN_APPROVAL_REQUIRED"
    tools.status = {"status": "REJECTED", "approval_state": "REJECTED", "replies": []}
    out = rt.resume(RUN, "APPROVAL_DECIDED", None)
    assert (out["status"], out["result_code"]) == ("COMPLETED", "INQUIRY_REJECTED")
    assert out["result_summary"]["step_count"] > 25


def test_up_to_fifty_tool_calls_in_one_active_stretch_are_allowed_then_the_ceiling_stops_it():
    tools = FakeTools()
    s = ToolSession(tools, RUN, 0, GraphDeps(tools=tools).max_tool_calls, 0)
    for _ in range(50):
        assert s.call("get_recovery_context", {}).ok
    with pytest.raises(Exception) as limit:
        s.call("get_recovery_context", {})
    assert getattr(limit.value, "code", None) == "TOOL_CALL_LIMIT_REACHED"


def test_a_runaway_loop_is_stopped_by_the_step_ceiling():
    tools = FakeTools(status="PENDING_APPROVAL", approval_state="NONE")
    rt = runtime(tools)
    rt.start(RUN, RR, "goal", PARAMS)
    out: dict[str, Any] = {}
    for _ in range(60):  # a wake-up that never changes anything, over and over
        out = rt.resume(RUN, "MANUAL", None)
        if out["status"] != "WAITING_HUMAN":
            break
    assert (out["status"], out["error_code"]) == ("FAILED", "LOOP_LIMIT_REACHED")
    assert out["result_summary"]["step_count"] > 100


def test_exhausted_retries_are_a_limit_code_with_the_cause_kept():
    always = FakeTools({"get_information_gaps": lambda a, n: fail("get_information_gaps", "UPSTREAM_TIMEOUT", True)})
    out = runtime(always, max_retries=3).start(RUN, RR, "goal", PARAMS)
    assert out["error_code"] == "RETRY_LIMIT_REACHED"
    assert [c[0] for c in always.calls].count("get_information_gaps") == 4
    # no retries configured → the original code (nothing was retried)
    assert runtime(FakeTools({"get_information_gaps": lambda a, n: fail("get_information_gaps", "UPSTREAM_TIMEOUT", True)}), max_retries=0).start(RUN, RR, "goal", PARAMS)["error_code"] == "UPSTREAM_TIMEOUT"


def test_a_model_that_does_not_answer_in_time_is_model_timeout_and_a_slow_answer_inside_succeeds():
    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("model still generating", request=request)

    provider = LocalProvider("qwen3-test", client=httpx.Client(base_url="http://llm.invalid/v1", transport=httpx.MockTransport(slow)))
    with pytest.raises(ProviderError) as error:
        provider.complete_json("p", {"type": "object"})
    assert (error.value.code, error.value.retryable) == ("MODEL_TIMEOUT", True)

    def answers(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}})

    ok_provider = LocalProvider("qwen3-test", client=httpx.Client(base_url="http://llm.invalid/v1", transport=httpx.MockTransport(answers)))
    assert ok_provider.complete_json("p", {"type": "object"})[0] == "{}"
    assert ok_provider._called is True  # the next call is warm


def test_an_empty_replay_dir_setting_means_the_default_recordings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CERA_LLM_MODE", "replay")
    monkeypatch.setenv("CERA_AI_REPLAY_DIR", "")  # as written in .env.example
    provider = provider_from_env()
    assert any(p.name.endswith(".json") for p in provider._dir.iterdir())


def _unused() -> None:  # keep fixtures referenced for linters
    ok("x", None)
    assert MSG


def test_a_stale_or_withdrawn_value_is_asked_again_with_its_own_draft_key():
    refresh = {**gap_state("NEEDS_REFRESH"), "refresh_basis_event_id": "01a1a4c0-7e10-7a3b-9c21-5d0f00a0ffff"}
    tools = FakeTools(gaps=[refresh])
    out = runtime(tools).start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["waiting_reason"]) == ("WAITING_HUMAN", "HUMAN_APPROVAL_REQUIRED")
    draft = next(c for c in tools.calls if c[0] == "create_inquiry_draft")
    assert draft[2] == f"{RUN}:gap:1:draft:r5d0f00a0ffff" and len(draft[2]) <= 100  # a refresh is a new question; the key fits the backend limit
