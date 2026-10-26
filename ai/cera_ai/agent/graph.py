"""CeraRecoveryGraph (T-104 · T-105 · ADR-036) — one LangGraph StateGraph, nodes by responsibility.

    START → load_context → observe_public_data (only when the human gave a window) → inspect_gaps → choose_next_action
      ├─ COMPLETE      → build_result → END
      ├─ COMMUNICATION → prepare_inquiry → create_draft → request_approval → wait_for_human ⟲ INTERRUPT(HUMAN)
      │     → track_message (authoritative status) ─┬─ PENDING            → wait_for_human
      │                                             ├─ AWAIT_SEND_REQUEST → wait_send_request ⟲ INTERRUPT(HUMAN) → track_message
      │                                             ├─ AWAIT_DELIVERY     → wait_delivery ⟲ INTERRUPT(EXTERNAL) → track_message
      │                                             ├─ AWAIT_REPLY        → wait_reply ⟲ INTERRUPT(EXTERNAL) → track_message
      │                                             ├─ REPLY_READY        → read_reply → reassess_gaps ─┬─ PROVISIONAL → wait_fact_verification ⟲ INTERRUPT(HUMAN) → reassess_gaps
      │                                             │                                               └─ otherwise   → build_result
      │                                             └─ REJECTED · WITHDRAWN · DELIVERY_FAILED → build_result
      ├─ PUBLIC_DATA   → fetch_public_data → inspect_gaps (loop, bounded)
      ├─ WAIT_EXTERNAL → wait_external ⟲ INTERRUPT → refresh_context → inspect_gaps
      └─ FAIL          → build_result
    every node: step limit (whole run) / tool-call limit (per active stretch between waits) → LOOP_LIMIT_REACHED · TOOL_CALL_LIMIT_REACHED

The agent never sends: after approval a person requests the send, the backend Outbox/Worker sends (T-090 rules),
and the graph only observes the message status and waits. A reply's extraction candidates are suggestions: the backend
may promote a validated one to a *provisional* fact (never confirmed). While a provisional fact waits for a person, the run
waits too (AWAITING_FACT_VERIFICATION) and re-reads the gap when the fact changes — only a human confirmation closes the gap (T-093).

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
HUMAN_HELD_STATES = ("PROVISIONAL_AVAILABLE", "NEEDS_REVIEW")  # a value exists but a person must confirm / decide — not a gap the agent can ask about
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
    message_phase: str | None  # PENDING · AWAIT_SEND_REQUEST · AWAIT_DELIVERY · AWAIT_REPLY · REPLY_READY · REJECTED · WITHDRAWN · DELIVERY_FAILED
    public_data: dict[str, Any] | None  # mode · outcome · counts · fetch ids — provenance refs, not facts
    reply_summary: dict[str, Any] | None  # counts · fields · extraction ids · outcome — never the reply text
    reassessment: dict[str, Any] | None  # business gap state vs candidate state after the reply
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
        if all(g.get("state") in HUMAN_HELD_STATES or g.get("state") == "ASKED" for g in gaps):
            # what is left is already asked (a reply may come) or waits for a person (confirmation / review) — nothing for the agent to ask
            return "WAIT_EXTERNAL" if any(g.get("state") == "ASKED" for g in gaps) else "COMPLETE"
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
    # emergency ceilings [ASSUMPTION / DEVELOPMENT SAFETY CEILING] — stop runaway execution, not slow normal work. Lowered from observed distributions
    max_steps: int = 100
    max_tool_calls: int = 50
    max_retries: int = 3
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
            if name in WAIT_NODES:
                out["tool_call_count"] = 0  # a new active stretch begins after a wait; the step limit still bounds the whole run
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
                            "detail_code": out.get("next_action") or out.get("message_phase") or (out.get("reply_summary") or {}).get("outcome") or (out.get("reassessment") or {}).get("candidate_state"),
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
        keep = ("gap_id", "gap_kind", "subject_type", "subject_id", "state", "public_data_can_resolve", "suggested_source", "suggested_intent", "suggested_counterparty_role", "owner_counterparty_id", "candidate_state")
        gaps = [{k: g.get(k) for k in keep} for g in r.output["gaps"]]
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

    def track_message(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        # the only source of what happened to the inquiry: the backend's current status (never the resume value)
        r = s.call("get_communication_status", {"message_id": state["draft_message_id"]})
        if not r.ok:
            return failed(r.error.code if r.error else "STATUS_UNAVAILABLE")
        m = r.output["messages"][0]
        phase = message_phase(m)
        return {"message_phase": phase, "approval_outcome": approval_outcome(m["status"], m["approval_state"])}

    def _wait(waiting: str, reason: str) -> Callable[[RecoveryState, ToolSession], dict[str, Any]]:
        def wait(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
            interrupt({"waiting": waiting, "reason": reason, "ref_type": "COMM_MESSAGE", "ref_id": state["draft_message_id"]})
            return {}

        return wait

    def observe_public_data(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        # context only: real public observations with provenance. A failure is recorded, it does not end the run
        window = (state.get("parameters") or {}).get("public_data") or {}
        if not window.get("from_date"):
            return {}
        r = s.call("get_vessel_calls", {"from_date": window["from_date"], "to_date": window.get("to_date") or window["from_date"]})
        if not r.ok:
            return {"public_data": {"outcome": f"TOOL_{r.status}", "error_code": r.error.code if r.error else None}}
        summary = r.output["summary"]
        refs = sorted({p["fetch_id"] for p in summary["pages"]})
        return {
            "public_data": {"mode": summary.get("mode"), "outcome": summary.get("outcome"), "vessel_call_count": len(r.output.get("items") or []), "fetch_ids": refs[:20]},
            "evidence_refs": ((state.get("evidence_refs") or []) + refs)[-50:],
        }

    def read_reply(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        r = s.call("get_reply_candidates", {"message_id": state["draft_message_id"]})
        if not r.ok:
            return failed(r.error.code if r.error else "REPLY_UNAVAILABLE")
        replies = r.output["replies"]
        candidates = [c for rep in replies for c in rep["candidates"]]
        passed = [c for c in candidates if c["validation"] == "PASSED" and c["review_status"] == "PENDING"]  # validated but not promoted: a person decides
        promoted = [c for c in candidates if c["validation"] == "PASSED" and c["review_status"] == "ACCEPTED"]  # became a provisional fact
        if passed:
            outcome = "CANDIDATES_RECEIVED"
        elif promoted:
            outcome = "FACTS_PROMOTED"
        elif replies and all(rep["extraction_state"] == "FAILED" for rep in replies):
            outcome = "EXTRACTION_FAILED"
        else:
            outcome = "NO_VALID_CANDIDATE"
        return {
            "reply_summary": {
                "outcome": outcome,
                "reply_count": len(replies),
                "candidate_fields": sorted({c["field"] for c in passed + promoted}),
                "extraction_ids": sorted(c["extraction_id"] for c in passed)[:50],
                "fact_event_ids": sorted({c["fact_event_id"] for c in promoted if c.get("fact_event_id")})[:50],
                "rejected_count": sum(1 for c in candidates if c["validation"] == "REJECTED"),
                "generated_by": sorted({c["generated_by"] for c in candidates}),
            }
        }

    def reassess_gaps(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        # workflow vs truth: the backend decides what became of the reply (promoted to a provisional fact, or left for a person).
        # The business gap closes only when a human-confirmed fact exists (T-093) — the graph never turns a candidate into a fact.
        r = s.call("get_information_gaps", {})
        if not r.ok:
            return failed(r.error.code if r.error else "GAPS_UNAVAILABLE")
        target = (state.get("target_gap") or {}).get("gap_id")
        gap = next((g for g in r.output["gaps"] if g["gap_id"] == target), None)
        return {
            "reassessment": {
                "business_gap_state": gap["state"] if gap else "KNOWN",
                "candidate_state": gap.get("candidate_state", "NONE") if gap else "NONE",
                "open_gap_count": len(r.output["gaps"]),
            }
        }

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
        summary = result_summary(state)
        halt = state.get("halt")
        if halt:
            return {"result": {"status": "FAILED", "result_code": None, "error_code": halt, "summary": summary}}
        if state.get("next_action") == "COMPLETE":
            held = any(g.get("state") in HUMAN_HELD_STATES for g in state.get("information_gaps") or [])
            return {"result": {"status": "COMPLETED", "result_code": "OPEN_GAPS_AWAIT_HUMAN" if held else "NO_INFORMATION_GAPS", "error_code": None, "summary": summary}}
        reply = state.get("reply_summary")
        if reply:
            return {"result": {"status": "COMPLETED", "result_code": reply_result_code(reply, state.get("reassessment") or {}), "error_code": None, "summary": summary}}
        phase = state.get("message_phase")
        if phase == "DELIVERY_FAILED":
            return {"result": {"status": "FAILED", "result_code": None, "error_code": "DELIVERY_FAILED", "summary": summary}}
        code = {"REJECTED": "INQUIRY_REJECTED", "WITHDRAWN": "APPROVAL_WITHDRAWN"}.get(phase or "")
        if code:
            return {"result": {"status": "COMPLETED", "result_code": code, "error_code": None, "summary": summary}}
        return {"result": {"status": "FAILED", "result_code": None, "error_code": "UNEXPECTED_END", "summary": summary}}

    for name, fn in [
        ("load_context", load_context), ("inspect_gaps", inspect_gaps), ("choose_next_action", choose_next_action),
        ("prepare_inquiry", prepare_inquiry), ("create_draft", create_draft), ("request_approval", request_approval),
        ("wait_for_human", wait_for_human), ("track_message", track_message), ("fetch_public_data", fetch_public_data),
        ("wait_external", wait_external), ("refresh_context", load_context), ("build_result", build_result),
        ("observe_public_data", observe_public_data), ("wait_send_request", _wait("HUMAN", "AWAITING_SEND_REQUEST")),
        ("wait_delivery", _wait("EXTERNAL", "AWAITING_DELIVERY")), ("wait_reply", _wait("EXTERNAL", "AWAITING_REPLY")),
        ("read_reply", read_reply), ("reassess_gaps", reassess_gaps), ("wait_fact_verification", _wait("HUMAN", "AWAITING_FACT_VERIFICATION")),
    ]:
        g.add_node(name, node(name, fn))

    def ok(next_node: str) -> Callable[[RecoveryState], str]:
        return lambda state: "build_result" if state.get("halt") else next_node

    g.add_edge(START, "load_context")
    g.add_conditional_edges("load_context", ok("observe_public_data"), ["observe_public_data", "build_result"])
    g.add_conditional_edges("observe_public_data", ok("inspect_gaps"), ["inspect_gaps", "build_result"])
    g.add_conditional_edges("inspect_gaps", ok("choose_next_action"), ["choose_next_action", "build_result"])
    g.add_conditional_edges(
        "choose_next_action",
        lambda state: "build_result" if state.get("halt") else {"COMPLETE": "build_result", "COMMUNICATION": "prepare_inquiry", "PUBLIC_DATA": "fetch_public_data", "WAIT_EXTERNAL": "wait_external"}.get(state.get("next_action") or "", "build_result"),
        ["build_result", "prepare_inquiry", "fetch_public_data", "wait_external"],
    )
    g.add_conditional_edges("prepare_inquiry", ok("create_draft"), ["create_draft", "build_result"])
    g.add_conditional_edges("create_draft", ok("request_approval"), ["request_approval", "build_result"])
    g.add_conditional_edges("request_approval", ok("wait_for_human"), ["wait_for_human", "build_result"])
    g.add_edge("wait_for_human", "track_message")
    phase_next = {"PENDING": "wait_for_human", "AWAIT_SEND_REQUEST": "wait_send_request", "AWAIT_DELIVERY": "wait_delivery", "AWAIT_REPLY": "wait_reply", "REPLY_READY": "read_reply"}
    g.add_conditional_edges(
        "track_message",
        lambda state: "build_result" if state.get("halt") else phase_next.get(state.get("message_phase") or "", "build_result"),
        ["wait_for_human", "wait_send_request", "wait_delivery", "wait_reply", "read_reply", "build_result"],
    )
    for w in ("wait_send_request", "wait_delivery", "wait_reply"):
        g.add_edge(w, "track_message")
    g.add_conditional_edges("read_reply", ok("reassess_gaps"), ["reassess_gaps", "build_result"])
    # a provisional fact waits for a person: the run waits with it, then re-reads the gap (confirmed → closed · rejected / corrected → re-read)
    g.add_conditional_edges(
        "reassess_gaps",
        lambda state: "wait_fact_verification" if not state.get("halt") and (state.get("reassessment") or {}).get("business_gap_state") == "PROVISIONAL_AVAILABLE" else "build_result",
        ["wait_fact_verification", "build_result"],
    )
    g.add_edge("wait_fact_verification", "reassess_gaps")
    g.add_conditional_edges("fetch_public_data", ok("inspect_gaps"), ["inspect_gaps", "build_result"])
    g.add_edge("wait_external", "refresh_context")
    g.add_conditional_edges("refresh_context", ok("inspect_gaps"), ["inspect_gaps", "build_result"])
    g.add_edge("build_result", END)
    return g.compile(checkpointer=checkpointer)


WAIT_NODES = ("wait_for_human", "wait_send_request", "wait_delivery", "wait_reply", "wait_external", "wait_fact_verification")
EXTRACTION_SETTLED = ("DONE", "NO_CANDIDATE", "SKIPPED", "FAILED")


def message_phase(m: dict[str, Any]) -> str:
    """Authoritative message status → where the inquiry is. Same meaning as the backend's wake rules (wake-rules.ts)."""
    status = m["status"]
    if status in ("SENT", "REPLIED"):
        replies = [r for r in m.get("replies") or [] if r.get("status") == "NORMAL"]
        return "REPLY_READY" if any(r.get("extraction_state") in EXTRACTION_SETTLED for r in replies) else "AWAIT_REPLY"
    if status == "QUEUED":
        return "AWAIT_DELIVERY"
    if status == "DELIVERY_FAILED":
        return "DELIVERY_FAILED"
    outcome = approval_outcome(status, m["approval_state"])
    return "AWAIT_SEND_REQUEST" if outcome == "APPROVED" else outcome


