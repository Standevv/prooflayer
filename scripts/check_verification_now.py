"""Run one explicit, read-only ProofLayer monitoring check."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.continuous_verification.engine import (  # noqa: E402
    ContinuousVerificationEngine,
    monitoring_config,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create and compare one local ProofLayer trust snapshot."
    )
    parser.add_argument("asset", choices=("USDY", "PAXG"), type=str.upper)
    args = parser.parse_args()
    config = monitoring_config(args.asset)
    result = ContinuousVerificationEngine().run_monitoring_check(
        config.asset, config.claim
    )
    snapshot = result.current_snapshot

    print("Current Snapshot")
    print(f"Asset: {snapshot.asset} / {snapshot.claim}")
    print(f"Checked: {snapshot.checked_at.isoformat().replace('+00:00', 'Z')}")
    print(f"Verification: {snapshot.verification_result}")
    print(f"Evidence freshness: {snapshot.evidence_freshness or 'NOT CHECKED'}")
    print(f"Independent roots: {snapshot.independent_root_count}")
    print(
        "Certificate: "
        f"{snapshot.certificate_lifecycle_state} / usable={snapshot.certificate_usable}"
    )
    print(f"PolicyGate: {snapshot.policygate_outcome}")
    print(f"Source status: {snapshot.source_status}")
    print("Transitions since previous snapshot:")
    if not result.transitions:
        print("- None")
    for transition in result.transitions:
        print(
            f"- {transition.severity} {transition.category}: "
            f"{transition.previous_value} -> {transition.current_value}"
        )
    print("Blockchain writes: none")


if __name__ == "__main__":
    main()
