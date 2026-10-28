"""CeraRecoveryGraph logic (T-104) — fake backend tools, real LangGraph (StateGraph · interrupt · Command(resume))."""

import base64
import json
import re
from typing import Any, Callable

import httpx
from langgraph.checkpoint.memory import InMemorySaver

from cera_ai.agent.backend import RuntimeApiClient
from cera_ai.agent.checkpointer import BackendCheckpointSaver
from cera_ai.agent.graph import GraphDeps, approval_outcome
from cera_ai.agent.runtime import AgentRuntime
from cera_ai.agent.tooling import ToolSession, as_langchain_tools
from cera_ai.tools import ToolError, ToolResult, load_registry

RUN = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b201"
RR = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b202"
MSG = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b203"
ADDR = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b204"
CP = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b205"
POOL = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b206"
TOKEN = "graph-test-token-" + "q" * 32
PARAMS = {"inquiry": {"quantity": 2, "window_from": "15:00", "window_to": "17:00"}}


def ok(tool: str, output: Any) -> ToolResult:
    return ToolResult(tool, "SUCCEEDED", f"call-{tool}", output, None)


def fail(tool: str, code: str, retryable: bool, status: str = "FAILED") -> ToolResult:
    return ToolResult(tool, status, f"call-{tool}", None, ToolError(code, retryable, code))


def gap(state: str = "MISSING") -> dict[str, Any]:
    return {"gap_id": "gap:1", "gap_kind": "TRUCK_AVAILABILITY", "subject_type": "TRUCK_POOL", "subject_id": POOL, "subject_name": "pool", "required_fact": "available.slot(2026-10-01…)",
            "state": state, "open_question_message_ids": [], "public_data_can_resolve": False, "suggested_source": "PARTNER_INQUIRY", "suggested_intent": "TRUCK_SLOT",
            "suggested_counterparty_role": "TRUCKING", "owner_counterparty_id": CP}


class FakeTools:
    """Scripted backend: tool → function(args, call_no) → ToolResult. Records every call."""

    def __init__(self, overrides: dict[str, Callable[[dict[str, Any], int], ToolResult]] | None = None, *, gaps: list[dict[str, Any]] | None = None, status: str = "APPROVED", approval_state: str = "ACTIVE") -> None:
        self.registry = load_registry()
        self.calls: list[tuple[str, dict[str, Any], str | None]] = []
        self.status: dict[str, Any] = {"status": status, "approval_state": approval_state, "replies": []}
        self.candidates: list[dict[str, Any]] = []
        self.gaps = [gap()] if gaps is None else gaps
        self.overrides = overrides or {}

    def call(self, tool: str, arguments: dict[str, Any], *, agent_run_id: str, idempotency_key: str | None = None, traceparent: str | None = None) -> ToolResult:
        self.calls.append((tool, arguments, idempotency_key))
        n = sum(1 for c in self.calls if c[0] == tool)
        if tool in self.overrides:
            return self.overrides[tool](arguments, n)
        if tool == "get_recovery_context":
            return ok(tool, {"snapshot": {"plan_date": "2026-10-01"}, "latest_observations": [{"event_id": "ev-1"}]})
        if tool == "get_information_gaps":
            return ok(tool, {"gaps": self.gaps, "known": []})
        if tool == "find_counterparty":
            return ok(tool, {"counterparties": [{"counterparty_id": CP, "contacts": [{"addresses": [{"address_id": ADDR, "eligible": True}]}]}]})
        if tool == "create_inquiry_draft":
            return ok(tool, {"message": {"message_id": MSG}, "number_check_passed": True, "next_step": "REQUEST_APPROVAL"})
        if tool == "request_approval":
            return ok(tool, {"message": {"message_id": MSG}, "approval_requested": True})
        if tool == "get_communication_status":
            return ok(tool, {"messages": [{"message_id": MSG, **self.status}]})
        if tool == "get_reply_candidates":
            return ok(tool, {"message_id": MSG, "status": self.status["status"], "replies": [{"inbound_message_id": MSG, "received_at": "x", "extraction_state": "DONE", "no_candidate_outcome": None, "candidates": self.candidates}], "note": "n"})
        if tool == "get_vessel_calls":
            return ok(tool, {"summary": {"mode": "LIVE", "outcome": "SUCCESS", "pages": [{"fetch_id": "f-1"}, {"fetch_id": "f-2"}]}, "items": [{}, {}, {}]})
        raise AssertionError(f"unexpected tool {tool}")


def runtime(tools: FakeTools, saver: Any = None, **limits: Any) -> AgentRuntime:
    return AgentRuntime(GraphDeps(tools=tools, **limits), saver or InMemorySaver())


def test_start_runs_to_the_approval_interrupt_with_a_pending_ref_and_deterministic_keys():
    tools = FakeTools()
    out = runtime(tools).start(RUN, RR, "goal", PARAMS)
    assert out == {"schema_version": "agent-runtime/1", "agent_run_id": RUN, "status": "WAITING_HUMAN", "node": "wait_for_human", "waiting_reason": "HUMAN_APPROVAL_REQUIRED",
                   "pending": {"type": "COMM_MESSAGE", "id": MSG}, "result_code": None, "error_code": None, "result_summary": None}
    assert [c[0] for c in tools.calls] == ["get_recovery_context", "get_information_gaps", "find_counterparty", "create_inquiry_draft", "request_approval"]
    draft = next(c for c in tools.calls if c[0] == "create_inquiry_draft")
    assert draft[2] == f"{RUN}:gap:1:draft"  # retries and re-executions reuse the key → no duplicate draft
    assert draft[1]["values"][0] == {"key": "quantity", "value_number": 2, "unit": "TRUCK"}  # from the human, not invented
    assert draft[1]["address_id"] == ADDR and draft[1]["target_id"] == POOL


