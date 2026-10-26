"""AI Server / Agent Runtime settings — one place that names every environment variable and checks the combinations.

Keys must match ``ai/.env.example`` (tests/test_config.py checks both directions). Errors name the key and the reason,
never the value (it may be a secret). The server validates at startup (``python -m cera_ai``); modules that read the
environment directly (providers, adapters, decision) use the same names.

``python -m cera_ai.config`` compares ``ai/.env`` with ``ai/.env.example`` by key name only.
"""

from __future__ import annotations

import re
import sys
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

ENVS = ("local", "test", "staging", "production")
LLM_VENDORS = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "gemini": "GEMINI_API_KEY", "local": None}  # vendor -> key (None = no key)
DECISION_PROVIDERS = ("jev", "llm_judge", "nli")

# key -> (default or None when there is none, what it switches on). Order follows ai/.env.example.
KEYS: dict[str, tuple[str | None, str]] = {
    "CERA_AI_ENV": ("local", "local | test | staging | production — production forbids replay modes"),
    "CERA_AI_HOST": ("127.0.0.1", "bind address; the Main Backend is the only caller"),
    "CERA_AI_PORT": ("8100", "HTTP port"),
    "CERA_AI_LOG_LEVEL": ("INFO", "Python log level"),
    # Generative LLM (extraction candidates, prose) — ADR-033: outputs are candidates only
    "CERA_LLM_MODE": ("replay", "replay = recorded responses, no LLM call · live = CERA_LLM_PROVIDER + CERA_LLM_MODEL"),
    "CERA_LLM_PROVIDER": (None, "live only: anthropic | openai | gemini | local (OpenAI-compatible server, no key)"),
    "CERA_LLM_MODEL": (None, "live only: model id (choice is an ADR decision, T-099)"),
    "CERA_LLM_EFFORT": (None, "optional reasoning effort hint for the adapter"),
    "CERA_AI_REPLAY_DIR": (None, "replay fixtures directory (default ai/fixtures/replay)"),
    "ANTHROPIC_API_KEY": (None, "secret — needed when the anthropic vendor is used"),
    "OPENAI_API_KEY": (None, "secret — needed when the openai vendor is used"),
    "GEMINI_API_KEY": (None, "secret — needed when the gemini vendor is used"),
    "CERA_LOCAL_LLM_BASE_URL": ("http://127.0.0.1:8080/v1", "local vendor: OpenAI-compatible server (compose: http://llm:8080/v1)"),
    "CERA_LOCAL_LLM_API_KEY": (None, "secret, optional — only if the local server requires one"),
    "CERA_LOCAL_LLM_TIMEOUT_S": ("300", "local vendor: one inference request, seconds [ASSUMPTION / DEVELOPMENT SAFETY CEILING] — cold start / CPU are slow; a timeout is MODEL_TIMEOUT"),
    "CERA_COMMERCIAL_LLM_TIMEOUT_S": ("120", "anthropic · openai · gemini: one request, seconds [ASSUMPTION / DEVELOPMENT SAFETY CEILING] — a timeout is MODEL_TIMEOUT"),
    # Decision model (did it answer? committed? conditional? needs a human?) — candidates only
    "CERA_DECISION_MODE": ("off", "off | replay | live — server-side decision step (T-099 evals run their own CLI)"),
    "CERA_DECISION_PROVIDER": (None, "live only: jev | llm_judge | nli"),
    "CERA_DECISION_MODEL": (None, "live only: model id (jev default typesafe/jev-1.13)"),
    "OPENROUTER_API_KEY": (None, "secret — Jev through OpenRouter Decisions API"),
    # Agent Runtime (ADR-036 Proposed, T-104) — calls Backend typed tools only; no DB, no channels, no public APIs
    "CERA_AGENT_MODE": ("off", "off | on — LangGraph runtime endpoints"),
    "CERA_BACKEND_TOOL_URL": ("http://127.0.0.1:3100", "Main Backend tool API base"),
    "CERA_AGENT_TOOL_TOKEN": (None, "secret — same value as back/.env CERA_AGENT_TOOL_TOKEN, 32+ characters"),
    "CERA_AGENT_MAX_STEPS": ("100", "emergency ceiling on graph steps per run (runaway guard, not a product policy) [ASSUMPTION / DEVELOPMENT SAFETY CEILING] — lower it from observed p99 (npm run runtime:stats)"),
    "CERA_AGENT_MAX_TOOL_CALLS": ("50", "emergency ceiling on tool calls per active stretch between waits [ASSUMPTION / DEVELOPMENT SAFETY CEILING]"),
    "CERA_AGENT_MAX_RETRIES": ("3", "retries of a retryable (FAILED + retryable) tool result, same idempotency key [ASSUMPTION / DEVELOPMENT SAFETY CEILING]; exhausting them ends the run with RETRY_LIMIT_REACHED"),
}


class SettingsError(ValueError):
    def __init__(self, issues: list[str]) -> None:
        super().__init__("Invalid AI Server configuration: " + "; ".join(issues))
        self.issues = issues


@dataclass(frozen=True)
class Settings:
    env: str
    host: str
    port: int
    llm_mode: str
    llm_provider: str | None
    decision_mode: str
    decision_provider: str | None
    agent_mode: str
    backend_tool_url: str
    agent_max_steps: int
    agent_max_tool_calls: int
    agent_max_retries: int


def _get(source: Mapping[str, str], key: str) -> str | None:
    value = (source.get(key) or "").strip()
    return value or KEYS[key][0]


