"""LLM provider port (ADR-033: the AI Server's only external client is an LLM provider).

* ``ReplayProvider`` — **recorded responses**, no LLM call. Recordings are matched by the sha256 of the exact
  request document (reply-extract/1), so the same input always gets the same recorded answer. Used for the Slice 1
  mock loop and tests (T-069 7.1). Its model_version is ``replay:<fixture version>`` (docs/24 22.22) — the screen
  shows it as "recorded replay — LLM not run".
* ``LiveProviderSlot`` — what ``live`` mode returns when no adapter is selected. **The provider/model is not decided**
  (ADR-033 open item), so it refuses to run. Adapters (T-099 evaluation) live in ``llm_adapters.py`` and run only when
  ``CERA_LLM_PROVIDER`` and ``CERA_LLM_MODEL`` are both set. It never invents a vendor.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .contracts import ExtractionRequest, ProviderOutput, Usage


class ProviderError(Exception):
    """A provider could not produce an output. ``code`` is safe to log; no source text inside."""

    def __init__(self, code: str, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class ProviderResult:
    output: ProviderOutput
    model_version: str
    usage: Usage | None
    # which vendor actually answered (failover) — None = the provider the caller selected
    provider: str | None = None


class LlmProvider(Protocol):
    name: str

    def extract(self, request: ExtractionRequest, prompt: str) -> ProviderResult: ...


def request_fingerprint(request: ExtractionRequest) -> str:
    """sha256 of the canonical request document (sorted keys, no whitespace) — the recording key."""
    doc = request.model_dump(by_alias=True, mode="json")
    text = json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def message_text_fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class ReplayProvider:
    """Recorded responses from ``<dir>/*.json``: ``{"version", "match": {"message_text_sha256"}, "output": {...}}``.

    Matching on the message text keeps recordings stable when request ids differ (each reply has its own id).
    The output still goes through the same strict schema and, on the Backend, the same validators.
    """

    name = "replay"

    def __init__(self, directory: Path) -> None:
        self._dir = directory

    def extract(self, request: ExtractionRequest, prompt: str) -> ProviderResult:  # noqa: ARG002 — replay ignores the prompt
        key = message_text_fingerprint(request.message_text)
        for path in sorted(self._dir.glob("*.json")) if self._dir.is_dir() else []:
            record = json.loads(path.read_text(encoding="utf-8"))
            if record.get("match", {}).get("message_text_sha256") == key:
                raw = record.get("output")
                if isinstance(raw, str):  # a recording of a malformed provider answer
                    raise ProviderError("PROVIDER_OUTPUT_NOT_JSON", "recorded output is not a JSON object", retryable=False)
                try:
                    output = ProviderOutput.model_validate(raw)
                except Exception as error:  # pydantic.ValidationError
                    raise ProviderError("PROVIDER_OUTPUT_INVALID", f"recorded output does not match the schema: {type(error).__name__}", retryable=False) from None
                return ProviderResult(output=output, model_version=f"replay:{record.get('version', 'fixtures-1')}", usage=None)
        raise ProviderError("NO_RECORDING", "no recorded response for this message text", retryable=False)


class LiveProviderSlot:
    """Placeholder for a real LLM adapter. Selecting a vendor is a decision (ADR-033) — not made here."""

    name = "live"

    def extract(self, request: ExtractionRequest, prompt: str) -> ProviderResult:  # noqa: ARG002
        raise ProviderError("PROVIDER_NOT_CONFIGURED", "no live LLM provider adapter is selected (ADR-033 open item)", retryable=False)


# Technical failures only: the vendor could not be reached or would not serve this key. A bad *answer*
# (not JSON, schema mismatch, refusal, truncated) is not failed over — the backend validators and a person handle it.
FAILOVER_CODES = frozenset({"PROVIDER_KEY_MISSING", "PROVIDER_CALL_FAILED", "MODEL_TIMEOUT"})

log = logging.getLogger("cera_ai.providers")


class FailoverProvider:
    """Primary vendor first; on a technical failure (``FAILOVER_CODES``) the same request goes once to the fallback.

    No ranking by price and no answer comparison — the order is configuration. The result records which vendor and
    model answered (``meta.provider`` · ``model_version``), so a candidate stays traceable to its model (T-093).
    If the fallback fails too, its error is raised; ``retryable`` is true when either failure was transient.
    """

    def __init__(self, primary: LlmProvider, fallback: LlmProvider) -> None:
        self.primary, self.fallback = primary, fallback
        self.name = f"{primary.name}>{fallback.name}"

    def extract(self, request: ExtractionRequest, prompt: str) -> ProviderResult:
        try:
            result = self.primary.extract(request, prompt)
            return ProviderResult(result.output, result.model_version, result.usage, result.provider or self.primary.name)
        except ProviderError as error:
            if error.code not in FAILOVER_CODES:
                raise
            first = error  # Python unbinds the except name when the block ends
            log.warning("primary LLM provider failed — trying the fallback once", extra={"code": first.code, "provider": self.primary.name, "fallback": self.fallback.name})
        try:
            result = self.fallback.extract(request, prompt)
        except ProviderError as second:
            raise ProviderError(second.code, f"primary {first.code}; fallback {second.code}: {second}", retryable=first.retryable or second.retryable) from None
        return ProviderResult(result.output, result.model_version, result.usage, result.provider or self.fallback.name)


def provider_from_env() -> LlmProvider:
    mode = os.environ.get("CERA_LLM_MODE", "replay")
    if mode == "replay":
        default_dir = Path(__file__).resolve().parent.parent / "fixtures" / "replay"
        return ReplayProvider(Path(os.environ.get("CERA_AI_REPLAY_DIR") or str(default_dir)))  # an empty value (as in .env.example) means the default
    if mode == "live":
        # T-099: an adapter runs only when both are set explicitly; choosing them for production is an ADR decision.
        vendor, model = os.environ.get("CERA_LLM_PROVIDER"), os.environ.get("CERA_LLM_MODEL")
        if vendor and model:
            from .llm_adapters import make_provider

            primary = make_provider(vendor, model)
            fallback, fallback_model = os.environ.get("CERA_LLM_FALLBACK_PROVIDER"), os.environ.get("CERA_LLM_FALLBACK_MODEL")
            if fallback and fallback_model:
                return FailoverProvider(primary, make_provider(fallback, fallback_model))
            return primary
        return LiveProviderSlot()
    raise ValueError(f"CERA_LLM_MODE must be replay or live, got {mode!r}")
