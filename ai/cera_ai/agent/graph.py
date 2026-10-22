"""CeraRecoveryGraph (T-104 · ADR-036) — one LangGraph StateGraph, nodes by responsibility.

    START → load_context → inspect_gaps → choose_next_action
      ├─ COMPLETE      → build_result → END
      ├─ COMMUNICATION → prepare_inquiry → create_draft → request_approval → wait_for_human ⟲ INTERRUPT
      │                    resume → refresh_status ─┬─ APPROVED  → build_result
      │                                             ├─ REJECTED  → build_result
      │                                             ├─ WITHDRAWN → build_result
      │                                             └─ PENDING   → wait_for_human (wait again)
      ├─ PUBLIC_DATA   → fetch_public_data → inspect_gaps (loop, bounded)
      ├─ WAIT_EXTERNAL → wait_external ⟲ INTERRUPT → refresh_context → inspect_gaps
      └─ FAIL          → build_result
    every node: step / tool-call limits checked first → LOOP_LIMIT_REACHED · TOOL_CALL_LIMIT_REACHED → build_result

Rules this graph keeps (ADR-036):
- the graph is **not** an authority: it never approves, sends or confirms; it calls Backend tools only
- the state carries ids, refs and codes — not business rows. After a resume it re-reads business state through tools;
  the resume value (e.g. "approval decided") is a wake-up reason, not a fact
- branching is deterministic code; the policy hook for semantic choices may only return an allowed action
- numbers in an inquiry come from the human who started the run (``parameters.inquiry``) — never invented
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Protocol, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from .tooling import LimitReached, ToolCaller, ToolSession

log = logging.getLogger("cera_ai.agent")
KST = timezone(timedelta(hours=9))
Action = Literal["COMPLETE", "COMMUNICATION", "PUBLIC_DATA", "WAIT_EXTERNAL", "FAIL"]
ACTIONS: tuple[Action, ...] = ("COMPLETE", "COMMUNICATION", "PUBLIC_DATA", "WAIT_EXTERNAL", "FAIL")


class RecoveryState(TypedDict, total=False):
    agent_run_id: str
    recovery_run_id: str
    goal: str
    parameters: dict[str, Any]
    plan_date: str | None
    information_gaps: list[dict[str, Any]]  # gap refs: id · kind · state · subject · role · owner — not facts
    known_fact_refs: list[str]  # event ids
    evidence_refs: list[str]  # raw_input / fetch ids from public data
    target_gap: dict[str, Any] | None
    next_action: str | None
    address_id: str | None
    draft_message_id: str | None
    pending_human_action: dict[str, Any] | None
    approval_outcome: str | None
    last_tool_call: dict[str, Any] | None
    tool_results: list[dict[str, Any]]  # last calls: tool · status · code · tool_call_id
    decision_results: list[dict[str, Any]]
    step_count: int
    tool_call_count: int
    retry_count: int
    errors: list[str]
    halt: str | None  # set when a limit or a non-retryable failure ends the run
    result: dict[str, Any] | None


class NextActionPolicy(Protocol):
    """Chooses the next action from an allowed set. The default is deterministic; a semantic (LLM / decision model)
    policy may be plugged in later but can only return one of ``ACTIONS`` — anything else fails the run."""

    def choose(self, state: RecoveryState) -> str: ...


class DeterministicPolicy:
    def choose(self, state: RecoveryState) -> str:
        if state.get("halt") or state.get("errors"):
            return "FAIL"
        gaps = state.get("information_gaps") or []
        if not gaps:
            return "COMPLETE"
        if any(g.get("public_data_can_resolve") and g.get("state") == "MISSING" for g in gaps):
            return "PUBLIC_DATA"
        if pick_inquiry_gap(gaps):
            return "COMMUNICATION"
        if all(g.get("state") == "ASKED" for g in gaps):
            return "WAIT_EXTERNAL"
        return "FAIL"


def inquiry_candidates(gaps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deterministic order: partner-owned resources first (the owner can answer), trucks before facilities, then id."""
    candidates = [g for g in gaps if g.get("state") == "MISSING" and g.get("suggested_source") == "PARTNER_INQUIRY"]
    return sorted(candidates, key=lambda g: (g.get("owner_counterparty_id") is None, g.get("gap_kind") != "TRUCK_AVAILABILITY", str(g.get("gap_id"))))


