"""Generative provider adapters (T-099) — real LLM calls behind the ``LlmProvider`` port.

Each adapter sends the same prompt (``extraction.build_prompt``) and the same JSON schema (``PROVIDER_OUTPUT_SCHEMA``)
through the vendor's own structured-output feature, then validates the answer with the strict ``ProviderOutput`` model.
The output stays a **candidate** — the Backend validators decide what happens next (ADR-033).

* No vendor is selected for production here (ADR-033 open item). Adapters exist so T-099 can measure them.
* SDKs are optional extras (``pip install -e ".[providers]"``) and imported lazily; API keys come only from the
  environment and are never logged. Error messages carry codes, not reply text.
"""

from __future__ import annotations

import json
import os
from typing import Any

from .contracts import ExtractionRequest, ProviderOutput, Usage
from .providers import ProviderError, ProviderResult

# Same shape as ProviderOutput, written in the subset every vendor's strict mode accepts
# (all keys required, additionalProperties false, nullable = type union, no length keywords).
PROVIDER_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "outcome": {"type": "string", "enum": ["VALUES", "NO_CHANGE", "REFUSAL", "UNPARSEABLE"]},
        "answers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ask_id": {"type": "string"},
                    "field": {"type": "string"},
                    "raw_value": {"type": "string"},
                    "value": {"type": "string"},
                    "unit": {"type": ["string", "null"]},
                    "evidence": {
                        "type": "object",
                        "properties": {"quote": {"type": "string"}},
                        "required": ["quote"],
                        "additionalProperties": False,
                    },
                    "confidence": {"type": ["number", "null"]},
                },
                "required": ["ask_id", "field", "raw_value", "value", "unit", "evidence", "confidence"],
                "additionalProperties": False,
            },
        },
        "unmapped_statements": {"type": "array", "items": {"type": "string"}},
        "ambiguity_flags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["outcome", "answers", "unmapped_statements", "ambiguity_flags"],
    "additionalProperties": False,
}

MAX_OUTPUT_TOKENS = 4000


def parse_provider_json(text: str | None) -> ProviderOutput:
    """JSON text -> ProviderOutput, or a ProviderError with a loggable code (no text in the message)."""
    if not text:
        raise ProviderError("PROVIDER_OUTPUT_EMPTY", "provider returned no text", retryable=False)
    try:
        raw = json.loads(text)
    except json.JSONDecodeError:
        raise ProviderError("PROVIDER_OUTPUT_NOT_JSON", "provider output is not JSON", retryable=False) from None
    try:
        return ProviderOutput.model_validate(raw)
    except Exception as error:  # pydantic.ValidationError
        raise ProviderError("PROVIDER_OUTPUT_INVALID", f"provider output does not match the schema: {type(error).__name__}", retryable=False) from None


def _require_key(env: str) -> str:
    key = os.environ.get(env)
    if not key:
        raise ProviderError("PROVIDER_KEY_MISSING", f"{env} is not set", retryable=False)
    return key


def _call_failed(error: Exception) -> ProviderError:
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    retryable = status in (408, 409, 429) or (isinstance(status, int) and status >= 500) or status is None
    return ProviderError("PROVIDER_CALL_FAILED", f"{type(error).__name__} status={status}", retryable=retryable)


class AnthropicProvider:
    """Claude Messages API with ``output_config.format`` (json_schema). Effort defaults to ``low`` (short extraction)."""

    name = "anthropic"

    def __init__(self, model: str, client: Any | None = None, effort: str | None = None) -> None:
        self.model = model
        self.effort = effort or os.environ.get("CERA_LLM_EFFORT", "low")
        self._client = client

    def _get_client(self) -> Any:
        if self._client is None:
            import anthropic  # optional extra

            self._client = anthropic.Anthropic(api_key=_require_key("ANTHROPIC_API_KEY"), max_retries=2)
        return self._client

    def complete_json(self, prompt: str, schema: dict[str, Any]) -> tuple[str | None, Usage]:
        try:
            response = self._get_client().messages.create(
                model=self.model,
                max_tokens=MAX_OUTPUT_TOKENS,
                messages=[{"role": "user", "content": prompt}],
                output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": schema}},
            )
        except ProviderError:
            raise
        except Exception as error:
            raise _call_failed(error) from None
        if response.stop_reason == "refusal":
            raise ProviderError("PROVIDER_REFUSED", "model refused", retryable=False)
        if response.stop_reason == "max_tokens":
            raise ProviderError("PROVIDER_OUTPUT_TRUNCATED", "max_tokens reached", retryable=False)
        text = next((b.text for b in response.content if getattr(b, "type", None) == "text"), None)
        usage = Usage(input_tokens=response.usage.input_tokens, output_tokens=response.usage.output_tokens)
        return text, usage

    def extract(self, request: ExtractionRequest, prompt: str) -> ProviderResult:  # noqa: ARG002
        text, usage = self.complete_json(prompt, PROVIDER_OUTPUT_SCHEMA)
        return ProviderResult(output=parse_provider_json(text), model_version=self.model, usage=usage)


