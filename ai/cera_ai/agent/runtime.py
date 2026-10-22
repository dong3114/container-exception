"""Agent Runtime (T-104): runs CeraRecoveryGraph for one agent run until it waits or ends.

The Backend Coordinator calls ``start`` / ``resume``; this module never decides on its own to run a graph.
Nothing is kept in memory between calls — each call rebuilds the graph and reads the checkpoint through the
Backend, so a restarted Python process continues the same run.
"""

from __future__ import annotations

import logging
from typing import Any

from langgraph.types import Command

from .backend import RuntimeApiError
from .graph import GraphDeps, build_graph

log = logging.getLogger("cera_ai.agent")
SCHEMA = "agent-runtime/1"


class RuntimeUnavailable(Exception):
    """The Backend runtime store did not answer (transient). The coordinator retries the same run later (WAITING_RUNTIME)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _transient(error: RuntimeApiError) -> bool:
    return error.code.startswith("RUNTIME_API_UNAVAILABLE") or (error.status is not None and error.status >= 500)


class AgentRuntime:
    def __init__(self, deps: GraphDeps, checkpointer: Any) -> None:
        self._deps = deps
        self._checkpointer = checkpointer

    def _graph(self) -> Any:
        return build_graph(self._deps, self._checkpointer)

    def _config(self, agent_run_id: str) -> dict[str, Any]:
        # recursion_limit is a backstop; the graph's own step limit ends the run first with a typed code
        return {"configurable": {"thread_id": agent_run_id, "checkpoint_ns": ""}, "recursion_limit": self._deps.max_steps * 2 + 10}

    def start(self, agent_run_id: str, recovery_run_id: str, goal: str, parameters: dict[str, Any] | None) -> dict[str, Any]:
        """Start — or, when this run already has a checkpoint (a retry after a crash or timeout), continue from it.
        Nodes that already ran are not repeated; a node cut off mid-way runs again with the same idempotency keys."""
        state = {"agent_run_id": agent_run_id, "recovery_run_id": recovery_run_id, "goal": goal, "parameters": parameters or {}, "step_count": 0, "tool_call_count": 0, "retry_count": 0, "errors": []}
        return self._run(agent_run_id, lambda snap: None if snap.values else state)

    def resume(self, agent_run_id: str, reason: str, ref: dict[str, Any] | None) -> dict[str, Any]:
        """Wake a run. The resume value is only a wake-up reason; nodes re-read business state through tools.
        Waiting at an interrupt → resume it. Cut off mid-way → continue. Already ended → report the end again."""

        def payload(snap: Any) -> Any:
            if snap.interrupts:
                return Command(resume={"reason": reason, "ref": ref})
            return None if snap.next else _NO_RUN

        return self._run(agent_run_id, payload)

    def _run(self, agent_run_id: str, choose: Any) -> dict[str, Any]:
        graph = self._graph()
        config = self._config(agent_run_id)
        try:
            payload = choose(graph.get_state(config))
            if payload is _NO_RUN:
                return self._outcome(agent_run_id, graph, config)
            if payload is None and not graph.get_state(config).values:
                return outcome(agent_run_id, "FAILED", None, error_code="RUN_NOT_STARTED")
            graph.invoke(payload, config)
            return self._outcome(agent_run_id, graph, config)
        except RuntimeApiError as error:
            if _transient(error):
                log.warning("agent runtime store unavailable run=%s code=%s", agent_run_id, error.code)
                raise RuntimeUnavailable(error.code) from None
            log.warning("agent runtime store refused run=%s code=%s", agent_run_id, error.code)
            return outcome(agent_run_id, "FAILED", None, error_code="RUNTIME_STORE_REFUSED")
        except Exception as error:  # an unexpected graph failure is a typed terminal state, never a hang
            log.warning("agent graph failed run=%s error=%s", agent_run_id, type(error).__name__)
            return outcome(agent_run_id, "FAILED", None, error_code="GRAPH_ERROR")

    def _outcome(self, agent_run_id: str, graph: Any, config: dict[str, Any]) -> dict[str, Any]:
        snapshot = graph.get_state(config)
        if snapshot.interrupts:
            value = snapshot.interrupts[0].value or {}
            node = snapshot.tasks[0].name if snapshot.tasks else None
            waiting = "WAITING_HUMAN" if value.get("waiting") == "HUMAN" else "WAITING_EXTERNAL"
            pending = {"type": value["ref_type"], "id": value["ref_id"]} if value.get("ref_type") and value.get("ref_id") else None
            return outcome(agent_run_id, waiting, node, waiting_reason=value.get("reason") or "WAITING", pending=pending)
        result = (snapshot.values or {}).get("result") or {}
        status = "COMPLETED" if result.get("status") == "COMPLETED" else "FAILED"
        return outcome(
            agent_run_id,
            status,
            "build_result",
            result_code=result.get("result_code"),
            error_code=result.get("error_code") or (None if status == "COMPLETED" else "UNEXPECTED_END"),
            result_summary=result.get("summary"),
        )


_NO_RUN = object()


def outcome(agent_run_id: str, status: str, node: str | None, *, waiting_reason: str | None = None, pending: dict[str, Any] | None = None, result_code: str | None = None, error_code: str | None = None, result_summary: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA,
        "agent_run_id": agent_run_id,
        "status": status,
        "node": node,
        "waiting_reason": waiting_reason,
        "pending": pending,
        "result_code": result_code,
        "error_code": error_code,
        "result_summary": result_summary if status in ("COMPLETED", "FAILED") else None,
    }


def runtime_from_settings(settings: Any, token: str) -> AgentRuntime:
    from ..tools.client import BackendToolClient
    from .backend import RuntimeApiClient
    from .checkpointer import BackendCheckpointSaver

    api = RuntimeApiClient(settings.backend_tool_url, token)
    deps = GraphDeps(
        tools=BackendToolClient(settings.backend_tool_url, token),
        max_steps=settings.agent_max_steps,
        max_tool_calls=settings.agent_max_tool_calls,
        max_retries=settings.agent_max_retries,
        report_steps=api.report_steps,
    )
    return AgentRuntime(deps, BackendCheckpointSaver(api))