def test_resume_rereads_authoritative_status_and_branches():
    for status, approval, code in [("REJECTED", "REJECTED", "INQUIRY_REJECTED"), ("APPROVED", "REVOKED", "APPROVAL_WITHDRAWN")]:
        tools = FakeTools(status=status, approval_state=approval)
        rt = runtime(tools)
        rt.start(RUN, RR, "goal", PARAMS)
        out = rt.resume(RUN, "APPROVAL_DECIDED", {"type": "COMM_MESSAGE", "id": MSG})
        assert (out["status"], out["result_code"]) == ("COMPLETED", code)
        assert tools.calls[-1][0] == "get_communication_status"
    # approved: the agent does not send — it waits for a person to request the send
    tools = FakeTools(status="APPROVED", approval_state="ACTIVE")
    rt = runtime(tools)
    rt.start(RUN, RR, "goal", PARAMS)
    out = rt.resume(RUN, "APPROVAL_DECIDED", None)
    assert (out["status"], out["waiting_reason"], out["pending"]) == ("WAITING_HUMAN", "AWAITING_SEND_REQUEST", {"type": "COMM_MESSAGE", "id": MSG})


def test_full_slice_waits_for_send_and_reply_then_reads_candidates_and_reassesses():
    tools = FakeTools()
    tools.status = {"status": "PENDING_APPROVAL", "approval_state": "NONE", "replies": []}
    rt = runtime(tools)
    params = {**PARAMS, "public_data": {"from_date": "2026-10-20", "to_date": "2026-10-21"}}
    assert rt.start(RUN, RR, "goal", params)["waiting_reason"] == "HUMAN_APPROVAL_REQUIRED"
    tools.status = {"status": "QUEUED", "approval_state": "ACTIVE", "replies": []}
    out = rt.resume(RUN, "SEND_PROGRESS", None)
    assert (out["status"], out["waiting_reason"]) == ("WAITING_EXTERNAL", "AWAITING_DELIVERY")
    tools.status = {"status": "SENT", "approval_state": "ACTIVE", "replies": []}
    out = rt.resume(RUN, "SEND_PROGRESS", None)
    assert (out["status"], out["waiting_reason"], out["pending"]["id"]) == ("WAITING_EXTERNAL", "AWAITING_REPLY", MSG)
    # a reply arrived but extraction is still running → keep waiting
    tools.status = {"status": "REPLIED", "approval_state": "ACTIVE", "replies": [{"status": "NORMAL", "extraction_state": "WAITING"}]}
    assert rt.resume(RUN, "INBOUND_REPLY_RECEIVED", None)["waiting_reason"] == "AWAITING_REPLY"
    tools.status["replies"] = [{"status": "NORMAL", "extraction_state": "DONE"}]
    tools.candidates = [
        {"extraction_id": "e-1", "field": "quantity", "value": "4", "unit": "TRUCK", "validation": "PASSED", "failed_reasons": [], "review_status": "PENDING", "generated_by": "RECORDED_REPLAY"},
        {"extraction_id": "e-2", "field": "available_until", "value": "9", "unit": None, "validation": "REJECTED", "failed_reasons": ["VALUE_NOT_IN_QUOTE"], "review_status": "REJECTED", "generated_by": "RECORDED_REPLAY"},
    ]
    tools.gaps = [{**gap("ASKED"), "candidate_state": "CANDIDATE_RECEIVED"}]
    out = rt.resume(RUN, "INBOUND_REPLY_RECEIVED", None)
    assert (out["status"], out["result_code"]) == ("COMPLETED", "CANDIDATE_RECEIVED_PENDING_CONFIRMATION")
    summary = out["result_summary"]
    assert summary["candidate_fields"] == ["quantity"] and summary["candidate_extraction_ids"] == ["e-1"]
    # workflow satisfied, business gap still open — no fact was made
    assert (summary["business_gap_state"], summary["candidate_state"], summary["facts_confirmed"]) == ("ASKED", "CANDIDATE_RECEIVED", False)
    assert (summary["public_data_mode"], summary["public_vessel_call_count"], summary["public_fetch_ids"]) == ("LIVE", 3, ["f-1", "f-2"])
    assert all(isinstance(v, (str, int, bool, list)) for v in summary.values())
    assert "4" not in [str(v) for v in summary.values()]  # candidate values are not copied into the run summary
    names = [c[0] for c in tools.calls]
    assert names.count("create_inquiry_draft") == 1 and "get_reply_candidates" in names and names[-1] == "get_information_gaps"


def _replied_with_promoted_candidate(tools: FakeTools) -> AgentRuntime:
    """Start → approval → send → reply: the backend promoted the validated candidate to a PROVISIONAL fact (review_status ACCEPTED)."""
    tools.status = {"status": "PENDING_APPROVAL", "approval_state": "NONE", "replies": []}
    rt = runtime(tools)
    assert rt.start(RUN, RR, "goal", PARAMS)["waiting_reason"] == "HUMAN_APPROVAL_REQUIRED"
    tools.status = {"status": "SENT", "approval_state": "ACTIVE", "replies": []}
    assert rt.resume(RUN, "SEND_PROGRESS", None)["waiting_reason"] == "AWAITING_REPLY"
    tools.status = {"status": "REPLIED", "approval_state": "ACTIVE", "replies": [{"status": "NORMAL", "extraction_state": "DONE"}]}
    tools.candidates = [
        {"extraction_id": "e-1", "field": "quantity", "value": "4", "unit": "TRUCK", "validation": "PASSED", "failed_reasons": [], "review_status": "ACCEPTED", "generated_by": "LLM", "fact_event_id": "ev-9", "promotion_blocked_reasons": []},
    ]
    tools.gaps = [{**gap("PROVISIONAL_AVAILABLE"), "candidate_state": "CANDIDATE_ACCEPTED"}]
    return rt


