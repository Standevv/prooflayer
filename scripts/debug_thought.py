"""Debug thought_signature handling through an opt-in provider request.

Importing this module is safe: credentials are not loaded and no provider
request is made until the script is run with ``--allow-network``.
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


def _require_network_opt_in(allow_network: bool) -> None:
    if not allow_network:
        raise RuntimeError(
            "Provider diagnostics are disabled. Run this script with "
            "--allow-network to opt in explicitly."
        )


async def run_diagnostic(*, allow_network: bool = False) -> None:
    _require_network_opt_in(allow_network)
    load_dotenv(ROOT / ".env", override=False)
    from openai import AsyncOpenAI
    from services.agent.verification_agent import (
        _NATIVE_TOOL_MANIFEST,
        configured_api_key,
        configured_base_url,
        configured_model,
    )

    provider = AsyncOpenAI(
        api_key=configured_api_key(),
        base_url=configured_base_url(),
        timeout=45.0,
        max_retries=0,
    )
    messages = [
        {"role": "system", "content": "You are a prooflayer agent."},
        {"role": "user", "content": "Check USDY"},
    ]
    response = await provider.chat.completions.create(
        model=configured_model(),
        messages=messages,
        tools=_NATIVE_TOOL_MANIFEST,
        tool_choice="auto",
        max_tokens=200,
        temperature=0.0,
        extra_body={"reasoning_effort": "low"},
    )
    choice = response.choices[0]
    msg = choice.message

    dumped = msg.model_dump()
    print("=== model_dump ===")
    print(json.dumps(dumped, indent=2, default=str)[:3000])

    if msg.tool_calls:
        tc = msg.tool_calls[0]
        print(f"\ntool_call type: {type(tc)}")
        attrs = [a for a in dir(tc) if not a.startswith("_")]
        print(f"tool_call attrs: {attrs}")
        extra = getattr(tc, "extra_content", None)
        print(f"extra_content: {extra}")
        print(f"extra_content type: {type(extra)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-network",
        action="store_true",
        help="Explicitly allow the external provider request.",
    )
    args = parser.parse_args()
    if not args.allow_network:
        parser.error("provider diagnostics require the explicit --allow-network flag")
    try:
        asyncio.run(run_diagnostic(allow_network=True))
    except Exception as error:
        # Provider exceptions may contain request details. Never echo the raw
        # exception from a credential-bearing diagnostic.
        print(f"Diagnostic failed: {type(error).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