def pick_inquiry_gap(gaps: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates = inquiry_candidates(gaps)
    return candidates[0] if candidates else None


@dataclass
class GraphDeps:
    tools: ToolCaller
    max_steps: int = 25
    max_tool_calls: int = 12
    max_retries: int = 2
    policy: NextActionPolicy = field(default_factory=DeterministicPolicy)
    report_steps: Callable[[str, list[dict[str, Any]]], None] | None = None
    clock: Callable[[], datetime] = lambda: datetime.now(KST)


def build_graph(deps: GraphDeps, checkpointer: Any) -> Any:
    g = StateGraph(RecoveryState)

    def node(name: str, fn: Callable[[RecoveryState, ToolSession], dict[str, Any]]) -> Callable[[RecoveryState], dict[str, Any]]:
        def run(state: RecoveryState) -> dict[str, Any]:
            started = deps.clock()
            t0 = time.monotonic()
            steps = state.get("step_count", 0) + 1
            session = ToolSession(deps.tools, state["agent_run_id"], state.get("tool_call_count", 0), deps.max_tool_calls, deps.max_retries)
            if steps > deps.max_steps and name != "build_result":  # the terminal node always runs, so the halt code is reported
                out: dict[str, Any] = {"halt": "LOOP_LIMIT_REACHED"}
            else:
                try:
                    out = fn(state, session)
                except LimitReached as limit:
                    out = {"halt": limit.code}
            out = {**out, **session.updates(), "step_count": steps, "retry_count": state.get("retry_count", 0) + session.retries}
            if session.calls:
                out["tool_results"] = (state.get("tool_results") or [])[-15:] + session.calls
            if "last_tool_call" in out and out["last_tool_call"] is None:
                out.pop("last_tool_call")
            if deps.report_steps:
                outcome = out.get("halt") or (session.calls[-1]["code"] if session.calls and session.calls[-1]["code"] else "SUCCEEDED")
                deps.report_steps(
                    state["agent_run_id"],
                    [
                        {
                            "node": name,
                            "outcome": outcome,
                            "detail_code": out.get("next_action") or out.get("approval_outcome"),
                            "tool_call_id": next((c["tool_call_id"] for c in reversed(session.calls) if c["tool_call_id"]), None),
                            "retry_count": session.retries,
                            "started_at": started.isoformat(timespec="milliseconds"),
                            "finished_at": (started + timedelta(seconds=time.monotonic() - t0)).isoformat(timespec="milliseconds"),
                        }
                    ],
                )
            return out

        return run

    def failed(code: str) -> dict[str, Any]:
        return {"halt": code}

    # ── nodes ──
    def load_context(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        r = s.call("get_recovery_context", {})
        if not r.ok:
            return failed(r.error.code if r.error else "CONTEXT_UNAVAILABLE")
        o = r.output
        return {"plan_date": o["snapshot"]["plan_date"], "known_fact_refs": [x["event_id"] for x in o["latest_observations"]][:50]}

    def inspect_gaps(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        r = s.call("get_information_gaps", {})
        if not r.ok:
            return failed(r.error.code if r.error else "GAPS_UNAVAILABLE")
        keep = ("gap_id", "gap_kind", "subject_type", "subject_id", "state", "public_data_can_resolve", "suggested_source", "suggested_intent", "suggested_counterparty_role", "owner_counterparty_id")
        gaps = [{k: g[k] for k in keep} for g in r.output["gaps"]]
        known = [k["evidence"]["event_id"] for k in r.output["known"]]
        return {"information_gaps": gaps, "known_fact_refs": sorted(set((state.get("known_fact_refs") or []) + known))[:100]}

    def choose_next_action(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        action = deps.policy.choose(state)
        if action not in ACTIONS:
            return {"next_action": "FAIL", "halt": "POLICY_OUTPUT_INVALID"}
        decision = {"node": "choose_next_action", "action": action, "gap_count": len(state.get("information_gaps") or [])}
        update: dict[str, Any] = {"next_action": action, "decision_results": (state.get("decision_results") or [])[-10:] + [decision]}
        if action == "COMMUNICATION":
            update["target_gap"] = pick_inquiry_gap(state.get("information_gaps") or [])
        if action == "FAIL" and not state.get("halt") and not state.get("errors"):
            update["halt"] = "NO_ACTIONABLE_GAP"
        return update

    def prepare_inquiry(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        if not (state.get("parameters") or {}).get("inquiry"):
            return failed("INQUIRY_PARAMETERS_REQUIRED")  # the agent does not invent quantities
        # candidates in the deterministic order; the first one whose counterparty has a Contact-Gate-eligible address wins.
        # One find_counterparty call per role (the backend decides eligibility, not the agent).
        by_role: dict[str, list[dict[str, Any]]] = {}
        for gap in inquiry_candidates(state.get("information_gaps") or []):
            role = gap.get("suggested_counterparty_role")
            if role not in by_role:
                r = s.call("find_counterparty", {"role": role, "eligible_only": True})
                if not r.ok:
                    return failed(r.error.code if r.error else "COUNTERPARTY_UNAVAILABLE")
                by_role[role] = r.output["counterparties"]
            owner = gap.get("owner_counterparty_id")
            parties = sorted(by_role[role], key=lambda c: c["counterparty_id"])
            if owner:
                parties = [c for c in parties if c["counterparty_id"] == owner]
            for party in parties:
                for contact in party["contacts"]:
                    for address in contact["addresses"]:
                        if address["eligible"]:
                            return {"target_gap": gap, "address_id": address["address_id"]}
        return failed("NO_ELIGIBLE_CONTACT")

    def create_draft(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        gap = state["target_gap"] or {}
        inquiry = state["parameters"]["inquiry"]
        values: list[dict[str, Any]] = [{"key": "date", "value_text": state.get("plan_date")}]
        if gap.get("suggested_intent") == "TRUCK_SLOT":
            values = [{"key": "quantity", "value_number": inquiry["quantity"], "unit": "TRUCK"}, *values,
                      {"key": "window_from", "value_text": inquiry.get("window_from", "09:00")}, {"key": "window_to", "value_text": inquiry.get("window_to", "18:00")}]
        else:
            values = [{"key": "quantity", "value_number": inquiry["quantity"], "unit": "CONTAINER"}, *values]
        args = {"address_id": state["address_id"], "intent": gap.get("suggested_intent"), "target_id": gap.get("subject_id"), "values": values}
        r = s.call("create_inquiry_draft", args, idempotency_key=f"{state['agent_run_id']}:{gap.get('gap_id')}:draft")
        if not r.ok:
            return failed(r.error.code if r.error else "DRAFT_FAILED")
        if not r.output["number_check_passed"]:
            return failed("HUMAN_EDIT_REQUIRED")
        return {"draft_message_id": r.output["message"]["message_id"]}

    def request_approval(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        message_id = state["draft_message_id"]
        r = s.call("request_approval", {"message_id": message_id}, idempotency_key=f"{state['agent_run_id']}:{message_id}:approval")
        if r.ok or (r.error and r.error.code == "HUMAN_ACTION_REQUIRED"):
            return {"pending_human_action": {"kind": "APPROVAL", "ref_type": "COMM_MESSAGE", "ref_id": message_id, "reason": "HUMAN_APPROVAL_REQUIRED" if r.ok else "HUMAN_ACTION_REQUIRED"}}
        return failed(r.error.code if r.error else "APPROVAL_REQUEST_FAILED")

    def wait_for_human(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        pending = state["pending_human_action"] or {}
        # pause here; the backend resumes when the awaited decision happens. The resume value is a reason only.
        interrupt({"waiting": "HUMAN", "reason": pending.get("reason", "HUMAN_APPROVAL_REQUIRED"), "ref_type": pending.get("ref_type"), "ref_id": pending.get("ref_id")})
        return {}

    def refresh_status(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        r = s.call("get_communication_status", {"message_id": state["draft_message_id"]})
        if not r.ok:
            return failed(r.error.code if r.error else "STATUS_UNAVAILABLE")
        m = r.output["messages"][0]
        return {"approval_outcome": approval_outcome(m["status"], m["approval_state"])}

    def fetch_public_data(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        day = state.get("plan_date")
        r = s.call("get_vessel_calls", {"from_date": day, "to_date": day})
        if not r.ok:
            return failed(r.error.code if r.error else "PUBLIC_DATA_FAILED")
        refs = sorted({p["fetch_id"] for p in r.output["summary"]["pages"]})
        return {"evidence_refs": ((state.get("evidence_refs") or []) + refs)[-50:]}

    def wait_external(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        interrupt({"waiting": "EXTERNAL", "reason": "AWAITING_REPLIES", "ref_type": None, "ref_id": None})
        return {}

    def build_result(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        halt = state.get("halt")
        if halt:
            return {"result": {"status": "FAILED", "result_code": None, "error_code": halt}}
        action = state.get("next_action")
        if action == "COMPLETE":
            return {"result": {"status": "COMPLETED", "result_code": "NO_INFORMATION_GAPS", "error_code": None}}
        outcome = state.get("approval_outcome")
        code = {"APPROVED": "INQUIRY_APPROVED", "REJECTED": "INQUIRY_REJECTED", "WITHDRAWN": "APPROVAL_WITHDRAWN"}.get(outcome or "", None)
        if code:
            return {"result": {"status": "COMPLETED", "result_code": code, "error_code": None}}
        return {"result": {"status": "FAILED", "result_code": None, "error_code": "UNEXPECTED_END"}}

    for name, fn in [
        ("load_context", load_context), ("inspect_gaps", inspect_gaps), ("choose_next_action", choose_next_action),
        ("prepare_inquiry", prepare_inquiry), ("create_draft", create_draft), ("request_approval", request_approval),
        ("wait_for_human", wait_for_human), ("refresh_status", refresh_status), ("fetch_public_data", fetch_public_data),
        ("wait_external", wait_external), ("refresh_context", load_context), ("build_result", build_result),
    ]:
        g.add_node(name, node(name, fn))

    def ok(next_node: str) -> Callable[[RecoveryState], str]:
        return lambda state: "build_result" if state.get("halt") else next_node

    g.add_edge(START, "load_context")
    g.add_conditional_edges("load_context", ok("inspect_gaps"), ["inspect_gaps", "build_result"])
    g.add_conditional_edges("inspect_gaps", ok("choose_next_action"), ["choose_next_action", "build_result"])
    g.add_conditional_edges(
        "choose_next_action",
        lambda state: "build_result" if state.get("halt") else {"COMPLETE": "build_result", "COMMUNICATION": "prepare_inquiry", "PUBLIC_DATA": "fetch_public_data", "WAIT_EXTERNAL": "wait_external"}.get(state.get("next_action") or "", "build_result"),
        ["build_result", "prepare_inquiry", "fetch_public_data", "wait_external"],
    )
    g.add_conditional_edges("prepare_inquiry", ok("create_draft"), ["create_draft", "build_result"])
    g.add_conditional_edges("create_draft", ok("request_approval"), ["request_approval", "build_result"])
    g.add_conditional_edges("request_approval", ok("wait_for_human"), ["wait_for_human", "build_result"])
    g.add_edge("wait_for_human", "refresh_status")
    g.add_conditional_edges(
        "refresh_status",
        lambda state: "build_result" if state.get("halt") else ("wait_for_human" if state.get("approval_outcome") == "PENDING" else "build_result"),
        ["wait_for_human", "build_result"],
    )
    g.add_conditional_edges("fetch_public_data", ok("inspect_gaps"), ["inspect_gaps", "build_result"])
    g.add_edge("wait_external", "refresh_context")
    g.add_conditional_edges("refresh_context", ok("inspect_gaps"), ["inspect_gaps", "build_result"])
    g.add_edge("build_result", END)
    return g.compile(checkpointer=checkpointer)


def approval_outcome(status: str, approval_state: str) -> str:
    """Authoritative backend status → branch. Never taken from the resume value."""
    if status in ("SENT", "REPLIED", "QUEUED") or (status == "APPROVED" and approval_state == "ACTIVE"):
        return "APPROVED"
    if status == "REJECTED" or approval_state == "REJECTED":
        return "REJECTED"
    if approval_state in ("REVOKED", "INVALIDATED", "EXPIRED") or status == "CLOSED":
        return "WITHDRAWN"
    if status in ("PENDING_APPROVAL", "DRAFTED"):
        return "PENDING"
    return "UNKNOWN"