def test_a_provisional_fact_makes_the_run_wait_for_a_person_and_only_a_confirmed_fact_closes_the_gap():
    tools = FakeTools()
    rt = _replied_with_promoted_candidate(tools)
    out = rt.resume(RUN, "INBOUND_REPLY_RECEIVED", None)
    # the value exists but no person confirmed it: the gap is NOT closed, the run waits for a person (not for the partner)
    assert (out["status"], out["waiting_reason"], out["pending"]) == ("WAITING_HUMAN", "AWAITING_FACT_VERIFICATION", {"type": "COMM_MESSAGE", "id": MSG})
    # a still-provisional fact on wake-up (wrong wake) → wait again; the resume value is only a reason
    assert rt.resume(RUN, "FACT_STATE_CHANGED", {"confirmed": True})["waiting_reason"] == "AWAITING_FACT_VERIFICATION"
    # a person confirmed → the backend no longer lists the gap
    tools.gaps = []
    done = rt.resume(RUN, "FACT_STATE_CHANGED", None)
    assert (done["status"], done["result_code"]) == ("COMPLETED", "FACT_CONFIRMED")
    summary = done["result_summary"]
    assert (summary["business_gap_state"], summary["facts_confirmed"], summary["reply_outcome"], summary["fact_event_ids"]) == ("KNOWN", True, "FACTS_PROMOTED", ["ev-9"])
    assert "4" not in [str(v) for v in summary.values()]  # fact values are not copied into the run summary
    assert [c[0] for c in tools.calls].count("create_inquiry_draft") == 1


def test_a_rejected_or_disputed_provisional_fact_ends_the_run_without_inventing_a_fact():
    for gap_after, code in [("ASKED", "FACT_REJECTED_GAP_OPEN"), ("NEEDS_REVIEW", "FACT_NEEDS_HUMAN_REVIEW")]:
        tools = FakeTools()
        rt = _replied_with_promoted_candidate(tools)
        assert rt.resume(RUN, "INBOUND_REPLY_RECEIVED", None)["waiting_reason"] == "AWAITING_FACT_VERIFICATION"
        tools.gaps = [{**gap(gap_after), "candidate_state": "CANDIDATE_ACCEPTED"}]
        out = rt.resume(RUN, "FACT_STATE_CHANGED", None)
        assert (out["status"], out["result_code"]) == ("COMPLETED", code)
        assert out["result_summary"]["facts_confirmed"] is False


def test_gaps_that_wait_for_a_person_are_not_gaps_the_agent_asks_about():
    # only a provisional / disputed gap is left → nothing to ask, nothing to wait for from a partner
    out = runtime(FakeTools(gaps=[gap("PROVISIONAL_AVAILABLE")])).start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["result_code"]) == ("COMPLETED", "OPEN_GAPS_AWAIT_HUMAN")
    # an asked gap next to a provisional one still waits for the reply
    mixed = runtime(FakeTools(gaps=[gap("ASKED"), {**gap("PROVISIONAL_AVAILABLE"), "gap_id": "gap:2"}])).start(RUN, RR, "goal", PARAMS)
    assert (mixed["status"], mixed["waiting_reason"]) == ("WAITING_EXTERNAL", "AWAITING_REPLIES")


def _replied_without_a_usable_value(extraction_state: str, run: str = RUN, params: dict[str, Any] | None = None) -> tuple[FakeTools, AgentRuntime]:
    tools = FakeTools(status="SENT", approval_state="ACTIVE")
    tools.status["replies"] = [{"status": "NORMAL", "extraction_state": extraction_state}]
    rt = runtime(tools)
    rt.start(run, RR, "goal", params or PARAMS)
    # asked, the reply came, nothing usable came out of it — the backend still lists the gap
    tools.gaps = [{**gap("ASKED"), "candidate_state": "NO_VALID_CANDIDATE"}]
    return tools, rt


def test_a_reply_without_a_usable_value_waits_for_a_person_instead_of_completing():
    # CASE B (T-124): reply received + no usable value + gap still open → not "done": the run waits for a person
    for state in ("NO_CANDIDATE", "FAILED"):
        tools, rt = _replied_without_a_usable_value(state)
        tools.overrides["get_reply_candidates"] = lambda a, n, s=state: ok("get_reply_candidates", {"message_id": MSG, "status": "REPLIED", "replies": [{"inbound_message_id": "in-1", "received_at": "x", "extraction_state": s, "no_candidate_outcome": None, "candidates": []}], "note": "n"})
        out = rt.resume(RUN, "INBOUND_REPLY_RECEIVED", None)
        assert (out["status"], out["waiting_reason"], out["pending"]) == ("WAITING_HUMAN", "REPLY_REVIEW_REQUIRED", {"type": "COMM_MESSAGE", "id": MSG})
        # a human retry that failed again (or a wrong wake) → still waiting; nothing was invented
        assert rt.resume(RUN, "EXTRACTION_RETRIED", None)["waiting_reason"] == "REPLY_REVIEW_REQUIRED"
        assert [c[0] for c in tools.calls].count("create_inquiry_draft") == 1


