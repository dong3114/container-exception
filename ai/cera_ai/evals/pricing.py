"""List prices used for cost estimates (USD per 1M tokens, standard tier, short context).

Checked 2026-10-12, re-checked 2026-10-22 (T-099 resume) against the vendors' official pricing pages (URLs below). Prices change — re-check before quoting.
A provider-reported cost (Jev ``usage.cost``) takes precedence over this table.
"""

from __future__ import annotations

CHECKED_ON = "2026-10-22"
SOURCES = {
    "anthropic": "https://platform.claude.com/docs/en/about-claude/pricing",
    "openai": "https://developers.openai.com/api/docs/pricing",
    "gemini": "https://ai.google.dev/gemini-api/docs/pricing",
    "jev": "https://openrouter.ai/docs/guides/community/jev · https://openrouter.ai/blog/insights/what-is-jev/ (model page 404 on 2026-10-22 — rate from the blog)",
}

# model -> (input $/1M, output $/1M)
PRICES: dict[str, tuple[float, float]] = {
    "claude-fable-5-1": (10.00, 50.00),
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),  # prompts up to 100k tokens
    "gpt-6-astra": (10.00, 50.00),
    "gpt-6.1-sol": (2.00, 10.00),
    "gpt-6-luna": (0.10, 0.50),
    "gemini-4-argon": (2.00, 10.00),  # through 2026-11-30; $4/$20 from 2026-12-01
    "gemini-3.8-flash": (0.75, 3.75),  # through 2026-12-31; $1.50/$7.50 from 2027-01-01
    "gemini-3.5-flash-lite": (0.30, 2.50),
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "typesafe/jev-1.14": (0.042, 0.0),  # current (2026-10-14); output free. Prefer the reported usage.cost
    "typesafe/jev-1.13": (0.042, 0.0),  # previous, still served
}


# Self-hosted models (provider ``local``) cost nothing per token — electricity and hardware are not metered here.
# Models are listed by the name the eval run is given (the GGUF repo:quant shipped in infra/local/compose.yaml).
LOCAL_MODELS = (
    "qwen2.5-0.5b-instruct-q4_k_m", "qwen2.5-1.5b-instruct-q4_k_m", "qwen2.5-3b-instruct-q4_k_m", "qwen3-4b-instruct-2507-q4_k_m", "qwen2.5-7b-instruct-q4_k_m",
)
PRICES.update({m: (0.0, 0.0) for m in LOCAL_MODELS})


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float | None:
    price = PRICES.get(model)
    if price is None:
        return None
    return input_tokens / 1e6 * price[0] + output_tokens / 1e6 * price[1]
