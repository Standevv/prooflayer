"""Explicit opt-in live agent smoke test.

Importing this module is safe. A paid/provider-backed request is made only
when the script is run with ``--allow-network``.
"""

from __future__ import annotations

import asyncio
import argparse
import json
import sys


def _require_network_opt_in(allow_network: bool) -> None:
    if not allow_network:
        raise RuntimeError(
            "Provider diagnostics are disabled. Run this script with "
            "--allow-network to opt in explicitly."
        )


async def run_diagnostic(*, allow_network: bool = False) -> None:
    _require_network_opt_in(allow_network)
    # Import only after explicit opt-in: this module loads provider
    # configuration, so importing the diagnostic itself must not touch .env.
    from services.agent.verification_agent import run_verification_agent

    response = await run_verification_agent(
        "Investigate USDY TreasuryBacking and explain current verification and PolicyGate state."
    )
    print(json.dumps(response.model_dump(), indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-network",
        action="store_true",
        help="Explicitly allow the paid/external provider request.",
    )
    args = parser.parse_args()
    if not args.allow_network:
        parser.error("provider diagnostics require the explicit --allow-network flag")
    try:
        asyncio.run(run_diagnostic(allow_network=True))
    except Exception as error:
        # Provider errors may include request details. Never echo the raw
        # exception from a credential-bearing diagnostic.
        print(f"Diagnostic failed: {type(error).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
