from pathlib import Path

import pytest

from cera_ai.config import KEYS, SettingsError, env_keys, load_settings

EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"
TOKEN = "t" * 32


def example_values() -> dict[str, str]:
    out = {}
    for line in EXAMPLE.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            out[key.strip()] = value.strip()
    return out


def test_env_example_lists_exactly_the_known_keys():
    assert env_keys(EXAMPLE.read_text(encoding="utf-8")) == list(KEYS)


def test_env_example_is_valid_as_is_and_everything_is_off():
    s = load_settings(example_values())
    assert (s.env, s.llm_mode, s.decision_mode, s.agent_mode, s.port) == ("local", "replay", "off", "off", 8100)


def issues(**source: str) -> str:
    with pytest.raises(SettingsError) as info:
        load_settings(source)
    return "\n".join(info.value.issues)


def test_production_forbids_replay_modes():
    assert "CERA_LLM_MODE" in issues(CERA_AI_ENV="production")
    live = dict(CERA_AI_ENV="production", CERA_LLM_MODE="live", CERA_LLM_PROVIDER="openai", CERA_LLM_MODEL="m", OPENAI_API_KEY="k")
    load_settings(live)
    assert "CERA_DECISION_MODE" in issues(**live, CERA_DECISION_MODE="replay")


def test_live_llm_needs_vendor_model_and_that_vendors_key_without_echoing_values():
    assert "CERA_LLM_PROVIDER" in issues(CERA_LLM_MODE="live", CERA_LLM_MODEL="m")
    text = issues(CERA_LLM_MODE="live", CERA_LLM_PROVIDER="anthropic", CERA_LLM_MODEL="m", OPENAI_API_KEY="sk-secret")
    assert "ANTHROPIC_API_KEY" in text and "sk-secret" not in text


def test_decision_live_needs_a_provider_and_its_key():
    assert "CERA_DECISION_PROVIDER" in issues(CERA_DECISION_MODE="live")
    assert "OPENROUTER_API_KEY" in issues(CERA_DECISION_MODE="live", CERA_DECISION_PROVIDER="jev")
    assert "llm_judge" in issues(CERA_DECISION_MODE="live", CERA_DECISION_PROVIDER="llm_judge")
    load_settings({"CERA_DECISION_MODE": "live", "CERA_DECISION_PROVIDER": "nli"})


def test_agent_mode_needs_a_long_service_token_and_caps_are_bounded():
    text = issues(CERA_AGENT_MODE="on", CERA_AGENT_TOOL_TOKEN="short-secret")
    assert "CERA_AGENT_TOOL_TOKEN" in text and "short-secret" not in text
    assert load_settings({"CERA_AGENT_MODE": "on", "CERA_AGENT_TOOL_TOKEN": TOKEN}).agent_mode == "on"
    assert "CERA_AGENT_MAX_STEPS" in issues(CERA_AGENT_MAX_STEPS="0")
    assert "CERA_BACKEND_TOOL_URL" in issues(CERA_BACKEND_TOOL_URL="localhost:3100")


def test_local_vendor_needs_no_key_but_a_url():
    live = dict(CERA_LLM_MODE="live", CERA_LLM_PROVIDER="local", CERA_LLM_MODEL="qwen2.5-1.5b-instruct-q4_k_m")
    assert load_settings(live).llm_provider == "local"
    assert "CERA_LOCAL_LLM_BASE_URL" in issues(**live, CERA_LOCAL_LLM_BASE_URL="llm:8080")


def test_failover_needs_live_mode_a_model_a_different_target_and_that_vendors_key():
    live = dict(CERA_LLM_MODE="live", CERA_LLM_PROVIDER="openai", CERA_LLM_MODEL="m1", OPENAI_API_KEY="k1")
    assert load_settings(live).llm_fallback_provider is None  # optional
    both = dict(live, CERA_LLM_FALLBACK_PROVIDER="gemini", CERA_LLM_FALLBACK_MODEL="g1", GEMINI_API_KEY="k2")
    assert load_settings(both).llm_fallback_provider == "gemini"
    text = issues(**dict(live, CERA_LLM_FALLBACK_PROVIDER="gemini", CERA_LLM_FALLBACK_MODEL="g1"))
    assert "GEMINI_API_KEY" in text and "k1" not in text
    assert "CERA_LLM_FALLBACK_MODEL" in issues(**dict(live, CERA_LLM_FALLBACK_PROVIDER="gemini", GEMINI_API_KEY="k2"))
    assert "differ" in issues(**dict(live, CERA_LLM_FALLBACK_PROVIDER="openai", CERA_LLM_FALLBACK_MODEL="m1"))
    assert load_settings(dict(live, CERA_LLM_FALLBACK_PROVIDER="openai", CERA_LLM_FALLBACK_MODEL="m2")).llm_fallback_provider == "openai"
    assert "CERA_LLM_FALLBACK_PROVIDER" in issues(**dict(live, CERA_LLM_FALLBACK_PROVIDER="nope", CERA_LLM_FALLBACK_MODEL="x"))
    assert "live mode only" in issues(CERA_LLM_FALLBACK_PROVIDER="gemini", CERA_LLM_FALLBACK_MODEL="g1", GEMINI_API_KEY="k2")
    assert "CERA_LOCAL_LLM_BASE_URL" in issues(**dict(live, CERA_LLM_FALLBACK_PROVIDER="local", CERA_LLM_FALLBACK_MODEL="q", CERA_LOCAL_LLM_BASE_URL="llm:8080"))
