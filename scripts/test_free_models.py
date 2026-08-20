"""Probe available free OpenRouter models for ProofLayer.

This file is a manually invoked, explicitly opt-in network diagnostic. It is
not a test module, and importing it does not load credentials or call a model.
"""
import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI

ROOT = Path(__file__).resolve().parents[1]

CANDIDATES = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3.5-lightning:free",
    "google/gemma-4-31b-it:free",
    "openai/gpt-oss-20b:free",
]

JSON_PROMPT = (
    "Reply with exactly this JSON and nothing else: "
    '{"type": "final", "answer": "ok"}'
)


def _require_network_opt_in(allow_network: bool) -> None:
    if not allow_network:
        raise RuntimeError(
            "Provider diagnostics are disabled. Run this script with "
            "--allow-network to opt in explicitly."
        )


async def probe_model(
    client: AsyncOpenAI,
    name: str,
    *,
    allow_network: bool = False,
) -> str | None:
    _require_network_opt_in(allow_network)
    try:
        r = await client.chat.completions.create(
            model=name,
            messages=[{"role": "user", "content": JSON_PROMPT}],
            max_tokens=50,
            temperature=0.0,
        )
        txt = r.choices[0].message.content.strip()
        print(f"OK: {name} -> {txt[:80]}")
        return name
    except Exception as error:
        # Provider errors can include request details. Report only the type so
        # this diagnostic never echoes credentials or sensitive headers.
        print(f"FAIL: {name} -> {type(error).__name__}")
        return None


async def run_probes(*, allow_network: bool = False) -> None:
    _require_network_opt_in(allow_network)
    load_dotenv(ROOT / ".env", override=False)
    key = os.getenv("AI_API_KEY", "").strip()
    base = os.getenv("AI_BASE_URL", "").strip()
    client = AsyncOpenAI(api_key=key, base_url=base, timeout=15.0)
    for c in CANDIDATES:
        result = await probe_model(client, c, allow_network=True)
        if result:
            return
    print("ALL_FAILED")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-network",
        action="store_true",
        help="Explicitly allow external provider requests.",
    )
    args = parser.parse_args()
    if not args.allow_network:
        parser.error("provider diagnostics require the explicit --allow-network flag")
    asyncio.run(run_probes(allow_network=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
