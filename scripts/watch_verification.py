"""Optional local watch loop for explicit ProofLayer monitoring checks."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.continuous_verification.engine import (  # noqa: E402
    ContinuousVerificationEngine,
    monitoring_config,
)


MINIMUM_INTERVAL_SECONDS = 60


def parse_interval(value: str) -> int:
    try:
        interval = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("interval must be an integer") from error
    if interval < MINIMUM_INTERVAL_SECONDS:
        raise argparse.ArgumentTypeError(
            f"interval must be at least {MINIMUM_INTERVAL_SECONDS} seconds"
        )
    return interval


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a local read-only ProofLayer monitoring loop."
    )
    parser.add_argument("--asset", required=True, choices=("USDY", "PAXG"), type=str.upper)
    parser.add_argument("--interval", type=parse_interval)
    args = parser.parse_args()
    config = monitoring_config(args.asset)
    interval = args.interval or config.check_interval_seconds
    engine = ContinuousVerificationEngine()

    print(
        f"Watching {config.asset} / {config.claim} every {interval}s "
        "(LOCAL / MVP, read-only). Press Ctrl+C to stop."
    )
    try:
        while True:
            result = engine.run_monitoring_check(config.asset, config.claim)
            snapshot = result.current_snapshot
            stamp = snapshot.checked_at.strftime("%H:%M:%S")
            print(
                f"[{stamp}] {snapshot.asset} check complete — "
                f"{snapshot.verification_result}"
            )
            for transition in result.transitions:
                print(
                    f"[{stamp}] Transition detected: {transition.category} "
                    f"{transition.previous_value} -> {transition.current_value} "
                    f"({transition.severity})"
                )
            time.sleep(interval)
    except KeyboardInterrupt:
        print("Monitoring stopped cleanly. No blockchain writes were performed.")


if __name__ == "__main__":
    main()
