"""CeraRecoveryGraph (T-104 · T-105 · ADR-036) — one LangGraph StateGraph, nodes by responsibility.

    START → load_context → observe_public_data (only when the human gave a window) → inspect_gaps → choose_next_action
      ├─ COMPLETE      → build_result → END
      ├─ COMMUNICATION → prepare_inquiry → create_draft → request_approval → wait_for_human ⟲ INTERRUPT(HUMAN)
      │     → track_message (authoritative status) ─┬─ PENDING            → wait_for_human
      │                                             ├─ AWAIT_SEND_REQUEST → wait_send_request ⟲ INTERRUPT(HUMAN) → track_message
      │                                             ├─ AWAIT_DELIVERY     → wait_delivery ⟲ INTERRUPT(EXTERNAL) → track_message
      │                                             ├─ AWAIT_REPLY        → wait_reply ⟲ INTERRUPT(EXTERNAL) → track_message
      │                                             ├─ REPLY_READY        → read_reply → reassess_gaps ─┬─ PROVISIONAL → wait_fact_verification ⟲ INTERRUPT(HUMAN) → reassess_gaps
      │                                             │                                               ├─ no usable value · gap open → wait_reply_review ⟲ INTERRUPT(HUMAN) → read_reply
      │                                             │                                               └─ otherwise   → build_result
      │                                             └─ REJECTED · WITHDRAWN · DELIVERY_FAILED → build_result
      ├─ PLAN          → calculate_costs → solve_recovery → propose_plan → wait_plan_decision ⟲ INTERRUPT(HUMAN)
      │     → track_plan (authoritative plan status) ─┬─ APPROVED              → build_result
      │                                               ├─ OUTDATED · SUPERSEDED → refresh_context → inspect_gaps (re-solve on the changed facts)
      │                                               └─ PROPOSED · INFEASIBLE → wait_plan_decision
      ├─ PUBLIC_DATA   → fetch_public_data → inspect_gaps (loop, bounded)
      ├─ WAIT_EXTERNAL → wait_external ⟲ INTERRUPT → refresh_context → inspect_gaps
      └─ FAIL          → build_result
    every node: step limit (whole run) / tool-call limit (per active stretch between waits) → LOOP_LIMIT_REACHED · TOOL_CALL_LIMIT_REACHED

The agent never sends: after approval a person requests the send, the backend Outbox/Worker sends (T-090 rules),
and the graph only observes the message status and waits. A reply's extraction candidates are suggestions: the backend
may promote a validated one to a *provisional* fact (never confirmed). While a provisional fact waits for a person, the run
waits too (AWAITING_FACT_VERIFICATION) and re-reads the gap when the fact changes — only a human confirmation closes the gap (T-093).
A reply that gave no usable value (extraction failed, no answer found, every answer rejected) while the gap is still open is
not a finished job: the run waits for a person (REPLY_REVIEW_REQUIRED) — who asks for another extraction or enters the fact —
and re-reads the reply when either changes something (T-124). "A reply arrived" is not "the question was answered".

Rules this graph keeps (ADR-036):
- the graph is **not** an authority: it never approves, sends or confirms; it calls Backend tools only
- the state carries ids, refs and codes — not business rows. After a resume it re-reads business state through tools;
  the resume value (e.g. "approval decided") is a wake-up reason, not a fact
- branching is deterministic code; the policy hook for semantic choices may only return an allowed action
- numbers in an inquiry come from the human who started the run (``parameters.inquiry``) — never invented
- plans (T-114, only when the human asked for it: ``parameters.plan_recovery``): costs and the assignment come from the
  backend's deterministic cost engine and solver tools; the graph never computes, edits or chooses a plan and never approves
  one. With planning on, a provisional fact does not stop the run — the engine uses it with a penalty and a warning, and when
  a person confirms or withdraws it the plan becomes OUTDATED and the run wakes up to solve again
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
# T-136: an ASKED gap whose reply came but gave nothing usable (or a validated candidate waits for a person) is no longer waiting for the partner
REPLY_HANDED_TO_PERSON = ("NO_VALID_CANDIDATE", "CANDIDATE_RECEIVED")


def awaiting_reply(g: dict[str, Any]) -> bool:
    """Still waiting for the partner's answer — same rule as the backend wake rule (wake-rules.ts repliesWakeReason)."""
    return g.get("state") == "ASKED" and g.get("candidate_state") not in REPLY_HANDED_TO_PERSON
