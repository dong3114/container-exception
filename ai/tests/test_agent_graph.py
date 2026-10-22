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
        self.status = {"status": status, "approval_state": approval_state}
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
    for status, approval, code in [("APPROVED", "ACTIVE", "INQUIRY_APPROVED"), ("REJECTED", "REJECTED", "INQUIRY_REJECTED"), ("APPROVED", "REVOKED", "APPROVAL_WITHDRAWN")]:
        tools = FakeTools(status=status, approval_state=approval)
        rt = runtime(tools)
        rt.start(RUN, RR, "goal", PARAMS)
        out = rt.resume(RUN, "APPROVAL_DECIDED", {"type": "COMM_MESSAGE", "id": MSG})
        assert (out["status"], out["result_code"]) == ("COMPLETED", code)
        assert tools.calls[-1][0] == "get_communication_status"


def test_a_resume_claiming_approval_does_not_count_when_the_backend_still_says_pending():
    tools = FakeTools(status="PENDING_APPROVAL", approval_state="NONE")
    rt = runtime(tools)
    rt.start(RUN, RR, "goal", PARAMS)
    out = rt.resume(RUN, "APPROVAL_DECIDED", {"approved": True})  # the payload is ignored
    assert (out["status"], out["waiting_reason"]) == ("WAITING_HUMAN", "HUMAN_APPROVAL_REQUIRED")
    tools.status = {"status": "APPROVED", "approval_state": "ACTIVE"}
    assert rt.resume(RUN, "APPROVAL_DECIDED", None)["result_code"] == "INQUIRY_APPROVED"
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
    assert runtime(always, max_retries=2).start(RUN, RR, "goal", PARAMS)["error_code"] == "UPSTREAM_TIMEOUT"
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
    assert (out["status"], out["result_code"]) == ("COMPLETED", "INQUIRY_APPROVED")
    assert [c[0] for c in second_tools.calls] == ["get_communication_status"]  # continued, did not start over
    nodes = [s["node"] for s in store.steps]
    assert nodes[:3] == ["load_context", "inspect_gaps", "choose_next_action"] and nodes[-1] == "build_result"
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
