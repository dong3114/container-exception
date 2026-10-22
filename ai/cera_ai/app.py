"""CERA AI Server (ADR-033): stateless HTTP/JSON service called only by the Main Backend.

No database, no channels, no events, no approvals, no sending. One external client: the LLM provider.
Logs carry ids, latency, outcome and usage — never the message text, quotes or secrets (docs/23 4.4).
"""

from __future__ import annotations

import hmac
import logging
import re
import time
from typing import Annotated, Any

from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .agent.runtime import RuntimeUnavailable
from .contracts import ExtractionRequest, ExtractionResponse
from .extraction import extract
from .providers import LlmProvider, ProviderError, provider_from_env

log = logging.getLogger("cera_ai")


def create_app(provider: LlmProvider | None = None, agent_runtime: Any | None = None, agent_token: str | None = None) -> FastAPI:
    app = FastAPI(title="CERA AI Server", version="0.1.0", docs_url=None, redoc_url=None)
    selected = provider or provider_from_env()
    runtime, token = (agent_runtime, agent_token) if agent_runtime is not None else _agent_runtime_from_env()

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:  # noqa: ARG001
        # field locations only — no input values (they may contain the reply text)
        fields = sorted({".".join(str(p) for p in e.get("loc", [])) for e in exc.errors()})
        return JSONResponse(status_code=422, content={"code": "INVALID_REQUEST", "message": f"Invalid request: {', '.join(fields)}"})

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "provider": selected.name}

    @app.post("/v1/extractions/reply", response_model=ExtractionResponse, response_model_by_alias=True)
    def extract_reply(body: ExtractionRequest, x_request_id: Annotated[str | None, Header()] = None) -> ExtractionResponse | JSONResponse:
        started = time.monotonic()
        try:
            response = extract(body, selected)
        except ProviderError as error:
            log.warning(
                "extraction failed",
                extra={"request_id": x_request_id, "inbound_message_id": body.inbound_message_id, "code": error.code, "provider": selected.name},
            )
            return JSONResponse(status_code=502, content={"code": error.code, "message": str(error), "retryable": error.retryable})
        log.info(
            "extraction done",
            extra={
                "request_id": x_request_id,
                "inbound_message_id": body.inbound_message_id,
                "provider": response.meta.provider,
                "model_version": response.meta.model_version,
                "outcome": response.outcome,
                "answers": len(response.answers),
                "latency_ms": int((time.monotonic() - started) * 1000),
                "usage": response.meta.usage.model_dump() if response.meta.usage else None,
            },
        )
        return response

    # ── Agent Runtime (T-104 · ADR-036): only the Main Backend Coordinator starts or resumes a run ──
    def _authorized(authorization: str | None) -> bool:
        if not token or not authorization or not authorization.startswith("Bearer "):
            return False
        return hmac.compare_digest(authorization[7:].encode(), token.encode())

    @app.post("/v1/agent-runs/{agent_run_id}/start")
    def start_run(agent_run_id: str, body: dict[str, Any], authorization: Annotated[str | None, Header()] = None) -> JSONResponse:
        if runtime is None:
            return JSONResponse(status_code=503, content={"code": "AGENT_MODE_OFF", "message": "CERA_AGENT_MODE is off"})
        if not _authorized(authorization):
            return JSONResponse(status_code=401, content={"code": "UNAUTHORIZED", "message": "service token required"})
        if not _UUID.match(agent_run_id) or body.get("agent_run_id") != agent_run_id:
            return JSONResponse(status_code=422, content={"code": "INVALID_REQUEST", "message": "agent_run_id mismatch"})
        started = time.monotonic()
        try:
            out = runtime.start(agent_run_id, str(body.get("recovery_run_id")), str(body.get("goal", ""))[:300], body.get("parameters") if isinstance(body.get("parameters"), dict) else None)
        except RuntimeUnavailable as error:
            # transient — the Backend runtime store did not answer. The coordinator keeps the run and retries later
            return JSONResponse(status_code=503, content={"code": "RUNTIME_STORE_UNAVAILABLE", "message": error.code.split(":")[0]})
        log.info("agent run start run=%s status=%s node=%s ms=%d", agent_run_id, out["status"], out["node"], int((time.monotonic() - started) * 1000))
        return JSONResponse(content=out)

    @app.post("/v1/agent-runs/{agent_run_id}/resume")
    def resume_run(agent_run_id: str, body: dict[str, Any], authorization: Annotated[str | None, Header()] = None) -> JSONResponse:
        if runtime is None:
            return JSONResponse(status_code=503, content={"code": "AGENT_MODE_OFF", "message": "CERA_AGENT_MODE is off"})
        if not _authorized(authorization):
            return JSONResponse(status_code=401, content={"code": "UNAUTHORIZED", "message": "service token required"})
        if not _UUID.match(agent_run_id) or body.get("agent_run_id") != agent_run_id:
            return JSONResponse(status_code=422, content={"code": "INVALID_REQUEST", "message": "agent_run_id mismatch"})
        ref = body.get("ref") if isinstance(body.get("ref"), dict) else None
        started = time.monotonic()
        try:
            out = runtime.resume(agent_run_id, str(body.get("reason", "RESUMED"))[:60], ref)
        except RuntimeUnavailable as error:
            # transient — the Backend runtime store did not answer. The coordinator keeps the run and retries later
            return JSONResponse(status_code=503, content={"code": "RUNTIME_STORE_UNAVAILABLE", "message": error.code.split(":")[0]})
        log.info("agent run resume run=%s status=%s node=%s ms=%d", agent_run_id, out["status"], out["node"], int((time.monotonic() - started) * 1000))
        return JSONResponse(content=out)

    return app


_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _agent_runtime_from_env() -> tuple[Any | None, str | None]:
    import os

    from .config import load_settings

    settings = load_settings(os.environ)
    if settings.agent_mode != "on":
        return None, None
    from .agent.runtime import runtime_from_settings

    token = os.environ["CERA_AGENT_TOOL_TOKEN"].strip()
    return runtime_from_settings(settings, token), token