def reply_result_code(reply: dict[str, Any], reassessment: dict[str, Any]) -> str:
    """What the run found after reading the reply — decided by the backend's gap state, not by the agent's reading of the candidates."""
    gap_state = reassessment.get("business_gap_state")
    if reply["outcome"] == "CANDIDATES_RECEIVED":
        return "CANDIDATE_RECEIVED_PENDING_CONFIRMATION"  # validated but the backend did not promote it — a person must look
    if gap_state == "KNOWN":
        return "FACT_CONFIRMED"
    if gap_state == "NEEDS_REVIEW":
        return "FACT_NEEDS_HUMAN_REVIEW"
    if gap_state == "PROVISIONAL_AVAILABLE":
        return "FACT_AWAITING_CONFIRMATION"
    if reply["outcome"] == "FACTS_PROMOTED":
        return "FACT_REJECTED_GAP_OPEN"  # the provisional fact was rejected / withdrawn — the gap is open again
    return "REPLY_NEEDS_HUMAN_REVIEW"


def result_summary(state: RecoveryState) -> dict[str, Any]:
    """What the run found — codes, ids, counts only (stored on the run for the operator screen)."""
    gap = state.get("target_gap") or {}
    pub = state.get("public_data") or {}
    reply = state.get("reply_summary") or {}
    re_ = state.get("reassessment") or {}
    out: dict[str, Any] = {
        "target_gap_id": gap.get("gap_id"),
        "gap_kind": gap.get("gap_kind"),
        "subject_id": gap.get("subject_id"),
        "message_id": state.get("draft_message_id"),
        "message_phase": state.get("message_phase"),
        "reply_outcome": reply.get("outcome"),
        "reply_count": reply.get("reply_count"),
        "candidate_fields": reply.get("candidate_fields"),
        "candidate_extraction_ids": reply.get("extraction_ids"),
        "fact_event_ids": reply.get("fact_event_ids"),
        "business_gap_state": re_.get("business_gap_state"),
        "candidate_state": re_.get("candidate_state"),
        "facts_confirmed": re_.get("business_gap_state") == "KNOWN",  # only the backend's gap state says so — this graph never confirms
        "public_data_mode": pub.get("mode"),
        "public_data_outcome": pub.get("outcome"),
        "public_vessel_call_count": pub.get("vessel_call_count"),
        "public_fetch_ids": pub.get("fetch_ids"),
        "step_count": state.get("step_count"),
    }
    return {k: v for k, v in out.items() if v is not None}


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
