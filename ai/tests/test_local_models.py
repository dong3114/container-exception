"""The local model manifest (ai/evals/local-models.json) stays in step with the code that uses those models."""

from __future__ import annotations

import json
import re
from pathlib import Path

from cera_ai.evals.pricing import LOCAL_MODELS, PRICES

AI_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((AI_ROOT / "evals" / "local-models.json").read_text(encoding="utf-8"))
LADDER = (AI_ROOT.parent / "infra" / "local" / "eval-ladder.sh").read_text(encoding="utf-8")


def test_manifest_lists_exactly_the_priced_local_models() -> None:
    names = [m["name"] for m in MANIFEST["models"]]
    assert sorted(names) == sorted(LOCAL_MODELS)
    assert all(PRICES[n] == (0.0, 0.0) for n in names)


def test_every_model_pins_a_revision_and_file_hash() -> None:
    for m in MANIFEST["models"]:
        assert re.fullmatch(r"[0-9a-f]{40}", m["revision"]), m["name"]
        assert m["files"] and all(re.fullmatch(r"[0-9a-f]{64}", f["sha256"]) for f in m["files"]), m["name"]
        assert m["hf_spec"] == f"{m['gguf_repo']}:{m['quantization']}", m["name"]


def test_ladder_script_uses_the_manifest_models_and_licenses_are_not_hidden() -> None:
    for m in MANIFEST["models"]:
        assert f'"{m["hf_spec"]} {m["name"]}"' in LADDER, m["name"]
    by_name = {m["name"]: m for m in MANIFEST["models"]}
    assert by_name["qwen2.5-3b-instruct-q4_k_m"]["commercial_use"] is False  # Qwen Research License
    assert by_name["qwen3-4b-instruct-2507-q4_k_m"]["gguf_publisher"].startswith("unsloth")  # third-party conversion is stated