def test_after_review_a_direct_entry_or_a_successful_retry_continues_the_run():
    # CASE C: a person entered the fact directly → the backend no longer lists the gap → the run ends with the confirmed fact
    tools, rt = _replied_without_a_usable_value("NO_CANDIDATE")
    assert rt.resume(RUN, "INBOUND_REPLY_RECEIVED", None)["waiting_reason"] == "REPLY_REVIEW_REQUIRED"
    tools.gaps = []
    done = rt.resume(RUN, "FACT_STATE_CHANGED", None)
    assert (done["status"], done["result_code"]) == ("COMPLETED", "FACT_CONFIRMED")
    assert done["result_summary"]["business_gap_state"] == "KNOWN"
    # CASE D: a human retry produced a validated candidate the backend promoted → the usual provisional-fact wait
    tools, rt = _replied_without_a_usable_value("FAILED")
    assert rt.resume(RUN, "INBOUND_REPLY_RECEIVED", None)["waiting_reason"] == "REPLY_REVIEW_REQUIRED"
    tools.candidates = [{"extraction_id": "e-7", "field": "quantity", "value": "4", "unit": "TRUCK", "validation": "PASSED", "failed_reasons": [], "review_status": "ACCEPTED", "generated_by": "LLM", "fact_event_id": "ev-7", "promotion_blocked_reasons": []}]
    tools.gaps = [{**gap("PROVISIONAL_AVAILABLE"), "candidate_state": "CANDIDATE_ACCEPTED"}]
    out = rt.resume(RUN, "EXTRACTION_RETRIED", None)
    assert (out["status"], out["waiting_reason"]) == ("WAITING_HUMAN", "AWAITING_FACT_VERIFICATION")
    tools.gaps = []
    assert rt.resume(RUN, "FACT_STATE_CHANGED", None)["result_code"] == "FACT_CONFIRMED"


def test_with_planning_on_a_reply_without_a_usable_value_still_waits_for_review_first():
    tools, rt = _replied_without_a_usable_value("NO_CANDIDATE", "run-plan", {**PARAMS, "plan_recovery": True})
    out = rt.resume("run-plan", "INBOUND_REPLY_RECEIVED", None)
    assert (out["status"], out["waiting_reason"]) == ("WAITING_HUMAN", "REPLY_REVIEW_REQUIRED")
    assert "calculate_recovery_costs" not in [c[0] for c in tools.calls]


def test_tool_call_budget_is_per_active_stretch_and_steps_bound_the_whole_run():
    tools = FakeTools(status="PENDING_APPROVAL", approval_state="NONE")
    rt = runtime(tools, max_tool_calls=6, max_steps=40)
    assert rt.start(RUN, RR, "goal", PARAMS)["status"] == "WAITING_HUMAN"  # 5 tool calls
    for _ in range(4):  # each wake reads the status once — the budget starts again after a wait
        assert rt.resume(RUN, "APPROVAL_DECIDED", None)["status"] == "WAITING_HUMAN"
    bounded = runtime(FakeTools(status="PENDING_APPROVAL", approval_state="NONE"), max_steps=10)
    bounded.start(RUN, RR, "goal", PARAMS)
    results = [bounded.resume(RUN, "APPROVAL_DECIDED", None) for _ in range(5)]
    assert results[-1]["error_code"] == "LOOP_LIMIT_REACHED"


def test_a_resume_claiming_approval_does_not_count_when_the_backend_still_says_pending():
    tools = FakeTools(status="PENDING_APPROVAL", approval_state="NONE")
    rt = runtime(tools)
    rt.start(RUN, RR, "goal", PARAMS)
    out = rt.resume(RUN, "APPROVAL_DECIDED", {"approved": True})  # the payload is ignored
    assert (out["status"], out["waiting_reason"]) == ("WAITING_HUMAN", "HUMAN_APPROVAL_REQUIRED")
    tools.status = {"status": "APPROVED", "approval_state": "ACTIVE", "replies": []}
    assert rt.resume(RUN, "APPROVAL_DECIDED", None)["waiting_reason"] == "AWAITING_SEND_REQUEST"
    assert sum(1 for c in tools.calls if c[0] == "create_inquiry_draft") == 1  # the draft was not made again


def test_deterministic_branches():
    assert runtime(FakeTools(gaps=[])).start(RUN, RR, "goal", PARAMS)["result_code"] == "NO_INFORMATION_GAPS"
    waiting = runtime(FakeTools(gaps=[gap("ASKED")])).start(RUN, RR, "goal", PARAMS)
    assert (waiting["status"], waiting["waiting_reason"], waiting["pending"]) == ("WAITING_EXTERNAL", "AWAITING_REPLIES", None)
    missing = runtime(FakeTools()).start(RUN, RR, "goal", {})
    assert (missing["status"], missing["error_code"]) == ("FAILED", "INQUIRY_PARAMETERS_REQUIRED")


def test_only_registered_tools_and_allowed_actions():
    tools = FakeTools()
    s = ToolSession(tools, RUN, 0, 5, 0)
    r = s.call("approve_draft", {})
    assert (r.status, r.error.code) == ("REJECTED", "TOOL_NOT_REGISTERED") and tools.calls == []

    class RoguePolicy:
        def choose(self, state: Any) -> str:
            return "send_message"

    out = AgentRuntime(GraphDeps(tools=FakeTools(), policy=RoguePolicy()), InMemorySaver()).start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["error_code"]) == ("FAILED", "POLICY_OUTPUT_INVALID")
    lc = as_langchain_tools(FakeTools(), RUN)
    assert sorted(t.name for t in lc) == sorted(load_registry().names())


def test_step_and_tool_call_limits_end_the_run_with_typed_codes():
    assert runtime(FakeTools(), max_steps=2).start(RUN, RR, "goal", PARAMS)["error_code"] == "LOOP_LIMIT_REACHED"
    tools = FakeTools()
    assert runtime(tools, max_tool_calls=2).start(RUN, RR, "goal", PARAMS)["error_code"] == "TOOL_CALL_LIMIT_REACHED"
    assert len(tools.calls) == 2


