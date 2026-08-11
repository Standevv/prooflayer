"""Generate fresh deterministic-input USDY demo certificates."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.rvc.certificate_serializer import serialize_certificate
from services.rvc.models import (
    EvidenceRecord,
    VerificationCertificate,
    VerificationResult,
)
from services.rvc.treasury_backing import verify_treasury_backing


OUTPUT_DIRECTORY = PROJECT_ROOT / "data" / "demo"
PASS_OUTPUT = OUTPUT_DIRECTORY / "usdy-pass-certificate.json"
INDETERMINATE_OUTPUT = OUTPUT_DIRECTORY / "usdy-indeterminate-certificate.json"
MINIMUM_REMAINING_VALIDITY_SECONDS = 300


def _usdy_evidence(evaluation_time: datetime) -> list[EvidenceRecord]:
    shared = {"asset": "USDY", "observed_at": evaluation_time}
    return [
        EvidenceRecord(
            source_id="ondo-product",
            source_type="issuer",
            root_source_id="ondo",
            field="asset_class",
            value="TOKENIZED_TREASURY",
            **shared,
        ),
        EvidenceRecord(
            source_id="ondo-portfolio",
            source_type="issuer",
            root_source_id="ondo",
            field="underlying_asset_value",
            value=2_160_000_000,
            unit="USD",
            **shared,
        ),
        EvidenceRecord(
            source_id="ondo-portfolio",
            source_type="issuer",
            root_source_id="ondo",
            field="outstanding_token_value",
            value=2_130_000_000,
            unit="USD",
            **shared,
        ),
        EvidenceRecord(
            source_id="ondo-portfolio",
            source_type="issuer",
            root_source_id="ondo",
            field="collateralization_ratio",
            value=1.014,
            **shared,
        ),
        EvidenceRecord(
            source_id="ondo-portfolio",
            source_type="issuer",
            root_source_id="ondo",
            field="treasury_exposure",
            value=0.99,
            **shared,
        ),
        EvidenceRecord(
            source_id="ondo-attestation",
            source_type="attestation",
            root_source_id="ondo",
            field="attestation_timestamp",
            value=evaluation_time,
            **shared,
        ),
        EvidenceRecord(
            source_id="ondo-contract",
            source_type="onchain",
            root_source_id="ethereum",
            field="issuer_contract_verified",
            value=True,
            **shared,
        ),
        EvidenceRecord(
            source_id="usdy-total-supply",
            source_type="onchain",
            root_source_id="ethereum",
            field="onchain_supply",
            value=2_130_000_000,
            unit="USD",
            **shared,
        ),
    ]


def _write_fixture(name: str, certificate: VerificationCertificate) -> Path:
    serialized = serialize_certificate(certificate)
    output_path = OUTPUT_DIRECTORY / name
    output_path.write_text(
        json.dumps(serialized.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return output_path


def _evaluation_time() -> datetime:
    """Reuse a still-fresh fixture epoch, otherwise begin a new RVC window."""
    now = datetime.now(timezone.utc)
    try:
        existing = [
            json.loads(path.read_text(encoding="utf-8"))
            for path in (PASS_OUTPUT, INDETERMINATE_OUTPUT)
        ]
        observed_values = {
            int(item["solidity"]["observedAt"]) for item in existing
        }
        valid_until_values = {
            int(item["solidity"]["validUntil"]) for item in existing
        }
        if (
            len(observed_values) == 1
            and len(valid_until_values) == 1
            and next(iter(valid_until_values))
            > int(now.timestamp()) + MINIMUM_REMAINING_VALIDITY_SECONDS
        ):
            return datetime.fromtimestamp(
                next(iter(observed_values)), timezone.utc
            ).replace(tzinfo=None)
    except (FileNotFoundError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        pass

    return now.replace(tzinfo=None, microsecond=0)


def main() -> None:
    evaluation_time = _evaluation_time()
    pass_evidence = _usdy_evidence(evaluation_time)
    indeterminate_evidence = [
        item for item in pass_evidence if item.field != "onchain_supply"
    ]

    pass_certificate = verify_treasury_backing(
        "USDY", pass_evidence, verification_time=evaluation_time
    )
    indeterminate_certificate = verify_treasury_backing(
        "USDY", indeterminate_evidence, verification_time=evaluation_time
    )
    if pass_certificate.result is not VerificationResult.PASS:
        raise RuntimeError(f"expected PASS fixture, got {pass_certificate.result.value}")
    if indeterminate_certificate.result is not VerificationResult.INDETERMINATE:
        raise RuntimeError(
            "expected INDETERMINATE fixture, "
            f"got {indeterminate_certificate.result.value}"
        )

    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    pass_path = _write_fixture("usdy-pass-certificate.json", pass_certificate)
    indeterminate_path = _write_fixture(
        "usdy-indeterminate-certificate.json", indeterminate_certificate
    )

    print(f"Wrote {pass_path.relative_to(PROJECT_ROOT)}")
    print(f"Wrote {indeterminate_path.relative_to(PROJECT_ROOT)}")
    print(f"Shared RVC evaluation time: {evaluation_time.isoformat()}Z")
    print("Validity horizon: 1 hour from the shared RVC evaluation time")


if __name__ == "__main__":
    main()