def _int(source: Mapping[str, str], key: str, lo: int, hi: int, issues: list[str]) -> int:
    raw = _get(source, key) or "0"
    try:
        value = int(raw)
    except ValueError:
        issues.append(f"{key}: must be an integer")
        return 0
    if not lo <= value <= hi:
        issues.append(f"{key}: must be between {lo} and {hi}")
    return value


def load_settings(source: Mapping[str, str]) -> Settings:
    issues: list[str] = []
    env = _get(source, "CERA_AI_ENV") or "local"
    if env not in ENVS:
        issues.append(f"CERA_AI_ENV: must be one of {', '.join(ENVS)}")
    prod = env == "production"

    llm_mode, vendor = _get(source, "CERA_LLM_MODE"), _get(source, "CERA_LLM_PROVIDER")
    if llm_mode not in ("replay", "live"):
        issues.append("CERA_LLM_MODE: must be replay or live")
    if llm_mode == "replay" and prod:
        issues.append("CERA_LLM_MODE: replay is not allowed in production (recorded answers are not real)")
    if llm_mode == "live":
        if vendor not in LLM_VENDORS:
            issues.append(f"CERA_LLM_PROVIDER: live needs one of {', '.join(LLM_VENDORS)}")
        elif LLM_VENDORS[vendor] and not _get(source, LLM_VENDORS[vendor]):
            issues.append(f"{LLM_VENDORS[vendor]}: required for CERA_LLM_PROVIDER={vendor}")
        if not _get(source, "CERA_LLM_MODEL"):
            issues.append("CERA_LLM_MODEL: required in live mode")

    if vendor == "local" and not re.match(r"^https?://", _get(source, "CERA_LOCAL_LLM_BASE_URL") or ""):
        issues.append("CERA_LOCAL_LLM_BASE_URL: must be an http(s) URL")

    decision_mode, decision = _get(source, "CERA_DECISION_MODE"), _get(source, "CERA_DECISION_PROVIDER")
    if decision_mode not in ("off", "replay", "live"):
        issues.append("CERA_DECISION_MODE: must be off, replay or live")
    if decision_mode == "replay" and prod:
        issues.append("CERA_DECISION_MODE: replay is not allowed in production")
    if decision_mode == "live":
        if decision not in DECISION_PROVIDERS:
            issues.append(f"CERA_DECISION_PROVIDER: live needs one of {', '.join(DECISION_PROVIDERS)}")
        elif decision == "jev" and not _get(source, "OPENROUTER_API_KEY"):
            issues.append("OPENROUTER_API_KEY: required for CERA_DECISION_PROVIDER=jev")
        elif decision == "llm_judge" and llm_mode != "live":
            issues.append("CERA_DECISION_PROVIDER: llm_judge reuses the live LLM settings (CERA_LLM_MODE=live)")

    agent_mode = _get(source, "CERA_AGENT_MODE")
    if agent_mode not in ("off", "on"):
        issues.append("CERA_AGENT_MODE: must be off or on")
    tool_url = _get(source, "CERA_BACKEND_TOOL_URL") or ""
    if not re.match(r"^https?://", tool_url):
        issues.append("CERA_BACKEND_TOOL_URL: must be an http(s) URL")
    if agent_mode == "on" and len(_get(source, "CERA_AGENT_TOOL_TOKEN") or "") < 32:
        issues.append("CERA_AGENT_TOOL_TOKEN: agent mode needs a service token of at least 32 characters")

    port = _int(source, "CERA_AI_PORT", 1, 65_535, issues)
    steps = _int(source, "CERA_AGENT_MAX_STEPS", 1, 200, issues)
    calls = _int(source, "CERA_AGENT_MAX_TOOL_CALLS", 0, 100, issues)
    retries = _int(source, "CERA_AGENT_MAX_RETRIES", 0, 10, issues)
    if issues:
        raise SettingsError(issues)
    return Settings(
        env=env, host=_get(source, "CERA_AI_HOST") or "127.0.0.1", port=port,
        llm_mode=llm_mode or "replay", llm_provider=vendor, decision_mode=decision_mode or "off",
        decision_provider=decision, agent_mode=agent_mode or "off", backend_tool_url=tool_url,
        agent_max_steps=steps, agent_max_tool_calls=calls, agent_max_retries=retries,
    )


def env_keys(text: str) -> list[str]:
    keys = (re.match(r"^\s*([A-Z][A-Z0-9_]*)\s*=", line) for line in text.splitlines())
    return list(dict.fromkeys(m.group(1) for m in keys if m))


def _check(root: Path) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows consoles default to cp949
    example, local = root / ".env.example", root / ".env"
    if not local.exists():
        print(f"{local.name} 없음 — {example.name} 를 복사해 만든다 (모든 값은 기본값으로 동작)")
        return 1
    want, have = env_keys(example.read_text(encoding="utf-8")), set(env_keys(local.read_text(encoding="utf-8")))
    missing, extra = [k for k in want if k not in have], sorted(have - set(want))
    if missing:
        print("ai/.env 에 없는 키(기본값으로 동작): " + ", ".join(missing))
    if extra:
        print("ai/.env.example 에 없는 키(오타 · 옛 키일 수 있음): " + ", ".join(extra))
    if not missing and not extra:
        print("ai/.env 키 목록이 .env.example 과 같다")
    return 1 if missing or extra else 0


if __name__ == "__main__":
    sys.exit(_check(Path(__file__).resolve().parent.parent))