Action = Literal["COMPLETE", "COMMUNICATION", "PUBLIC_DATA", "WAIT_EXTERNAL", "PLAN", "FAIL"]
ACTIONS: tuple[Action, ...] = ("COMPLETE", "COMMUNICATION", "PUBLIC_DATA", "WAIT_EXTERNAL", "PLAN", "FAIL")


class RecoveryState(TypedDict, total=False):
    agent_run_id: str
    recovery_run_id: str
    goal: str
    parameters: dict[str, Any]
    plan_date: str | None
    information_gaps: list[dict[str, Any]]  # gap refs: id · kind · state · subject · role · owner — not facts
    contact_blocked_gaps: list[dict[str, Any]]  # gaps nobody can be asked about yet (no owner · no / several eligible addresses)
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
    plan_costs: dict[str, Any] | None  # cost engine summary — counts and engine totals, not a judgement
    solve: dict[str, Any] | None  # solver summary: status · input_hash · engine objective / saving
    plan: dict[str, Any] | None  # the proposed plan version: id · version · status (the backend's)
    plan_rounds: int  # how many times this run proposed a plan (re-solve after facts changed)
    stale_plan_input: bool  # T-136: the inputs changed between solve and propose — nothing was stored, solve again
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
        # the human decides whether this run goes on to a plan; the plan itself is the backend engine's
        done = "PLAN" if (state.get("parameters") or {}).get("plan_recovery") else "COMPLETE"
        if not gaps:
            return done
        if any(g.get("public_data_can_resolve") and g.get("state") == "MISSING" for g in gaps):
            return "PUBLIC_DATA"
        if pick_inquiry_gap(gaps):
            return "COMMUNICATION"
        if all(g.get("state") in HUMAN_HELD_STATES or g.get("state") == "ASKED" for g in gaps):
            # what is left is already asked (a reply may come) or waits for a person (confirmation / review) — nothing for the agent to ask
            return "WAIT_EXTERNAL" if any(awaiting_reply(g) for g in gaps) else done
        return "FAIL"


