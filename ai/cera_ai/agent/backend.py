"""Client for the Main Backend Agent Runtime API (T-104 · ADR-036 decision 2).

Python has no database credentials. Execution state (LangGraph checkpoints, pending writes) and node observations
go through ``{CERA_BACKEND_TOOL_URL}/internal/agent-runtime/runs/{id}/...`` with the agent service token.
This is execution state — not business truth. The token never appears in URLs, logs or ``repr``.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger("cera_ai.agent")


class RuntimeApiError(RuntimeError):
    def __init__(self, code: str, status: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


class RuntimeApiClient:
    def __init__(self, base_url: str, token: str, *, http: httpx.Client | None = None, timeout_s: float = 15.0) -> None:
        if len(token) < 32:
            raise ValueError("CERA_AGENT_TOOL_TOKEN must be at least 32 characters")
        self._base = base_url.rstrip("/")
        self._token = token
        self._http = http or httpx.Client()
        self._timeout = timeout_s

    def __repr__(self) -> str:
        return f"RuntimeApiClient(base_url={self._base!r})"

    def _url(self, run_id: str, path: str) -> str:
        return f"{self._base}/internal/agent-runtime/runs/{run_id}/{path}"

    def _send(self, method: str, url: str, **kw: Any) -> Any:
        try:
            r = self._http.request(method, url, headers={"authorization": f"Bearer {self._token}"}, timeout=self._timeout, **kw)
        except httpx.HTTPError as error:
            raise RuntimeApiError(f"RUNTIME_API_UNAVAILABLE:{type(error).__name__}") from None
        if r.status_code >= 400:
            code = "RUNTIME_API_ERROR"
            try:
                code = str(r.json().get("code", code))
            except ValueError:
                pass
            raise RuntimeApiError(code, r.status_code)
        return r.json()

    def put_checkpoint(self, run_id: str, body: dict[str, Any]) -> None:
        self._send("PUT", self._url(run_id, "checkpoints"), json=body)

    def put_writes(self, run_id: str, body: dict[str, Any]) -> None:
        self._send("POST", self._url(run_id, "checkpoint-writes"), json=body)

    def get_checkpoints(self, run_id: str, *, ns: str | None, checkpoint_id: str | None = None, before: str | None = None, limit: int = 1) -> list[dict[str, Any]]:
        params: dict[str, str] = {"limit": str(limit)}
        if ns is not None:
            params["ns"] = ns
        if checkpoint_id:
            params["checkpoint_id"] = checkpoint_id
        if before:
            params["before"] = before
        return list(self._send("GET", self._url(run_id, "checkpoints"), params=params)["checkpoints"])

    def report_steps(self, run_id: str, steps: list[dict[str, Any]]) -> None:
        """Best effort — an observability failure never breaks the graph."""
        try:
            self._send("POST", self._url(run_id, "steps"), json={"steps": steps})
        except RuntimeApiError as error:
            log.warning("agent step report failed run=%s code=%s", run_id, error.code)