class OpenAIProvider:
    """OpenAI Responses API with ``text.format`` json_schema (strict)."""

    name = "openai"

    def __init__(self, model: str, client: Any | None = None, reasoning_effort: str | None = None) -> None:
        self.model = model
        self.reasoning_effort = reasoning_effort or os.environ.get("CERA_LLM_EFFORT")
        self._client = client

    def _get_client(self) -> Any:
        if self._client is None:
            import openai  # optional extra

            self._client = openai.OpenAI(api_key=_require_key("OPENAI_API_KEY"), max_retries=2)
        return self._client

    def complete_json(self, prompt: str, schema: dict[str, Any]) -> tuple[str | None, Usage]:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "input": [{"role": "user", "content": prompt}],
            "max_output_tokens": MAX_OUTPUT_TOKENS,
            "text": {"format": {"type": "json_schema", "name": "cera_output", "schema": schema, "strict": True}},
        }
        if self.reasoning_effort:
            kwargs["reasoning"] = {"effort": self.reasoning_effort}
        try:
            response = self._get_client().responses.create(**kwargs)
        except ProviderError:
            raise
        except Exception as error:
            raise _call_failed(error) from None
        usage = Usage(input_tokens=response.usage.input_tokens, output_tokens=response.usage.output_tokens) if response.usage else None
        return response.output_text, usage or Usage()

    def extract(self, request: ExtractionRequest, prompt: str) -> ProviderResult:  # noqa: ARG002
        text, usage = self.complete_json(prompt, PROVIDER_OUTPUT_SCHEMA)
        return ProviderResult(output=parse_provider_json(text), model_version=self.model, usage=usage)


class GeminiProvider:
    """Gemini ``models.generate_content`` with ``response_mime_type=application/json`` + ``response_json_schema``."""

    name = "gemini"

    def __init__(self, model: str, client: Any | None = None) -> None:
        self.model = model
        self._client = client

    def _get_client(self) -> Any:
        if self._client is None:
            from google import genai  # optional extra

            self._client = genai.Client(api_key=_require_key("GEMINI_API_KEY"))
        return self._client

    def complete_json(self, prompt: str, schema: dict[str, Any]) -> tuple[str | None, Usage]:
        from google.genai import types

        try:
            response = self._get_client().models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", response_json_schema=schema, max_output_tokens=MAX_OUTPUT_TOKENS
                ),
            )
        except ProviderError:
            raise
        except Exception as error:
            raise _call_failed(error) from None
        meta = response.usage_metadata
        usage = Usage(
            input_tokens=getattr(meta, "prompt_token_count", None),
            # thinking tokens are billed as output
            output_tokens=(getattr(meta, "candidates_token_count", 0) or 0) + (getattr(meta, "thoughts_token_count", 0) or 0),
        ) if meta else Usage()
        return response.text, usage

    def extract(self, request: ExtractionRequest, prompt: str) -> ProviderResult:  # noqa: ARG002
        text, usage = self.complete_json(prompt, PROVIDER_OUTPUT_SCHEMA)
        return ProviderResult(output=parse_provider_json(text), model_version=self.model, usage=usage)


ADAPTERS = {"anthropic": AnthropicProvider, "openai": OpenAIProvider, "gemini": GeminiProvider}


def make_provider(provider: str, model: str) -> AnthropicProvider | OpenAIProvider | GeminiProvider:
    try:
        return ADAPTERS[provider](model)
    except KeyError:
        raise ValueError(f"unknown provider {provider!r} (known: {', '.join(ADAPTERS)})") from None
