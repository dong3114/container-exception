"""python -m cera_ai.emit_schema — writes the JSON Schema of the current (v2) request/response to packages/contracts/ai/.
The v1 files there stay as they were (frozen history): v1 requests are still accepted (tests keep reading the v1 samples).
The Backend's tests read it and the shared samples; tests on both sides fail when the contract drifts."""

import json
from pathlib import Path

from .contracts import ExtractionRequest, ExtractionResponse

OUT = Path(__file__).resolve().parents[2] / "packages" / "contracts" / "ai" / "reply-extract.v2.schema.json"


def render() -> str:
    doc = {
        "title": "CERA reply extraction v2 (Main Backend <-> AI Server; also accepts v1 requests)",
        "request": ExtractionRequest.model_json_schema(by_alias=True),
        "response": ExtractionResponse.model_json_schema(by_alias=True),
    }
    return json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    OUT.write_text(render(), encoding="utf-8")
    print(f"written {OUT}")
