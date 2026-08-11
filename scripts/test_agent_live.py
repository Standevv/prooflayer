"""Explicit opt-in live smoke test. This performs one paid OpenAI agent run."""

from __future__ import annotations

import asyncio
import json

from services.agent.verification_agent import run_verification_agent


async def main() -> None:
    response = await run_verification_agent(
        "Investigate USDY TreasuryBacking and explain current verification and PolicyGate state."
    )
    print(json.dumps(response.model_dump(), indent=2))


if __name__ == "__main__":
    asyncio.run(main())
