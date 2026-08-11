import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from services.evidence.models import RawEvidence
from services.evidence.normalizer import normalize_evidence_batch
from services.provenance.engine import analyze_provenance
from services.rvc.models import EvidenceRecord, VerificationResult
from services.rvc.treasury_backing import verify_treasury_backing


OBSERVED_AT = datetime(2026, 1, 15, 12, 0, 0)


def _evidence(
    source_id: str,
    root_source_id: str,
    *,
    parents: tuple[str, ...] = (),
    source_type: str = "issuer",
    evidence_tier: str = "A",
    field: str = "asset_class",
    value=1,
    unit: str | None = None,
) -> EvidenceRecord:
    return EvidenceRecord(
        source_id=source_id,
        source_type=source_type,
        root_source_id=root_source_id,
        dependency_parent_ids=list(parents),
        evidence_tier=evidence_tier,
        asset="USDY",
        field=field,
        value=value,
        unit=unit,
        observed_at=OBSERVED_AT,
    )


def _valid_treasury_evidence() -> list[EvidenceRecord]:
    return [
        _evidence("ondo", "ondo", field="asset_class", value="TOKENIZED_TREASURY"),
        _evidence(
            "rwa.xyz",
            "ondo",
            parents=("ondo",),
            source_type="aggregator",
            field="underlying_asset_value",
            value=2_160_000_000,
            unit="USD",
        ),
        _evidence(
            "ondo",
            "ondo",
            field="outstanding_token_value",
            value=2_130_000_000,
            unit="USD",
        ),
        _evidence(
            "chainlink",
            "chainlink",
            source_type="oracle",
            field="collateralization_ratio",
            value=1.014,
        ),
        _evidence(
            "rwa.xyz",
            "ondo",
            parents=("ondo",),
            source_type="aggregator",
            field="treasury_exposure",
            value=0.99,
        ),
        _evidence(
            "independent-attestor",
            "independent-attestor",
            source_type="attestation",
            field="attestation_timestamp",
            value=OBSERVED_AT,
        ),
        _evidence(
            "ethereum",
            "ethereum",
            source_type="onchain",
            field="issuer_contract_verified",
            value=True,
        ),
        _evidence(
            "ethereum",
            "ethereum",
            source_type="onchain",
            field="onchain_supply",
            value=2_130_000_000,
            unit="USD",
        ),
    ]