def inquiry_candidates(gaps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deterministic order: partner-owned resources first (the owner can answer), trucks before facilities, then id."""
    # MISSING = never known · NEEDS_REFRESH = the known value went stale / expired or was withdrawn (T-111) — both are asked again
    candidates = [g for g in gaps if g.get("state") in ("MISSING", "NEEDS_REFRESH") and g.get("suggested_source") == "PARTNER_INQUIRY"]
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
                            "detail_code": out.get("next_action") or out.get("message_phase") or (out.get("reply_summary") or {}).get("outcome") or (out.get("reassessment") or {}).get("candidate_state") or (out.get("plan") or {}).get("plan_status") or (out.get("solve") or {}).get("status"),
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
        keep = ("gap_id", "gap_kind", "subject_type", "subject_id", "state", "public_data_can_resolve", "suggested_source", "suggested_intent", "suggested_counterparty_role", "owner_counterparty_id", "selected_address_id", "candidate_state", "refresh_basis_event_id")
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
        # candidates in the deterministic order. The recipient is the gap's owner from the registry only (truck pool owner ·
        # facility operator) — never "the first counterparty with this role", which could ask one company about another's site.
        # The owner must have exactly one Contact-Gate-eligible address: none → skip, several → a person chooses (no guessing).
        # One find_counterparty call per role (the backend decides eligibility, not the agent).
        by_role: dict[str, list[dict[str, Any]]] = {}
        blocked: list[dict[str, Any]] = []
        for gap in inquiry_candidates(state.get("information_gaps") or []):
            owner = gap.get("owner_counterparty_id")
            if not owner:
                blocked.append({"gap_id": gap["gap_id"], "subject_type": gap.get("subject_type"), "subject_id": gap.get("subject_id"), "reason": "NO_OWNER_REGISTERED"})
                continue
            role = gap.get("suggested_counterparty_role")
            if role not in by_role:
                r = s.call("find_counterparty", {"role": role, "eligible_only": True})
                if not r.ok:
                    return failed(r.error.code if r.error else "COUNTERPARTY_UNAVAILABLE")
                by_role[role] = r.output["counterparties"]
            eligible = [a["address_id"] for c in by_role[role] if c["counterparty_id"] == owner for contact in c["contacts"] for a in contact["addresses"] if a["eligible"]]
            # T-129: a person chose the recipient for this run and this subject, and it is still usable -> that one only
            chosen = gap.get("selected_address_id")
            if chosen and chosen in eligible:
                return {"target_gap": gap, "address_id": chosen, "contact_blocked_gaps": []}
            if len(eligible) == 1:
                return {"target_gap": gap, "address_id": eligible[0], "contact_blocked_gaps": []}
            blocked.append({"gap_id": gap["gap_id"], "subject_type": gap.get("subject_type"), "subject_id": gap.get("subject_id"), "reason": "CONTACT_SELECTION_REQUIRED" if eligible else "NO_ELIGIBLE_CONTACT"})
        # nobody can be asked: not a failure of the run — a person registers / chooses a contact or enters the value directly
        reason = "CONTACT_SELECTION_REQUIRED" if any(b["reason"] == "CONTACT_SELECTION_REQUIRED" for b in blocked) else "CONTACT_REGISTRATION_REQUIRED"
        if not blocked:
            return failed("NO_ACTIONABLE_GAP")
        # the run waits on the first blocked gap with that reason (facility / truck pool): it wakes when that gap is no longer open,
        # or when the reason can be acted on (a person chose · an address became usable). Waiting on a gap with a different reason
        # would make the backend wake the run for a change that does not unblock it (T-129).
        first = next(b for b in blocked if (b["reason"] == "CONTACT_SELECTION_REQUIRED") == (reason == "CONTACT_SELECTION_REQUIRED"))
        return {"contact_blocked_gaps": blocked[:20], "pending_human_action": {"kind": "CONTACT", "ref_type": first["subject_type"], "ref_id": first["subject_id"], "reason": reason}}

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
        # a refresh of a stale / withdrawn value is a new question: the basis is part of the key (a retry still returns the same draft)
        basis = gap.get("refresh_basis_event_id")
        key = f"{state['agent_run_id']}:{gap.get('gap_id')}:draft" + (f":r{basis[-12:]}" if basis else "")  # keys are <= 100 chars
        r = s.call("create_inquiry_draft", args, idempotency_key=key)
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

    # ── planning (T-114): deterministic engine tools only — the graph reads results, it never makes numbers ──
    def calculate_costs(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        r = s.call("calculate_recovery_costs", {})
        if not r.ok:
            return failed(r.error.code if r.error else "COSTS_UNAVAILABLE")
        o = r.output
        return {"plan_costs": {"candidate_count": o["candidate_count"], "feasible_option_count": o["feasible_option_count"], "excluded_fact_count": len(o["excluded_facts"]), "provisional_fact_count": len(o["provisional_facts"]), "baseline_total_krw": o["baseline"]["total_krw"]}}

    def solve_recovery(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        r = s.call("solve_recovery", {})
        if not r.ok:
            return failed(r.error.code if r.error else "SOLVER_UNAVAILABLE")
        o = r.output
        if o["status"] == "ERROR":
            return failed("SOLVER_ERROR")
        return {"solve": {"status": o["status"], "input_hash": o["input_hash"], "objective_krw": o["objective_krw"], "saving_krw": o["saving_krw"], "changed_count": o["changed_count"], "unplanned_count": len(o["unplanned"])}}

    def propose_plan(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        solve = state.get("solve") or {}
        rounds = state.get("plan_rounds", 0) + 1
        digest = str(solve.get("input_hash", ""))[7:19]
        r = s.call("propose_recovery_plan", {"expected_input_hash": solve["input_hash"]} if solve.get("input_hash") else {}, idempotency_key=f"{state['agent_run_id']}:plan:{rounds}:{digest}")
        if not r.ok and r.error and r.error.cause_code == "STALE_PLAN_INPUT":
            # T-136: facts / records changed after solve — the backend stored nothing. Solve again on the current inputs
            # (bounded by the run's step limit; each round is a new idempotency key because the input hash differs)
            return {"stale_plan_input": True, "plan_rounds": rounds}
        if not r.ok:
            return failed(r.error.code if r.error else "PLAN_PROPOSAL_FAILED")
        return {"plan": plan_ref(r.output), "plan_rounds": rounds, "stale_plan_input": False}

    def wait_plan_decision(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        # a person approves (or not); a changed fact makes the plan OUTDATED — either wakes this run. The resume value is a reason only
        interrupt({"waiting": "HUMAN", "reason": "AWAITING_PLAN_DECISION", "ref_type": "RECOVERY_PLAN", "ref_id": (state.get("plan") or {}).get("plan_id")})
        return {}

    def track_plan(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        r = s.call("get_recovery_plan", {"plan_id": (state.get("plan") or {}).get("plan_id")})
        if not r.ok:
            return failed(r.error.code if r.error else "PLAN_UNAVAILABLE")
        if not r.output["plan"]:
            return failed("PLAN_MISSING")
        return {"plan": plan_ref(r.output["plan"])}

    def fetch_public_data(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        day = state.get("plan_date")
        r = s.call("get_vessel_calls", {"from_date": day, "to_date": day})
        if not r.ok:
            return failed(r.error.code if r.error else "PUBLIC_DATA_FAILED")
        refs = sorted({p["fetch_id"] for p in r.output["summary"]["pages"]})
        return {"evidence_refs": ((state.get("evidence_refs") or []) + refs)[-50:]}

    def wait_external(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        # T-136: the awaited record is the recovery run (its inquiries) — the backend reconciler wakes this run when no gap still awaits a reply
        interrupt({"waiting": "EXTERNAL", "reason": "AWAITING_REPLIES", "ref_type": "RECOVERY_RUN", "ref_id": state["recovery_run_id"]})
        return {}

    def build_result(state: RecoveryState, s: ToolSession) -> dict[str, Any]:
        summary = result_summary(state)
        halt = state.get("halt")
        if halt:
            return {"result": {"status": "FAILED", "result_code": None, "error_code": halt, "summary": summary}}
        plan = state.get("plan")
        if plan and plan.get("plan_status") == "APPROVED":
            return {"result": {"status": "COMPLETED", "result_code": "PLAN_APPROVED", "error_code": None, "summary": summary}}
        if state.get("next_action") == "COMPLETE":
            # held = a value waits for a person, or (T-136) a reply came without a usable value and a person must review it
            held = any(g.get("state") in HUMAN_HELD_STATES or (g.get("state") == "ASKED" and not awaiting_reply(g)) for g in state.get("information_gaps") or [])
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
        ("wait_reply_review", _wait("HUMAN", "REPLY_REVIEW_REQUIRED")), ("wait_contact", wait_for_human),
        ("calculate_costs", calculate_costs), ("solve_recovery", solve_recovery), ("propose_plan", propose_plan),
        ("wait_plan_decision", wait_plan_decision), ("track_plan", track_plan),
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
        lambda state: "build_result" if state.get("halt") else {"COMPLETE": "build_result", "COMMUNICATION": "prepare_inquiry", "PUBLIC_DATA": "fetch_public_data", "WAIT_EXTERNAL": "wait_external", "PLAN": "calculate_costs"}.get(state.get("next_action") or "", "build_result"),
        ["build_result", "prepare_inquiry", "fetch_public_data", "wait_external", "calculate_costs"],
    )
    g.add_conditional_edges("calculate_costs", ok("solve_recovery"), ["solve_recovery", "build_result"])
    g.add_conditional_edges("solve_recovery", ok("propose_plan"), ["propose_plan", "build_result"])
    g.add_conditional_edges(
        "propose_plan",
        lambda state: "build_result" if state.get("halt") else "calculate_costs" if state.get("stale_plan_input") else "wait_plan_decision",
        ["wait_plan_decision", "calculate_costs", "build_result"],
    )
    g.add_edge("wait_plan_decision", "track_plan")
    # the backend's plan status decides: approved → done · facts changed → re-read and solve again · still open → keep waiting
    g.add_conditional_edges(
        "track_plan",
        lambda state: "build_result" if state.get("halt") else {"APPROVED": "build_result", "OUTDATED": "refresh_context", "SUPERSEDED": "refresh_context"}.get((state.get("plan") or {}).get("plan_status") or "", "wait_plan_decision"),
        ["build_result", "refresh_context", "wait_plan_decision"],
    )
    # no askable owner contact → wait for a person (register / choose a contact, or enter the value) and look at the gaps again
    g.add_conditional_edges(
        "prepare_inquiry",
        lambda state: "build_result" if state.get("halt") else "wait_contact" if state.get("contact_blocked_gaps") else "create_draft",
        ["create_draft", "wait_contact", "build_result"],
    )
    g.add_edge("wait_contact", "refresh_context")
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
    # with planning on, the run goes back to the gaps (other gaps · then the plan; a provisional value is used with a penalty)
    # a reply with no usable value while the gap is open waits for a person first (retry the extraction or enter the fact) — with or without planning
    g.add_conditional_edges(
        "reassess_gaps",
        lambda state: "build_result" if state.get("halt") else "wait_reply_review" if needs_reply_review(state) else "inspect_gaps" if (state.get("parameters") or {}).get("plan_recovery") else "wait_fact_verification" if (state.get("reassessment") or {}).get("business_gap_state") == "PROVISIONAL_AVAILABLE" else "build_result",
        ["wait_reply_review", "wait_fact_verification", "build_result", "inspect_gaps"],
    )
    g.add_edge("wait_fact_verification", "reassess_gaps")
    g.add_edge("wait_reply_review", "read_reply")
    g.add_conditional_edges("fetch_public_data", ok("inspect_gaps"), ["inspect_gaps", "build_result"])
    g.add_edge("wait_external", "refresh_context")
    g.add_conditional_edges("refresh_context", ok("inspect_gaps"), ["inspect_gaps", "build_result"])
    g.add_edge("build_result", END)
    return g.compile(checkpointer=checkpointer)


WAIT_NODES = ("wait_for_human", "wait_send_request", "wait_delivery", "wait_reply", "wait_external", "wait_fact_verification", "wait_reply_review", "wait_contact", "wait_plan_decision")
NO_USABLE_VALUE = ("EXTRACTION_FAILED", "NO_VALID_CANDIDATE")
OPEN_GAP_STATES = ("ASKED", "MISSING")


def needs_reply_review(state: RecoveryState) -> bool:
    """The reply came but gave no usable value and the backend still reports the gap open — a person must act (T-124)."""
    reply = state.get("reply_summary") or {}
    gap_state = (state.get("reassessment") or {}).get("business_gap_state")
    return reply.get("outcome") in NO_USABLE_VALUE and gap_state in OPEN_GAP_STATES
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
    if gap_state == "NEEDS_REFRESH":
        return "FACT_NEEDS_REFRESH"  # the value was withdrawn or went stale while the run waited — ask again in a new run
    if reply["outcome"] == "FACTS_PROMOTED":
        return "FACT_REJECTED_GAP_OPEN"  # the provisional fact was rejected / withdrawn — the gap is open again
    return "REPLY_NEEDS_HUMAN_REVIEW"


def result_summary(state: RecoveryState) -> dict[str, Any]:
    """What the run found — codes, ids, counts only (stored on the run for the operator screen)."""
    gap = state.get("target_gap") or {}
    pub = state.get("public_data") or {}
    reply = state.get("reply_summary") or {}
    re_ = state.get("reassessment") or {}
    plan = state.get("plan") or {}
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
        "plan_id": plan.get("plan_id"),
        "plan_version": plan.get("version"),
        "plan_status": plan.get("plan_status"),
        "plan_objective_krw": plan.get("objective_krw"),
        "plan_saving_krw": plan.get("saving_krw"),
        "plan_rounds": state.get("plan_rounds"),
        "step_count": state.get("step_count"),
    }
    return {k: v for k, v in out.items() if v is not None}


def plan_ref(p: dict[str, Any]) -> dict[str, Any]:
    """The plan as the graph keeps it: ids, the backend's status and the engine's totals (copied, never computed)."""
    return {k: p.get(k) for k in ("plan_id", "version", "plan_status", "solver_status", "input_hash", "objective_krw", "saving_krw", "reused")}


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
