"""Typed client for the Main Backend Agent Tool API (T-103 · ADR-036).

Agent Runtime → ``POST {CERA_BACKEND_TOOL_URL}/internal/agent-tools/{tool}`` → NestJS → existing domain services.
The runtime never talks to PostgreSQL, data.go.kr, UNI-PASS or a mail channel; this client is its only way to act.

- auth: ``Authorization: Bearer <CERA_AGENT_TOOL_TOKEN>`` (never in the URL or logs; ``repr`` hides it)
- scope: ``X-CERA-Agent-Run-Id`` (the run a human started — the backend checks the recovery-run scope)
- idempotency: PROPOSE / REQUEST tools need a key; the same key + same input returns the same result
- input is checked against the contract before sending, output after receiving
- every outcome is a ``ToolResult`` with a typed error — timeouts and refusals do not raise, so a graph can choose
  retry, another source or human review
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx

from .registry import ToolRegistry, load_registry
from .schema_check import errors as schema_errors

log = logging.getLogger("cera_ai.tools")


@dataclass(frozen=True)
class ToolError:
    code: str
    retryable: bool
    message: str
    cause_code: str | None = None
    details: dict[str, Any] | None = None


@dataclass(frozen=True)
class ToolResult:
    tool: str
    status: str  # SUCCEEDED | REJECTED | FAILED
    tool_call_id: str | None
    output: Any
    error: ToolError | None
    replayed: bool = False
    http_status: int | None = None

    @property
    def ok(self) -> bool:
        return self.status == "SUCCEEDED"


class BackendToolClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        registry: ToolRegistry | None = None,
        *,
        http: httpx.Client | None = None,
        default_timeout_s: float = 30.0,
    ) -> None:
        if len(token) < 32:
            raise ValueError("CERA_AGENT_TOOL_TOKEN must be at least 32 characters")
        self._base = base_url.rstrip("/")
        self._token = token
        self.registry = registry or load_registry()
        self._http = http or httpx.Client()
        self._default_timeout_s = default_timeout_s

    def __repr__(self) -> str:  # never show the token
        return f"BackendToolClient(base_url={self._base!r}, tools={len(self.registry.tools)})"

    def call(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        *,
        agent_run_id: str,
        idempotency_key: str | None = None,
        traceparent: str | None = None,
    ) -> ToolResult:
        tool = self.registry.get(tool_name)
        if tool is None:
            return self._local(tool_name, "TOOL_NOT_FOUND", "Not a registered CERA tool")
        problems = schema_errors(tool.input_schema, arguments)
        if problems:
            return self._local(tool_name, "INVALID_ARGUMENT", "Arguments do not match the tool contract", {"fields": problems[:20]})
        if tool.idempotency == "REQUIRED" and not idempotency_key:
            return self._local(tool_name, "IDEMPOTENCY_KEY_REQUIRED", "This tool has side effects: pass an idempotency key")

        headers = {"authorization": f"Bearer {self._token}", "x-cera-agent-run-id": agent_run_id, "content-type": "application/json"}
        if idempotency_key:
            headers["idempotency-key"] = idempotency_key
        if traceparent:
            headers["traceparent"] = traceparent
        # backend timeout + a margin so the backend reports its own typed timeout first
        timeout_s = max(self._default_timeout_s, tool.timeout_ms / 1000 + 5)
        try:
            response = self._http.post(f"{self._base}/internal/agent-tools/{tool_name}", json=arguments, headers=headers, timeout=timeout_s)
        except httpx.TimeoutException:
            log.warning("agent tool call timed out tool=%s run=%s", tool_name, agent_run_id)
            return self._local(tool_name, "TOOL_TIMEOUT", "The backend did not answer in time", retryable=True, status="FAILED")
        except httpx.HTTPError as error:
            log.warning("agent tool call failed tool=%s run=%s error=%s", tool_name, agent_run_id, type(error).__name__)
            return self._local(tool_name, "BACKEND_UNAVAILABLE", "The backend could not be reached", retryable=True, status="FAILED")

        try:
            body = response.json()
        except ValueError:
            return self._local(tool_name, "BACKEND_PROTOCOL_ERROR", "The backend answer is not JSON", retryable=True, status="FAILED", http_status=response.status_code)
        result = _envelope(tool_name, body, response.status_code)
        if result is None:
            return self._local(tool_name, "BACKEND_PROTOCOL_ERROR", "The backend answer is not a tool envelope", retryable=False, status="FAILED", http_status=response.status_code)
        if result.ok:
            output_problems = schema_errors(tool.output_schema, result.output)
            if output_problems:
                return ToolResult(tool_name, "FAILED", result.tool_call_id, None, ToolError("OUTPUT_CONTRACT_VIOLATION", False, "The backend output does not match the tool contract", details={"fields": output_problems[:20]}), result.replayed, response.status_code)
        log.info("agent tool call tool=%s run=%s status=%s code=%s", tool_name, agent_run_id, result.status, result.error.code if result.error else "-")
        return result

    def close(self) -> None:
        self._http.close()

    @staticmethod
    def _local(tool: str, code: str, message: str, details: dict[str, Any] | None = None, *, retryable: bool = False, status: str = "REJECTED", http_status: int | None = None) -> ToolResult:
        return ToolResult(tool, status, None, None, ToolError(code, retryable, message, details=details), False, http_status)


def _envelope(tool: str, body: Any, http_status: int) -> ToolResult | None:
    if not isinstance(body, dict) or body.get("schema_version") != "agent-tool/1" or body.get("status") not in ("SUCCEEDED", "REJECTED", "FAILED"):
        return None
    err = body.get("error")
    error = (
        ToolError(str(err.get("code")), bool(err.get("retryable")), str(err.get("message", "")), err.get("cause_code"), err.get("details"))
        if isinstance(err, dict)
        else None
    )
    return ToolResult(tool, body["status"], body.get("tool_call_id"), body.get("output"), error, bool(body.get("replayed")), http_status)


def client_from_env(environ: dict[str, str] | None = None) -> BackendToolClient:
    """Build the client from ``CERA_BACKEND_TOOL_URL`` + ``CERA_AGENT_TOOL_TOKEN`` (validated by cera_ai.config)."""
    from ..config import load_settings

    env = dict(os.environ if environ is None else environ)
    settings = load_settings(env)
    if settings.agent_mode != "on":
        raise RuntimeError("CERA_AGENT_MODE is off — the agent tool client is disabled")
    return BackendToolClient(settings.backend_tool_url, env["CERA_AGENT_TOOL_TOKEN"].strip())