def test_retryable_failures_retry_a_bounded_number_of_times_and_others_do_not():
    flaky = FakeTools({"get_information_gaps": lambda a, n: fail("get_information_gaps", "UPSTREAM_TIMEOUT", True) if n == 1 else ok("get_information_gaps", {"gaps": [], "known": []})})
    rt = runtime(flaky, max_retries=2)
    assert rt.start(RUN, RR, "goal", PARAMS)["result_code"] == "NO_INFORMATION_GAPS"
    assert [c[0] for c in flaky.calls].count("get_information_gaps") == 2
    always = FakeTools({"get_information_gaps": lambda a, n: fail("get_information_gaps", "UPSTREAM_TIMEOUT", True)})
    assert runtime(always, max_retries=2).start(RUN, RR, "goal", PARAMS)["error_code"] == "RETRY_LIMIT_REACHED"  # limit code; the cause stays in the call summaries
    assert [c[0] for c in always.calls].count("get_information_gaps") == 3
    scoped = FakeTools({"get_information_gaps": lambda a, n: fail("get_information_gaps", "OUT_OF_SCOPE", False, "REJECTED")})
    assert runtime(scoped, max_retries=2).start(RUN, RR, "goal", PARAMS)["error_code"] == "OUT_OF_SCOPE"
    assert [c[0] for c in scoped.calls].count("get_information_gaps") == 1
    human = FakeTools({"request_approval": lambda a, n: fail("request_approval", "HUMAN_ACTION_REQUIRED", False, "REJECTED")})
    out = runtime(human).start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["waiting_reason"]) == ("WAITING_HUMAN", "HUMAN_ACTION_REQUIRED")


def test_approval_outcome_mapping():
    assert approval_outcome("QUEUED", "ACTIVE") == "APPROVED"
    assert approval_outcome("CLOSED", "NONE") == "WITHDRAWN"
    assert approval_outcome("PENDING_APPROVAL", "NONE") == "PENDING"
    assert approval_outcome("DELIVERY_FAILED", "ACTIVE") == "UNKNOWN"


class FakeBackendStore:
    """In-memory stand-in for /internal/agent-runtime (same contract as the NestJS service)."""

    def __init__(self) -> None:
        self.checkpoints: dict[str, dict[str, Any]] = {}
        self.writes: dict[tuple[str, str, int], dict[str, Any]] = {}
        self.steps: list[dict[str, Any]] = []
        self.raw: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == f"Bearer {TOKEN}" and TOKEN not in str(request.url)
        path = request.url.path
        body = json.loads(request.content) if request.content else None
        if request.content:
            self.raw.append(request.content.decode())
        if path.endswith("/checkpoints") and request.method == "PUT":
            self.checkpoints[body["checkpoint_id"]] = body
            return httpx.Response(200, json={"checkpoint_id": body["checkpoint_id"]})
        if path.endswith("/checkpoint-writes"):
            for w in body["writes"]:
                key = (body["checkpoint_id"], body["task_id"], w["idx"])
                if w["idx"] >= 0 and key in self.writes:
                    continue
                self.writes[key] = {"task_id": body["task_id"], **w}
            return httpx.Response(200, json={"written": len(body["writes"])})
        if path.endswith("/steps"):
            self.steps.extend(body["steps"])
            return httpx.Response(200, json={"recorded": len(body["steps"])})
        if path.endswith("/checkpoints") and request.method == "GET":
            q = request.url.params
            ids = sorted(self.checkpoints, reverse=True)
            if q.get("checkpoint_id"):
                ids = [i for i in ids if i == q["checkpoint_id"]]
            if q.get("before"):
                ids = [i for i in ids if i < q["before"]]
            docs = []
            for i in ids[: int(q.get("limit", "1"))]:
                c = self.checkpoints[i]
                docs.append({**c, "writes": [w for (cid, _, _), w in sorted(self.writes.items()) if cid == i]})
            return httpx.Response(200, json={"checkpoints": docs})
        return httpx.Response(404, json={"code": "NOT_FOUND"})


def test_checkpoints_through_the_backend_survive_a_new_process():
    store = FakeBackendStore()

    def fresh_runtime(tools: FakeTools) -> AgentRuntime:
        api = RuntimeApiClient("http://backend.test", TOKEN, http=httpx.Client(transport=httpx.MockTransport(store.handler)))
        return AgentRuntime(GraphDeps(tools=tools, report_steps=api.report_steps), BackendCheckpointSaver(api))

    first = fresh_runtime(FakeTools())
    assert first.start(RUN, RR, "goal", PARAMS)["status"] == "WAITING_HUMAN"
    assert store.checkpoints and any(w["channel"] == "__interrupt__" for w in store.writes.values())
    del first  # "process exit": nothing of the first runtime is used below

    second_tools = FakeTools()
    out = fresh_runtime(second_tools).resume(RUN, "APPROVAL_DECIDED", {"type": "COMM_MESSAGE", "id": MSG})
    assert (out["status"], out["waiting_reason"]) == ("WAITING_HUMAN", "AWAITING_SEND_REQUEST")
    assert [c[0] for c in second_tools.calls] == ["get_communication_status"]  # continued, did not start over
    nodes = [s["node"] for s in store.steps]
    assert nodes[:4] == ["load_context", "observe_public_data", "inspect_gaps", "choose_next_action"] and nodes[-2:] == ["wait_for_human", "track_message"]
    assert all(re.match(r"^[A-Z][A-Z0-9_]*$", s["outcome"]) for s in store.steps)
    blob = "".join(store.raw) + "".join(base64.b64decode(c["checkpoint"]["b64"]).decode("latin-1") for c in store.checkpoints.values())
    assert TOKEN not in blob


def test_the_first_candidate_without_an_eligible_contact_is_skipped_deterministically():
    other_pool, other_cp = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b2a1", "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b2a2"
    first = {**gap(), "gap_id": "gap:0", "subject_id": other_pool, "owner_counterparty_id": other_cp}
    tools = FakeTools(gaps=[gap(), first])
    out = runtime(tools).start(RUN, RR, "goal", PARAMS)
    assert out["status"] == "WAITING_HUMAN"
    draft = next(c for c in tools.calls if c[0] == "create_inquiry_draft")
    assert draft[1]["target_id"] == POOL and draft[2] == f"{RUN}:gap:1:draft"  # gap:0 (sorted first) has no contact
    assert [c[0] for c in tools.calls].count("find_counterparty") == 1  # one lookup per role


