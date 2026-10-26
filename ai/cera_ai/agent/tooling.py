"""Tool calling inside the graph (T-104): registry-limited, counted, retried — framework neutral underneath.

    LangGraph node → ToolSession.call() → BackendToolClient.call() → NestJS /internal/agent-tools/{tool}

- only tools in the ``ToolRegistry`` (Backend contract) can be called — an unknown name is refused locally
- every call counts against ``CERA_AGENT_MAX_TOOL_CALLS``; going over ends the run with ``TOOL_CALL_LIMIT_REACHED``
- a ``FAILED`` + ``retryable`` result (e.g. ``UPSTREAM_TIMEOUT``) is retried a bounded number of times with the
  same idempotency key; ``REJECTED`` results (``OUT_OF_SCOPE``, ``INVALID_ARGUMENT``, ``UNAUTHORIZED_AGENT`` …) are not
- ``as_langchain_tools`` exposes the same registry as LangChain tools for a future LLM tool-calling node
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from ..tools.client import ToolError, ToolResult
from ..tools.registry import ToolRegistry


class ToolCaller(Protocol):
    registry: ToolRegistry

    def call(self, tool_name: str, arguments: dict[str, Any], *, agent_run_id: str, idempotency_key: str | None = None, traceparent: str | None = None) -> ToolResult: ...


class LimitReached(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass
class ToolSession:
    """One node's tool calls. The node returns ``updates()`` so counters live in the graph state (checkpointed)."""

    caller: ToolCaller
    agent_run_id: str
    tool_call_count: int
    max_tool_calls: int
    max_retries: int
    calls: list[dict[str, Any]] = field(default_factory=list)
    retries: int = 0

    def call(self, tool: str, arguments: dict[str, Any], *, idempotency_key: str | None = None) -> ToolResult:
        if self.caller.registry.get(tool) is None:
            # never reaches the backend: the graph can only use registered capabilities
            result = ToolResult(tool, "REJECTED", None, None, ToolError("TOOL_NOT_REGISTERED", False, "Not a CERA tool"))
            self.calls.append(_summary(result))
            return result
        attempt = 0
        while True:
            if self.tool_call_count >= self.max_tool_calls:
                raise LimitReached("TOOL_CALL_LIMIT_REACHED")
            self.tool_call_count += 1
            result = self.caller.call(tool, arguments, agent_run_id=self.agent_run_id, idempotency_key=idempotency_key)
            self.calls.append(_summary(result))
            retryable = result.status == "FAILED" and result.error is not None and result.error.retryable
            if not retryable:
                return result
            if attempt >= self.max_retries:
                if self.max_retries == 0:
                    return result
                # retries ran out: a limit, not a business failure — the cause stays in the call summaries (calls[*].code)
                cause = result.error.code if result.error else 'UNKNOWN'
                return ToolResult(result.tool, result.status, result.tool_call_id, None, ToolError("RETRY_LIMIT_REACHED", False, f"{cause} after {attempt + 1} attempts"))
            attempt += 1
            self.retries += 1

    def updates(self) -> dict[str, Any]:
        last = self.calls[-1] if self.calls else None
        return {"tool_call_count": self.tool_call_count, "last_tool_call": last}


def _summary(r: ToolResult) -> dict[str, Any]:
    """What the state keeps about a call: refs and codes, never the output payload."""
    return {"tool": r.tool, "status": r.status, "tool_call_id": r.tool_call_id, "code": r.error.code if r.error else None, "retryable": bool(r.error and r.error.retryable)}


def as_langchain_tools(caller: ToolCaller, agent_run_id: str) -> list[Any]:
    """The registry as LangChain ``StructuredTool``s (args schema = Backend contract). Each still goes through the client."""
    from langchain_core.tools import StructuredTool

    tools = []
    for definition in caller.registry.tools.values():
        def _run(_name: str = definition.name, **kwargs: Any) -> dict[str, Any]:
            r = caller.call(_name, kwargs, agent_run_id=agent_run_id)
            return {"status": r.status, "output": r.output, "error": r.error.code if r.error else None}

        tools.append(StructuredTool.from_function(func=_run, name=definition.name, description=definition.description, args_schema=definition.input_schema))
    return tools
