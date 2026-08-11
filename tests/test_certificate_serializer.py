import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from services.rvc.certificate_serializer import serialize_certificate
from services.rvc.models import VerificationCertificate, VerificationResult


OBSERVED_AT = datetime(2026, 8, 8, 18, 0, 0, tzinfo=timezone.utc)
VALID_EVIDENCE_ROOT = "0x" + "ab" * 32


def _certificate(
    result: VerificationResult | str = VerificationResult.PASS,
    *,
    evidence_root: str = VALID_EVIDENCE_ROOT,
    valid_until: datetime = OBSERVED_AT + timedelta(hours=1),
) -> VerificationCertificate:
    return VerificationCertificate(
        certificate_id="upstream-rvc-id-is-not-used-on-chain",
        asset_id="USDY",
        claim_type="TreasuryBacking",
        claim_version="1.0",
        policy_id="default-treasury-policy",
        policy_version="1.0",
        result=result,  # type: ignore[arg-type]
        predicate_results=[],
        reason_codes=[],
        evidence_root=evidence_root,
        independent_root_count=2,
        observed_at=OBSERVED_AT,
        valid_until=valid_until,
    )


class CertificateSerializerTests(unittest.TestCase):
    def test_pass_maps_to_result_one(self) -> None:
        serialized = serialize_certificate(_certificate(VerificationResult.PASS))
        self.assertEqual(1, serialized.solidity.result)

    def test_indeterminate_maps_to_result_zero(self) -> None:
        serialized = serialize_certificate(
            _certificate(VerificationResult.INDETERMINATE)
        )
        self.assertEqual(0, serialized.solidity.result)

    def test_fail_maps_to_result_two(self) -> None:
        serialized = serialize_certificate(_certificate(VerificationResult.FAIL))
        self.assertEqual(2, serialized.solidity.result)

    def test_asset_id_is_deterministic_and_matches_ethereum_keccak(self) -> None:
        first = serialize_certificate(_certificate()).solidity.asset_id
        second = serialize_certificate(_certificate()).solidity.asset_id
        self.assertEqual(first, second)
        self.assertEqual(
            "0xeb3420dc333cd737f3fc1d31d856a828e115a3cf3ba02411617a9bd7a2c92d32",
            first,
        )

    def test_claim_type_is_deterministic(self) -> None:
        first = serialize_certificate(_certificate()).solidity.claim_type
        second = serialize_certificate(_certificate()).solidity.claim_type
        self.assertEqual(first, second)
        self.assertEqual(
            "0x4225cb9f93fdb83b09fd8855e6c0074c1f8c0c752fcb5ec250cd1ce0d19f9b81",
            first,
        )

    def test_policy_id_is_deterministic(self) -> None:
        first = serialize_certificate(_certificate()).solidity.policy_id
        second = serialize_certificate(_certificate()).solidity.policy_id
        self.assertEqual(first, second)
        self.assertEqual(
            "0x366771be219871ed41e8979119d44cf0189932eb10bcfc2ce9e8c1664443c591",
            first,
        )

    def test_certificate_id_is_deterministic_from_onchain_contents(self) -> None:
        original = _certificate()
        different_upstream_id = replace(original, certificate_id="another-rvc-id")
        self.assertEqual(
            serialize_certificate(original).solidity.certificate_id,
            serialize_certificate(different_upstream_id).solidity.certificate_id,
        )

    def test_evidence_root_is_preserved_or_derived_deterministically(self) -> None:
        preserved = serialize_certificate(_certificate()).solidity.evidence_root
        first = serialize_certificate(
            _certificate(evidence_root="canonical-evidence-document")
        ).solidity.evidence_root
        second = serialize_certificate(
            _certificate(evidence_root="canonical-evidence-document")
        ).solidity.evidence_root
        self.assertEqual(VALID_EVIDENCE_ROOT, preserved)
        self.assertEqual(first, second)
        self.assertRegex(first, r"^0x[0-9a-f]{64}$")

    def test_valid_until_is_greater_than_observed_at(self) -> None:
        solidity = serialize_certificate(_certificate()).solidity
        self.assertGreater(solidity.valid_until, solidity.observed_at)
        self.assertEqual(3_600, solidity.valid_until - solidity.observed_at)

    def test_unsupported_result_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported verification result"):
            serialize_certificate(_certificate("UNKNOWN"))


if __name__ == "__main__":
    unittest.main()