def test_runtime_client_never_shows_its_token():
    api = RuntimeApiClient("http://backend.test", TOKEN)
    assert TOKEN not in repr(api) and TOKEN not in str(vars(api).get("_base_url", ""))


class Crash(BaseException):
    """Process death: not an Exception, so nothing in the runtime catches it."""


class IdempotentBackend(FakeTools):
    """Like the NestJS executor: PROPOSE/REQUEST with the same key return the first result (no second side effect)."""

    def __init__(self, crash_after: str | None = None) -> None:
        super().__init__()
        self.side_effects: dict[str, int] = {}
        self.by_key: dict[str, ToolResult] = {}
        self.crash_after = crash_after

    def call(self, tool: str, arguments: dict[str, Any], *, agent_run_id: str, idempotency_key: str | None = None, traceparent: str | None = None) -> ToolResult:
        if idempotency_key and idempotency_key in self.by_key:
            self.calls.append((tool, arguments, idempotency_key))
            return self.by_key[idempotency_key]
        result = super().call(tool, arguments, agent_run_id=agent_run_id, idempotency_key=idempotency_key)
        if idempotency_key:
            self.by_key[idempotency_key] = result
            self.side_effects[tool] = self.side_effects.get(tool, 0) + 1
        if self.crash_after == tool:
            self.crash_after = None
            raise Crash(tool)  # the backend committed; the graph never saved the node's checkpoint
        return result


def _store_runtime(store: "FakeBackendStore", tools: FakeTools) -> AgentRuntime:
    api = RuntimeApiClient("http://backend.test", TOKEN, http=httpx.Client(transport=httpx.MockTransport(store.handler)))
    return AgentRuntime(GraphDeps(tools=tools), BackendCheckpointSaver(api))


def test_a_crash_after_a_side_effect_but_before_its_checkpoint_does_not_duplicate_it():
    import pytest

    for tool in ("create_inquiry_draft", "request_approval"):
        store = FakeBackendStore()
        backend = IdempotentBackend(crash_after=tool)
        with pytest.raises(Crash):
            _store_runtime(store, backend).start(RUN, RR, "goal", PARAMS)
        # the coordinator retries the same run (new process): it continues from the last checkpoint
        out = _store_runtime(store, backend).start(RUN, RR, "goal", PARAMS)
        assert (out["status"], out["pending"]) == ("WAITING_HUMAN", {"type": "COMM_MESSAGE", "id": MSG})
        assert backend.side_effects == {"create_inquiry_draft": 1, "request_approval": 1}, tool
        assert [c[0] for c in backend.calls].count("get_recovery_context") == 1  # finished nodes are not repeated


def test_resume_of_a_finished_run_reports_the_end_again_and_a_restart_does_not_rerun():
    store = FakeBackendStore()
    tools = FakeTools(gaps=[])
    assert _store_runtime(store, tools).start(RUN, RR, "goal", PARAMS)["result_code"] == "NO_INFORMATION_GAPS"
    n = len(tools.calls)
    assert _store_runtime(store, tools).resume(RUN, "RUNTIME_RETRY", None)["result_code"] == "NO_INFORMATION_GAPS"
    assert _store_runtime(store, tools).start(RUN, RR, "goal", PARAMS)["result_code"] == "NO_INFORMATION_GAPS"
    assert len(tools.calls) == n


def test_backend_store_outage_is_reported_as_transient():
    import pytest

    from cera_ai.agent.runtime import RuntimeUnavailable

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    api = RuntimeApiClient("http://backend.test", TOKEN, http=httpx.Client(transport=httpx.MockTransport(down)))
    with pytest.raises(RuntimeUnavailable):
        AgentRuntime(GraphDeps(tools=FakeTools()), BackendCheckpointSaver(api)).start(RUN, RR, "goal", PARAMS)


# ── T-114 planning: deterministic engine tools · the graph only reads results, waits for a person, re-solves on changed facts ──
PLAN_A = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b2a1"
PLAN_B = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0b2b2"
HASH_A = "sha256:" + "a" * 64
HASH_B = "sha256:" + "b" * 64


def plan_tools(gaps: list[dict[str, Any]] | None = None) -> FakeTools:
    state = {"hash": HASH_A, "plan_id": PLAN_A, "version": 1, "status": "PROPOSED"}

    def plan(**over: Any) -> dict[str, Any]:
        return {"plan_id": state["plan_id"], "recovery_run_id": RR, "version": state["version"], "plan_status": state["status"], "solver_status": "OPTIMAL", "input_hash": state["hash"],
                "objective_krw": 5_815_000, "baseline_total_krw": 7_220_000, "saving_krw": 1_405_000, "outdated_reason_codes": [], "superseded_by_plan_id": None, "approved": False, "reused": False, "note": "n", **over}

    tools = FakeTools(
        {
            "calculate_recovery_costs": lambda a, n: ok("calculate_recovery_costs", {"candidate_count": 23, "feasible_option_count": 117, "excluded_facts": [], "provisional_facts": [{"subject_id": POOL, "fact_key": "k", "reason": "PROVISIONAL"}], "baseline": {"total_krw": 7_220_000}}),
            "solve_recovery": lambda a, n: ok("solve_recovery", {"status": "OPTIMAL", "input_hash": state["hash"], "objective_krw": 5_815_000, "saving_krw": 1_405_000, "changed_count": 12, "unplanned": []}),
            "propose_recovery_plan": lambda a, n: ok("propose_recovery_plan", plan()),
            "get_recovery_plan": lambda a, n: ok("get_recovery_plan", {"plan": plan()}),
        },
        gaps=[] if gaps is None else gaps,
    )
    tools.plan_state = state  # type: ignore[attr-defined]
    return tools


