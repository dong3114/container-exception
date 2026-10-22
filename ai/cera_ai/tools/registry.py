"""CERA Tool Registry for the Agent Runtime (T-103 · ADR-036) — framework neutral.

Definitions come from the Backend-generated contract file ``packages/contracts/agent-tools/agent-tools.v1.json``;
nothing here re-declares a DTO. T-104 wraps these definitions as LangGraph tools; this module does not import
LangChain/LangGraph.

Only what the Backend registers exists. There is no COMMIT category: approve, send, confirm a fact, choose the final
plan and change the registry are not tools.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

CONTRACT_PATH = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "agent-tools" / "agent-tools.v1.json"
CATEGORIES = ("READ", "EXTERNAL_READ", "COMPUTE", "PROPOSE", "REQUEST")
SIDE_EFFECT_CATEGORIES = ("PROPOSE", "REQUEST")


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    version: str
    category: str
    description: str
    timeout_ms: int
    idempotency: str  # REQUIRED | NONE
    input_schema: dict[str, Any] = field(repr=False)
    output_schema: dict[str, Any] = field(repr=False)

    @property
    def has_side_effects(self) -> bool:
        return self.category in SIDE_EFFECT_CATEGORIES


@dataclass(frozen=True)
class ToolRegistry:
    schema_version: str
    envelope_schema_version: str
    tools: dict[str, ToolDefinition]
    error_codes: dict[str, Any]

    def get(self, name: str) -> ToolDefinition | None:
        return self.tools.get(name)

    def names(self) -> list[str]:
        return list(self.tools)


def load_registry(path: Path = CONTRACT_PATH) -> ToolRegistry:
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schema_version") != "agent-tools/1":
        raise ValueError(f"unsupported agent tool contract version: {doc.get('schema_version')!r}")
    tools: dict[str, ToolDefinition] = {}
    for t in doc["tools"]:
        if t["category"] not in CATEGORIES:
            raise ValueError(f"tool {t['name']} has a category agents may not use: {t['category']}")
        tools[t["name"]] = ToolDefinition(
            name=t["name"],
            version=t["version"],
            category=t["category"],
            description=t["description"],
            timeout_ms=int(t["timeout_ms"]),
            idempotency=t["idempotency"],
            input_schema=t["input_schema"],
            output_schema=t["output_schema"],
        )
    return ToolRegistry(doc["schema_version"], doc["envelope_schema_version"], tools, doc.get("error_codes", {}))
