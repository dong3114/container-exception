"""List prices used for cost estimates (USD per 1M tokens, standard tier, short context).

Checked 2026-10-12 against the vendors' official pricing pages (URLs below). Prices change — re-check before quoting.
A provider-reported cost (Jev ``usage.cost``) takes precedence over this table.
"""

from __future__ import annotations

CHECKED_ON = "2026-10-12"
SOURCES = {
    "anthropic": "https://platform.claude.com/docs/en/about-claude/pricing",
    "openai": "https://developers.openai.com/api/docs/pricing",
    "gemini": "https://ai.google.dev/gemini-api/docs/pricing",
    "jev": "https://openrouter.ai/docs/guides/community/jev (rate: secondary sources — [TO VERIFY] on the OpenRouter model page)",
}

# model -> (input $/1M, output $/1M)
PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),  # prompts up to 100k tokens
    "gpt-6-astra": (10.00, 50.00),
    "gpt-6.1-sol": (2.00, 10.00),
    "gpt-6-luna": (0.10, 0.50),
    "gpt-5.6-luna": (0.20, 1.20),
    "gemini-3.1-pro-preview": (2.00, 12.00),
    "gemini-3.8-flash": (0.75, 3.75),  # through 2026-12-31; $1.50/$7.50 from 2027-01-01
    "gemini-3.5-flash-lite": (0.30, 2.50),
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "typesafe/jev-1.13": (0.042, 0.0),  # output free [TO VERIFY]
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float | None:
    price = PRICES.get(model)
    if price is None:
        return None
    return input_tokens / 1e6 * price[0] + output_tokens / 1e6 * price[1]