def test_planning_runs_engine_tools_proposes_and_waits_for_a_person():
    tools = plan_tools()
    out = runtime(tools).start(RUN, RR, "goal", {"plan_recovery": True})
    assert (out["status"], out["waiting_reason"], out["pending"]) == ("WAITING_HUMAN", "AWAITING_PLAN_DECISION", {"type": "RECOVERY_PLAN", "id": PLAN_A})
    assert [c[0] for c in tools.calls] == ["get_recovery_context", "get_information_gaps", "calculate_recovery_costs", "solve_recovery", "propose_recovery_plan"]
    propose = tools.calls[-1]
    assert propose[1] == {"expected_input_hash": HASH_A} and propose[2] == f"{RUN}:plan:1:{HASH_A[7:19]}"
    # without the human's request the run ends at the gaps as before (no plan)
    tools2 = plan_tools()
    assert runtime(tools2).start(RUN, RR, "goal", {})["result_code"] == "NO_INFORMATION_GAPS"
    assert "solve_recovery" not in [c[0] for c in tools2.calls]


def test_planning_with_only_provisional_or_review_gaps_still_plans():
    tools = plan_tools(gaps=[gap("PROVISIONAL_AVAILABLE")])
    out = runtime(tools).start(RUN, RR, "goal", {"plan_recovery": True})
    assert out["waiting_reason"] == "AWAITING_PLAN_DECISION"


def test_plan_approved_by_a_person_completes_the_run():
    tools = plan_tools()
    rt = runtime(tools)
    rt.start(RUN, RR, "goal", {"plan_recovery": True})
    tools.plan_state["status"] = "APPROVED"  # type: ignore[attr-defined]
    out = rt.resume(RUN, "PLAN_APPROVED", {"type": "RECOVERY_PLAN", "id": PLAN_A})
    assert (out["status"], out["result_code"]) == ("COMPLETED", "PLAN_APPROVED")
    assert (out["result_summary"]["plan_id"], out["result_summary"]["plan_status"], out["result_summary"]["plan_rounds"]) == (PLAN_A, "APPROVED", 1)
    assert tools.calls[-1][0] == "get_recovery_plan"


def test_outdated_plan_wakes_the_run_to_solve_again_and_propose_v2():
    tools = plan_tools()
    rt = runtime(tools)
    rt.start(RUN, RR, "goal", {"plan_recovery": True})
    # still proposed (spurious wake) → keep waiting, no re-solve
    out = rt.resume(RUN, "PLAN_OUTDATED", {"type": "RECOVERY_PLAN", "id": PLAN_A})
    assert out["waiting_reason"] == "AWAITING_PLAN_DECISION" and [c[0] for c in tools.calls].count("solve_recovery") == 1
    # a fact changed: the backend says OUTDATED → re-read gaps → solve again on the new facts → v2
    tools.plan_state["status"] = "OUTDATED"  # type: ignore[attr-defined]
    original = tools.overrides["solve_recovery"]

    def solve_v2(a: dict[str, Any], n: int) -> ToolResult:
        tools.plan_state.update({"hash": HASH_B, "plan_id": PLAN_B, "version": 2, "status": "PROPOSED"})  # type: ignore[attr-defined]
        return original(a, n)

    tools.overrides["solve_recovery"] = solve_v2
    out = rt.resume(RUN, "PLAN_OUTDATED", {"type": "RECOVERY_PLAN", "id": PLAN_A})
    assert (out["waiting_reason"], out["pending"]) == ("AWAITING_PLAN_DECISION", {"type": "RECOVERY_PLAN", "id": PLAN_B})
    names = [c[0] for c in tools.calls]
    assert names.count("solve_recovery") == 2 and names.count("propose_recovery_plan") == 2
    keys = [c[2] for c in tools.calls if c[0] == "propose_recovery_plan"]
    assert keys == [f"{RUN}:plan:1:{HASH_A[7:19]}", f"{RUN}:plan:2:{HASH_B[7:19]}"]


def test_solver_error_fails_the_run_and_the_graph_never_approves():
    tools = plan_tools()
    tools.overrides["solve_recovery"] = lambda a, n: ok("solve_recovery", {"status": "ERROR", "input_hash": HASH_A, "objective_krw": None, "saving_krw": None, "changed_count": 0, "unplanned": []})
    out = runtime(tools).start(RUN, RR, "goal", {"plan_recovery": True})
    assert (out["status"], out["error_code"]) == ("FAILED", "SOLVER_ERROR")
    assert all(not c[0].startswith("approve") for c in tools.calls)


def test_no_registered_owner_never_guesses_a_recipient_and_waits_for_a_person():
    # 운영 준비: a facility gap without a registered operator is never sent to "the first counterparty of that role"
    site = {**gap(), "gap_id": "gap:f", "gap_kind": "FACILITY_CAPACITY", "subject_type": "FACILITY", "subject_id": "01a1a4c0-7e10-7a3b-9c21-5d0f00a0c001", "suggested_intent": "FACILITY_CAPACITY", "suggested_counterparty_role": "ODCY", "owner_counterparty_id": None}
    tools = FakeTools(gaps=[site])
    rt = runtime(tools)
    out = rt.start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["waiting_reason"], out["pending"]) == ("WAITING_HUMAN", "CONTACT_REGISTRATION_REQUIRED", {"type": "FACILITY", "id": site["subject_id"]})
    assert "create_inquiry_draft" not in [c[0] for c in tools.calls] and "find_counterparty" not in [c[0] for c in tools.calls]
    # the person entered the value directly → the backend no longer lists the gap → the run goes on (not FAILED)
    tools.gaps = []
    done = rt.resume(RUN, "GAP_STATE_CHANGED", None)
    assert (done["status"], done["result_code"]) == ("COMPLETED", "NO_INFORMATION_GAPS")


