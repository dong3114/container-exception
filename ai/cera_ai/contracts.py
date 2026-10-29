"""Reply extraction contract v2 (docs/18 D.3 · T-111; v1 requests are still accepted) — NestJS Main Backend <-> Python AI Server.

The AI Server receives the asks the Backend already made (ask_id, question, the fields it may answer, units)
and the exact source text. It returns value *candidates* with a verbatim quote. The output has **no place**
for entity ids, fact keys, sender identity, strength or confidence decisions — those belong to the Backend
(ADR-026 · ADR-029 · ADR-033). Unknown keys are rejected on both sides (extra="forbid").
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = "reply-extract/2"
SCHEMA_VERSIONS = ("reply-extract/1", "reply-extract/2")
ContractVersion = Literal["reply-extract/1", "reply-extract/2"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AskField(_Strict):
    """A field the Backend asked for. kind decides the value format; unit is the expected unit (null for times and dates).
    DATE (v2) = the calendar day the answer is about, YYYY-MM-DD in the request timezone."""

    name: str = Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=60)
    kind: Literal["QUANTITY", "TIME", "MONEY", "DATE"]
    unit: str | None = Field(default=None, pattern=r"^[A-Z0-9][A-Z0-9_]*$")


class AskWindow(_Strict):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    from_: str = Field(alias="from", pattern=r"^\d{2}:\d{2}$")
    to: str = Field(pattern=r"^\d{2}:\d{2}$")


class Ask(_Strict):
    ask_id: str = Field(max_length=40)
    question: str = Field(max_length=500)
    # ARRIVAL_DATETIME (T-137): when the named vessel arrived / will arrive — the Backend made the ask from a registered vessel call
    answer_shape: Literal["QUANTITY_IN_TIME_WINDOW", "QUANTITY_ON_DATE", "ARRIVAL_DATETIME"]
    fields: list[AskField] = Field(min_length=1, max_length=10)
    window: AskWindow | None = None


class ExtractionRequest(_Strict):
    schema_version: ContractVersion
    # Identifies the inbound message the text came from (the Backend's id — opaque to the AI Server).
    inbound_message_id: str = Field(max_length=40)
    # Relative expressions ("tomorrow afternoon") are read against this date — never the server clock.
    reference_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    counterparty_name: str = Field(max_length=100)
    asks: list[Ask] = Field(min_length=1, max_length=10)
    # The exact text the Backend will check quotes against (same representation on both sides).
    message_text: str = Field(max_length=20_000)
    # v2: the date the reply was sent (its evidence time) in `timezone` — relative days in the reply ("tomorrow") are
    # relative to this, not to the asked date. The Backend re-derives dates from the quote; a model date is a candidate.
    reply_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    timezone: Literal["Asia/Seoul"] | None = None


class Evidence(_Strict):
    quote: str = Field(min_length=1, max_length=500)


class Answer(_Strict):
    ask_id: str = Field(max_length=40)
    field: str = Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=60)
    raw_value: str = Field(max_length=200)
    value: str = Field(max_length=100)
    unit: str | None = Field(default=None, max_length=40)
    evidence: Evidence
    confidence: float | None = Field(default=None, ge=0, le=1)


class Usage(_Strict):
    input_tokens: int | None = None
    output_tokens: int | None = None


class Meta(_Strict):
    provider: str = Field(max_length=40)
    model_version: str = Field(max_length=60)
    prompt_version: str = Field(max_length=20)
    latency_ms: int = Field(ge=0)
    usage: Usage | None = None


class ExtractionResponse(_Strict):
    schema_version: ContractVersion
    outcome: Literal["VALUES", "NO_CHANGE", "REFUSAL", "UNPARSEABLE"]
    answers: list[Answer] = Field(default_factory=list, max_length=50)
    unmapped_statements: list[str] = Field(default_factory=list, max_length=50)
    ambiguity_flags: list[str] = Field(default_factory=list, max_length=20)
    meta: Meta


class ProviderOutput(_Strict):
    """What a provider must produce — the response without meta (the server adds meta)."""

    outcome: Literal["VALUES", "NO_CHANGE", "REFUSAL", "UNPARSEABLE"]
    answers: list[Answer] = Field(default_factory=list, max_length=50)
    unmapped_statements: list[str] = Field(default_factory=list, max_length=50)
    ambiguity_flags: list[str] = Field(default_factory=list, max_length=20)
