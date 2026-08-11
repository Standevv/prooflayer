import unittest
from datetime import datetime, timezone

from services.evidence.models import RawEvidence
from services.evidence.normalizer import (
    EvidenceNormalizationError,
    normalize_evidence,
    normalize_evidence_batch,
    normalize_source_id,
)
from services.rvc.models import EvidenceRecord, VerificationResult
from services.rvc.treasury_backing import verify_treasury_backing


OBSERVED_AT = datetime(2026, 1, 15, 12, 0, 0)


def _raw_evidence(**overrides) -> RawEvidence:
    values = {
        "source_type": "issuer",
        "source_id": "ondo",
        "asset": "USDY",
        "field": "asset_class",
        "value": "TOKENIZED_TREASURY",
        "unit": None,
        "observed_at": OBSERVED_AT,
        "metadata": {},
    }
    values.update(overrides)
    return RawEvidence(**values)


class EvidenceNormalizerTests(unittest.TestCase):
    def test_normalizes_rwa_xyz_style_evidence_and_preserves_provenance(self) -> None:
        raw = _raw_evidence(
            source_type="Aggregator",
            source_id="RWA.XYZ",
            asset="usdy",
            field="underlyingAssetValue",
            value=2_160_000_000,
            unit="USD",
            observed_at="2026-01-15T12:00:00Z",
            metadata={
                "root_source_id": "Ondo Finance",
                "retrieved_at": "2026-01-15T12:05:00Z",
            },
        )

        evidence = normalize_evidence(raw)

        self.assertIsInstance(evidence, EvidenceRecord)
        self.assertEqual("aggregator", evidence.source_type)
        self.assertEqual("rwa.xyz", evidence.source_id)
        self.assertEqual("ondo", evidence.root_source_id)
        self.assertEqual("USDY", evidence.asset)
        self.assertEqual("underlying_asset_value", evidence.field)
        self.assertEqual(2_160_000_000, evidence.value)
        self.assertEqual("USD", evidence.unit)
        self.assertEqual(
            datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc),
            evidence.observed_at,
        )
        self.assertEqual(
            datetime(2026, 1, 15, 12, 5, tzinfo=timezone.utc),
            evidence.retrieved_at,
        )

    def test_normalizes_chainlink_style_oracle_evidence(self) -> None:
        evidence = normalize_evidence(
            _raw_evidence(
                source_type="oracle",
                source_id="Chainlink Proof of Reserve",
                field="collateralization-ratio",
                value=1.014,
            )
        )

        self.assertEqual("oracle", evidence.source_type)
        self.assertEqual("chainlink", evidence.source_id)
        self.assertEqual("chainlink", evidence.root_source_id)
        self.assertEqual("collateralization_ratio", evidence.field)

    def test_normalizes_issuer_style_evidence(self) -> None:
        evidence = normalize_evidence(
            _raw_evidence(
                source_id="Ondo Finance",
                field="attestation_timestamp",
                value=OBSERVED_AT,
            )
        )

        self.assertEqual("issuer", evidence.source_type)
        self.assertEqual("ondo", evidence.source_id)
        self.assertEqual("ondo", evidence.root_source_id)
        self.assertEqual(OBSERVED_AT, evidence.value)

    def test_normalizes_onchain_supply_evidence(self) -> None:
        evidence = normalize_evidence(
            _raw_evidence(
                source_type="onchain",
                source_id="Ethereum Mainnet",
                field="onchainSupply",
                value=2_130_000_000,
                unit="USD",
            )
        )

        self.assertEqual("onchain", evidence.source_type)
        self.assertEqual("ethereum", evidence.source_id)
        self.assertEqual("ethereum", evidence.root_source_id)
        self.assertEqual("onchain_supply", evidence.field)
        self.assertEqual(2_130_000_000, evidence.value)
        self.assertEqual("USD", evidence.unit)

    def test_normalizes_supported_source_identifiers_consistently(self) -> None:
        examples = {
            "RWA XYZ": "rwa.xyz",
            "Chainlink SmartData": "chainlink",
            "Ondo Finance": "ondo",
            "Securitize": "securitize",
            "Paxos": "paxos",
            "Ethereum Mainnet": "ethereum",
            "X Layer": "xlayer",
        }

        for raw_source_id, expected in examples.items():
            with self.subTest(raw_source_id=raw_source_id):
                self.assertEqual(expected, normalize_source_id(raw_source_id))

    def test_rejects_invalid_source_type(self) -> None:
        raw = _raw_evidence(source_type="social_media")

        with self.assertRaisesRegex(
            EvidenceNormalizationError, "unsupported source_type"
        ):
            normalize_evidence(raw)

    def test_rejects_missing_required_fields(self) -> None:
        invalid_fields = {
            "source_id": {"source_id": ""},
            "asset": {"asset": ""},
            "field": {"field": "---"},
            "value": {"value": None},
            "observed_at": {"observed_at": None},
        }

        for field_name, override in invalid_fields.items():
            with self.subTest(field_name=field_name):
                with self.assertRaises(EvidenceNormalizationError):
                    normalize_evidence(_raw_evidence(**override))

    def test_same_underlying_source_keeps_one_independent_root(self) -> None:
        evidence = normalize_evidence_batch(
            [
                _raw_evidence(
                    source_type="aggregator",
                    source_id="rwa.xyz",
                    field="underlying_asset_value",
                    value=2_160_000_000,
                    unit="USD",
                    metadata={"root_source_id": "ondo"},
                ),
                _raw_evidence(
                    source_type="issuer",
                    source_id="Ondo Finance",
                    field="outstanding_token_value",
                    value=2_130_000_000,
                    unit="USD",
                ),
            ]
        )

        self.assertEqual({"ondo"}, {item.root_source_id for item in evidence})

    def test_normalized_items_are_usable_by_treasury_backing_verifier(self) -> None:
        raw_evidence = [
            _raw_evidence(field="asset_class", value="TOKENIZED_TREASURY"),
            _raw_evidence(
                source_type="aggregator",
                source_id="RWA.XYZ",
                field="underlyingAssetValue",
                value=2_160_000_000,
                unit="USD",
                metadata={"root_source_id": "ondo"},
            ),
            _raw_evidence(
                field="outstanding_token_value",
                value=2_130_000_000,
                unit="USD",
            ),
            _raw_evidence(
                source_type="oracle",
                source_id="chainlink",
                field="collateralization_ratio",
                value=1.014,
            ),
            _raw_evidence(
                source_type="aggregator",
                source_id="rwa.xyz",
                field="treasury_exposure",
                value=0.99,
                metadata={"root_source_id": "ondo"},
            ),
            _raw_evidence(field="attestation_timestamp", value=OBSERVED_AT),
            _raw_evidence(
                source_type="onchain",
                source_id="ethereum",
                field="issuer_contract_verified",
                value=True,
            ),
            _raw_evidence(
                source_type="onchain",
                source_id="ethereum",
                field="onchain_supply",
                value=2_130_000_000,
                unit="USD",
            ),
        ]

        certificate = verify_treasury_backing(
            "USDY",
            normalize_evidence_batch(raw_evidence),
            max_attestation_age_hours=1_000_000,
        )

        self.assertEqual(VerificationResult.PASS, certificate.result)
        self.assertEqual(3, certificate.independent_root_count)


if __name__ == "__main__":
    unittest.main()