def test_several_eligible_addresses_of_the_owner_are_not_chosen_arbitrarily():
    two = lambda a, n: ok("find_counterparty", {"counterparties": [{"counterparty_id": CP, "contacts": [{"addresses": [{"address_id": ADDR, "eligible": True}]}, {"addresses": [{"address_id": "01a1a4c0-7e10-7a3b-9c21-5d0f00a0c009", "eligible": True}]}]}]})
    tools = FakeTools({"find_counterparty": two})
    out = runtime(tools).start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["waiting_reason"], out["pending"]["type"]) == ("WAITING_HUMAN", "CONTACT_SELECTION_REQUIRED", "TRUCK_POOL")
    assert "create_inquiry_draft" not in [c[0] for c in tools.calls]


def test_registering_a_contact_wakes_the_run_and_it_drafts_to_the_new_address():
    # T-127: the owner had no eligible address → the run waits for a person; an admin registers + approves one → the backend wakes the run
    # (REGISTRY_CHANGED) → the graph re-reads the registry and drafts to that address. Approval still belongs to a person.
    state = {"eligible": False}
    found = lambda a, n: ok("find_counterparty", {"counterparties": [{"counterparty_id": CP, "contacts": [{"addresses": [{"address_id": ADDR, "eligible": state["eligible"]}]}]}]})
    tools = FakeTools({"find_counterparty": found})
    rt = runtime(tools)
    out = rt.start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["waiting_reason"]) == ("WAITING_HUMAN", "CONTACT_REGISTRATION_REQUIRED")
    assert "create_inquiry_draft" not in [c[0] for c in tools.calls]
    state["eligible"] = True
    woke = rt.resume(RUN, "REGISTRY_CHANGED", {"type": out["pending"]["type"], "id": out["pending"]["id"]})
    drafts = [c for c in tools.calls if c[0] == "create_inquiry_draft"]
    assert len(drafts) == 1 and drafts[0][1]["address_id"] == ADDR
    assert woke["status"] == "WAITING_HUMAN" and woke["waiting_reason"] != "CONTACT_REGISTRATION_REQUIRED"
    assert all(not c[0].startswith("approve") for c in tools.calls)


ADDR2 = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0c009"


def test_a_person_chooses_one_of_several_addresses_and_the_run_drafts_to_that_one_only():
    # T-129: two usable addresses -> the run waits (CONTACT_SELECTION_REQUIRED); a person chooses ADDR2 -> the backend reports it on the gap
    # (selected_address_id, only while it is still usable) and wakes the run (CONTACT_SELECTED) -> one draft, to ADDR2, never to the first one
    two = lambda a, n: ok("find_counterparty", {"counterparties": [{"counterparty_id": CP, "contacts": [{"addresses": [{"address_id": ADDR, "eligible": True}]}, {"addresses": [{"address_id": ADDR2, "eligible": True}]}]}]})
    tools = FakeTools({"find_counterparty": two})
    rt = runtime(tools)
    out = rt.start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["waiting_reason"], out["pending"]) == ("WAITING_HUMAN", "CONTACT_SELECTION_REQUIRED", {"type": "TRUCK_POOL", "id": POOL})
    tools.gaps = [{**gap(), "selected_address_id": ADDR2}]
    woke = rt.resume(RUN, "CONTACT_SELECTED", {"type": "TRUCK_POOL", "id": POOL})
    drafts = [c for c in tools.calls if c[0] == "create_inquiry_draft"]
    assert len(drafts) == 1 and drafts[0][1]["address_id"] == ADDR2
    assert (woke["status"], woke["waiting_reason"]) == ("WAITING_HUMAN", "HUMAN_APPROVAL_REQUIRED")


def test_a_choice_that_is_no_longer_usable_is_ignored_and_the_run_keeps_waiting_for_a_person():
    # the chosen address was paused afterwards: it is no longer eligible -> not used; still two others -> wait again (no guessing)
    two = lambda a, n: ok("find_counterparty", {"counterparties": [{"counterparty_id": CP, "contacts": [{"addresses": [{"address_id": ADDR, "eligible": True}]}, {"addresses": [{"address_id": ADDR2, "eligible": True}]}]}]})
    tools = FakeTools({"find_counterparty": two}, gaps=[{**gap(), "selected_address_id": "01a1a4c0-7e10-7a3b-9c21-5d0f00a0c00a"}])
    out = runtime(tools).start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["waiting_reason"]) == ("WAITING_HUMAN", "CONTACT_SELECTION_REQUIRED")
    assert "create_inquiry_draft" not in [c[0] for c in tools.calls]


def test_the_run_waits_on_the_gap_whose_reason_it_reports():
    # gap:0 (sorted first) has an owner without usable addresses (registration), gap:1 has two (selection) -> reason = selection, and the
    # pending subject is gap:1's pool, not gap:0's: waiting on gap:0 would let the backend wake the run for changes that do not unblock it
    pool0, cp0 = "01a1a4c0-7e10-7a3b-9c21-5d0f00a0c0a1", "01a1a4c0-7e10-7a3b-9c21-5d0f00a0c0aa"
    first = {**gap(), "gap_id": "gap:0", "subject_id": pool0, "owner_counterparty_id": cp0}
    both = lambda a, n: ok("find_counterparty", {"counterparties": [{"counterparty_id": cp0, "contacts": []}, {"counterparty_id": CP, "contacts": [{"addresses": [{"address_id": ADDR, "eligible": True}]}, {"addresses": [{"address_id": ADDR2, "eligible": True}]}]}]})
    tools = FakeTools({"find_counterparty": both}, gaps=[first, gap()])
    out = runtime(tools).start(RUN, RR, "goal", PARAMS)
    assert (out["status"], out["waiting_reason"], out["pending"]) == ("WAITING_HUMAN", "CONTACT_SELECTION_REQUIRED", {"type": "TRUCK_POOL", "id": POOL})