class ProvenanceEngineTests(unittest.TestCase):
    def test_case_a_collapses_downstream_chain_to_one_root(self) -> None:
        evidence = [
            _evidence("ondo", "ondo"),
            _evidence(
                "rwa.xyz",
                "ondo",
                parents=("ondo",),
                source_type="aggregator",
            ),
            _evidence(
                "api-a",
                "ondo",
                parents=("rwa.xyz",),
                source_type="aggregator",
            ),
            _evidence(
                "dashboard-b",
                "ondo",
                parents=("api-a",),
                source_type="aggregator",
            ),
        ]

        result = analyze_provenance(evidence)

        self.assertEqual(1, result.independent_root_count)
        self.assertEqual(["ondo"], result.independent_root_ids)
        self.assertEqual(
            ["api-a", "dashboard-b", "ondo", "rwa.xyz"],
            result.dependency_groups["ondo"],
        )
        self.assertEqual(4, result.source_count)
        self.assertEqual(3, result.dependent_source_count)
        self.assertEqual(
            ["api-a", "dashboard-b", "rwa.xyz"],
            result.duplicated_or_dependent_sources,
        )

        observations = {
            item["source_id"]: item
            for item in result.provenance_summary["observations"]
        }
        self.assertEqual(["ondo"], observations["rwa.xyz"]["parent_source_ids"])
        self.assertEqual(["rwa.xyz"], observations["api-a"]["parent_source_ids"])
        self.assertEqual(
            ["api-a"], observations["dashboard-b"]["parent_source_ids"]
        )

    def test_case_b_counts_resolved_trusted_roots_only(self) -> None:
        result = analyze_provenance(
            [
                _evidence("ondo", "ondo", source_type="issuer"),
                _evidence(
                    "independent-attestor",
                    "independent-attestor",
                    source_type="attestation",
                ),
                _evidence("ethereum", "ethereum", source_type="onchain"),
            ]
        )

        self.assertEqual(2, result.independent_root_count)
        self.assertEqual(["ethereum", "ondo"], result.independent_root_ids)
        self.assertEqual(1, result.unknown_root_count)
        self.assertEqual(["independent-attestor"], result.unknown_root_ids)
        self.assertEqual(3, result.source_count)
        self.assertEqual(1, result.dependent_source_count)
        self.assertEqual(["independent-attestor"], result.duplicated_or_dependent_sources)

    def test_case_c_collapses_different_sources_with_the_same_root(self) -> None:
        result = analyze_provenance(
            [
                _evidence("api-a", "ondo", source_type="aggregator"),
                _evidence("dashboard-b", "ondo", source_type="aggregator"),
            ]
        )

        self.assertEqual(1, result.independent_root_count)
        self.assertEqual(["ondo"], result.independent_root_ids)
        self.assertEqual(["api-a", "dashboard-b"], result.dependency_groups["ondo"])

    def test_case_d_handles_empty_evidence(self) -> None:
        result = analyze_provenance([])

        self.assertEqual(0, result.independent_root_count)
        self.assertEqual([], result.independent_root_ids)
        self.assertEqual({}, result.dependency_groups)
        self.assertEqual(0, result.source_count)
        self.assertEqual(0, result.dependent_source_count)
        self.assertEqual([], result.duplicated_or_dependent_sources)
        self.assertEqual([], result.provenance_summary["observations"])
        self.assertEqual({}, result.provenance_summary["roots"])

    def test_case_e_summary_preserves_mixed_tiers_and_source_types(self) -> None:
        result = analyze_provenance(
            [
                _evidence(
                    "ondo",
                    "ondo",
                    source_type="issuer",
                    evidence_tier="A",
                ),
                _evidence(
                    "rwa.xyz",
                    "ondo",
                    parents=("ondo",),
                    source_type="aggregator",
                    evidence_tier="C",
                    field="treasury_exposure",
                ),
                _evidence(
                    "chainlink",
                    "chainlink",
                    source_type="oracle",
                    evidence_tier="B",
                    field="collateralization_ratio",
                ),
            ]
        )

        preserved = {
            (item["source_id"], item["source_type"], item["evidence_tier"])
            for item in result.provenance_summary["observations"]
        }
        self.assertEqual(
            {
                ("ondo", "issuer", "A"),
                ("rwa.xyz", "aggregator", "C"),
                ("chainlink", "oracle", "B"),
            },
            preserved,
        )
        self.assertEqual(2, result.independent_root_count)

    def test_dependency_metadata_from_normalization_is_represented(self) -> None:
        raw_evidence = [
            RawEvidence(
                source_type="issuer",
                source_id="ondo",
                asset="USDY",
                field="asset_class",
                value="TOKENIZED_TREASURY",
                unit=None,
                observed_at=OBSERVED_AT,
            ),
            RawEvidence(
                source_type="aggregator",
                source_id="rwa.xyz",
                asset="USDY",
                field="treasury_exposure",
                value=0.99,
                unit=None,
                observed_at=OBSERVED_AT,
                metadata={
                    "root_source_id": "ondo",
                    "dependency_parent_ids": ["ondo"],
                },
            ),
        ]

        result = analyze_provenance(normalize_evidence_batch(raw_evidence))

        node = next(
            node for node in result.graph.nodes if node.source_id == "rwa.xyz"
        )
        self.assertEqual(("ondo",), node.parent_source_ids)
        self.assertEqual(1, result.independent_root_count)

    def test_multiple_fields_from_one_source_do_not_inflate_source_count(self) -> None:
        result = analyze_provenance(
            [
                _evidence("ondo", "ondo", field="underlying_asset_value"),
                _evidence("ondo", "ondo", field="outstanding_token_value"),
            ]
        )

        self.assertEqual(1, result.source_count)
        self.assertEqual(1, result.independent_root_count)
        self.assertEqual(0, result.dependent_source_count)
        self.assertEqual(2, result.provenance_summary["observation_count"])

    def test_treasury_backing_pass_certificate_uses_provenance_engine(self) -> None:
        evidence = _valid_treasury_evidence()

        with patch(
            "services.rvc.treasury_backing.analyze_provenance",
            return_value=SimpleNamespace(independent_root_count=41),
        ) as analyzer:
            certificate = verify_treasury_backing(
                "USDY", evidence, max_attestation_age_hours=1_000_000
            )

        self.assertEqual(VerificationResult.PASS, certificate.result)
        self.assertEqual(41, certificate.independent_root_count)
        analyzer.assert_called_once_with(evidence)

    def test_treasury_backing_indeterminate_certificate_uses_provenance_engine(
        self,
    ) -> None:
        evidence = _valid_treasury_evidence()[:-1]

        with patch(
            "services.rvc.treasury_backing.analyze_provenance",
            return_value=SimpleNamespace(independent_root_count=42),
        ) as analyzer:
            certificate = verify_treasury_backing("USDY", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(42, certificate.independent_root_count)
        analyzer.assert_called_once_with(evidence)


if __name__ == "__main__":
    unittest.main()
