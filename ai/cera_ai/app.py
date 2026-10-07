"""CERA AI Server (ADR-033): stateless HTTP/JSON service called only by the Main Backend.

No database, no channels, no events, no approvals, no sending. One external client: the LLM provider.
Logs carry ids, latency, outcome and usage — never the message text, quotes or secrets (docs/23 4.4).
"""

from __future__ import annotations

import logging
import time
from typing import Annotated

from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .contracts import ExtractionRequest, ExtractionResponse
from .extraction import extract
from .providers import LlmProvider, ProviderError, provider_from_env

log = logging.getLogger("cera_ai")


def create_app(provider: LlmProvider | None = None) -> FastAPI:
    app = FastAPI(title="CERA AI Server", version="0.1.0", docs_url=None, redoc_url=None)
    selected = provider or provider_from_env()

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

    return app
