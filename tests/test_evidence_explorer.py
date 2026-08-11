from __future__ import annotations

import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from apps.api.main import app
from services.evidence.usdy_attestation import DEFAULT_USDY_ATTESTATION_SNAPSHOT
from services.evidence_explorer.lookup import (
    EvidenceExplorerError,
    EvidenceExplorerService,
)
from services.mcp_server.tools import ProofLayerTools


PASS_ID = "0xba3c44801fb90231df4c22a51f0fd392f6f9638cbb3f8d99f3ef6c867e86ee7f"
HISTORICAL_ROOT = "0x9e535ebc0264a2c05b9a326337c7ab9719f26856b15ac5f89c9d5031ec5d7843"


class FakeCertificateLookup:
    def __init__(self) -> None:
        self.calls: list[tuple[str, bool]] = []

    def lookup(self, certificate_id: str, *, include_related: bool = True):
        self.calls.append((certificate_id, include_related))
        return SimpleNamespace(
            found=True,
            core=SimpleNamespace(evidence_root=HISTORICAL_ROOT, result="PASS"),
            usability=SimpleNamespace(state="EXPIRED"),
            live_certificate_found=True,
            authenticity_sources=["DEMO FIXTURE", "LIVE ON-CHAIN"],
        )


class TrackingTools:
    def __init__(self, *, unknown_source_type: bool = False) -> None:
        self.delegate = ProofLayerTools()
        self.calls: list[str] = []
        self.unknown_source_type = unknown_source_type

    def get_asset_metadata(self, asset: str):
        self.calls.append("get_asset_metadata")
        return self.delegate.get_asset_metadata(asset)

    def get_evidence(self, asset: str, claim: str):
        self.calls.append("get_evidence")
        result = deepcopy(self.delegate.get_evidence(asset, claim))
        if self.unknown_source_type:
            result["evidence"][0]["source_type"] = "custodial_export"
        return result

    def analyze_provenance(self, asset: str, claim: str):
        self.calls.append("analyze_provenance")
        return self.delegate.analyze_provenance(asset, claim)

    def verify_claim(self, asset: str, claim: str):
        self.calls.append("verify_claim")
        return self.delegate.verify_claim(asset, claim)


class EvidenceExplorerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tools = TrackingTools()
        self.certificates = FakeCertificateLookup()
        self.service = EvidenceExplorerService(self.tools, self.certificates)

    def test_index_lists_only_supported_assets(self) -> None:
        result = self.service.list_assets()
        self.assertEqual([item.asset for item in result.assets], ["USDY", "PAXG"])
        self.assertFalse(result.blockchain_write_performed)

    def test_usdy_same_root_sources_collapse_to_one_independent_root(self) -> None:
        result = self.service.get_asset("USDY", include_certificate=False)
        self.assertEqual(result.provenance.observed_source_count, 2)
        self.assertEqual(result.provenance.independent_root_count, 1)
        self.assertEqual(result.provenance.independent_root_ids, ["ondo"])

    def test_paxg_independent_roots_are_preserved(self) -> None:
        result = self.service.get_asset("paxg", include_certificate=False)
        self.assertEqual(result.provenance.observed_source_count, 3)
        self.assertEqual(result.provenance.independent_root_count, 2)
        self.assertEqual(result.provenance.independent_root_ids, ["kpmg", "paxos"])

    def test_paxg_stale_attestation_is_derived_from_rvc_predicate(self) -> None:
        result = self.service.get_asset("PAXG", include_certificate=False)
        attestation_records = [
            item for item in result.evidence_records if item.source_type == "attestation"
        ]
        self.assertTrue(attestation_records)
        self.assertTrue(all(item.freshness == "STALE" for item in attestation_records))
        self.assertTrue(all("STALE_ATTESTATION" in item.freshness_reason for item in attestation_records))
        self.assertEqual(result.freshness_summary, "STALE")

    def test_usdy_missing_evidence_semantics_are_preserved(self) -> None:
        result = self.service.get_asset("USDY", include_certificate=False)
        self.assertEqual(result.verification.result, "INDETERMINATE")
        self.assertEqual(result.verification.reason_codes, ["MISSING_EVIDENCE"])
        self.assertEqual(
            result.missing_requirements,
            [
                "attestation_timestamp exists",
                "issuer_contract_verified exists",
                "onchain_supply exists",
            ],
        )

    def test_usdy_portfolio_timestamp_is_not_relabelled_as_attestation(self) -> None:
        result = self.service.get_asset("USDY", include_certificate=False)
        timestamp = next(
            item
            for item in result.evidence_records
            if item.field == "portfolio_observation_timestamp"
        )
        self.assertEqual(timestamp.source_type, "issuer")
        self.assertEqual(timestamp.freshness, "UNKNOWN")
        self.assertTrue(any("not an independent attestation" in item for item in result.warnings))

    def test_paxg_missing_contract_evidence_remains_indeterminate(self) -> None:
        result = self.service.get_asset("PAXG", include_certificate=False)
        self.assertEqual(result.verification.result, "INDETERMINATE")
        self.assertEqual(
            result.verification.reason_codes,
            ["STALE_ATTESTATION", "MISSING_EVIDENCE"],
        )
        self.assertEqual(result.missing_requirements, ["issuer_contract_verified == True"])

    def test_raw_records_preserve_exact_evidence_fields(self) -> None:
        result = self.service.get_asset("PAXG", include_certificate=False)
        record = next(item for item in result.evidence_records if item.field == "backing_ratio")
        self.assertEqual(record.source_id, "kpmg-paxg-examination-2026-06-30")
        self.assertEqual(record.root_source_id, "kpmg")
        self.assertEqual(record.dependency_parent_ids, ["paxos-paxg-product-snapshot"])
        self.assertEqual(record.evidence_tier, "A")
        self.assertEqual(record.asset, "PAXG")
        self.assertIsNotNone(record.observed_at)
        self.assertIsNotNone(record.retrieved_at)
        self.assertTrue(record.content_hash.startswith("sha256:"))
        self.assertFalse(record.simulation)

    def test_cached_snapshot_is_never_labelled_live(self) -> None:
        result = self.service.get_asset("USDY", include_certificate=False)
        labels = {label for record in result.evidence_records for label in record.authenticity_labels}
        self.assertIn("CACHED OFFICIAL EVIDENCE", labels)
        self.assertNotIn("LIVE READ", labels)

    def test_live_onchain_records_are_labelled_live_read_not_cached(self) -> None:
        from tests.test_agent_tools import FakeEthereumRpc

        tools = TrackingTools()
        tools.delegate = ProofLayerTools(ethereum_rpc_call=FakeEthereumRpc())
        service = EvidenceExplorerService(tools, FakeCertificateLookup())
        result = service.get_asset("USDY", include_certificate=False)

        onchain = [
            item for item in result.evidence_records if item.source_type == "onchain"
        ]
        self.assertTrue(onchain)
        for item in onchain:
            self.assertIn("LIVE READ", item.authenticity_labels)
            self.assertIn("ON-CHAIN", item.authenticity_labels)
            self.assertNotIn("CACHED OFFICIAL EVIDENCE", item.authenticity_labels)
        issuer = [
            item for item in result.evidence_records if item.source_type == "issuer"
        ]
        self.assertTrue(issuer)
        for item in issuer:
            self.assertIn("CACHED OFFICIAL EVIDENCE", item.authenticity_labels)
            self.assertNotIn("LIVE READ", item.authenticity_labels)

        self.assertEqual(result.verification.result, "INDETERMINATE")
        self.assertEqual(result.verification.reason_codes, ["MISSING_EVIDENCE"])
        self.assertEqual(
            result.missing_requirements, ["attestation_timestamp exists"]
        )
        self.assertEqual(result.provenance.independent_root_count, 2)
        self.assertEqual(
            set(result.provenance.independent_root_ids), {"ondo", "ethereum"}
        )
        self.assertIn("LIVE ON-CHAIN READ", result.source_mode_note)

    def test_attestation_evidence_is_labelled_cached_and_stale(self) -> None:
        from tests.test_agent_tools import FakeEthereumRpc

        tools = TrackingTools()
        tools.delegate = ProofLayerTools(
            ethereum_rpc_call=FakeEthereumRpc(),
            usdy_attestation_path=DEFAULT_USDY_ATTESTATION_SNAPSHOT,
        )
        service = EvidenceExplorerService(tools, FakeCertificateLookup())
        result = service.get_asset("USDY", include_certificate=False)

        attestation_records = [
            item for item in result.evidence_records if item.source_type == "attestation"
        ]
        self.assertEqual(4, len(attestation_records))
        self.assertTrue(all(item.freshness == "STALE" for item in attestation_records))
        for item in attestation_records:
            self.assertIn("ATTESTATION", item.authenticity_labels)
            self.assertIn("CACHED OFFICIAL EVIDENCE", item.authenticity_labels)
            self.assertNotIn("LIVE READ", item.authenticity_labels)
            self.assertFalse(item.simulation)

        self.assertEqual(result.verification.result, "FAIL")
        self.assertEqual(result.verification.reason_codes, ["STALE_ATTESTATION"])
        self.assertEqual(result.missing_requirements, [])
        self.assertEqual(result.freshness_summary, "STALE")
        self.assertEqual(result.provenance.independent_root_count, 3)
        self.assertEqual(
            result.provenance.independent_root_ids, ["ankura", "ethereum", "ondo"]
        )
        self.assertTrue(
            any("comes separately from the attestation records" in item for item in result.warnings)
        )

    def test_evidence_commitment_is_compared_by_exact_equality(self) -> None:
        result = self.service.get_asset("USDY")
        self.assertEqual(result.certificate_linkage.certificate_id, PASS_ID)
        self.assertFalse(result.certificate_linkage.evidence_commitment_matches)
        self.assertEqual(result.certificate_linkage.match_status, "DOES NOT MATCH")
        self.assertNotEqual(result.evidence_commitment.value, HISTORICAL_ROOT)

    def test_paxg_does_not_fabricate_certificate_linkage(self) -> None:
        result = self.service.get_asset("PAXG")
        self.assertEqual(result.certificate_linkage.status, "NO CERTIFICATE")
        self.assertIsNone(result.certificate_linkage.certificate_id)
        self.assertEqual(self.certificates.calls, [])

    def test_graph_contains_actual_cross_source_dependency(self) -> None:
        result = self.service.get_asset("PAXG", include_certificate=False)
        dependency_edges = [
            edge for edge in result.provenance.graph.edges if edge.relationship == "DEPENDENCY"
        ]
        self.assertEqual(len(dependency_edges), 1)
        self.assertEqual(
            dependency_edges[0].source,
            "source:paxos-paxg-product-snapshot",
        )
        self.assertEqual(
            dependency_edges[0].target,
            "source:kpmg-paxg-examination-2026-06-30",
        )

    def test_dependency_groups_are_preserved(self) -> None:
        result = self.service.get_asset("PAXG", include_certificate=False)
        groups = {item.root_source_id: item.source_ids for item in result.provenance.dependency_groups}
        self.assertEqual(groups["kpmg"], ["kpmg-paxg-examination-2026-06-30"])
        self.assertEqual(
            groups["paxos"],
            ["paxos-paxg-contract-address-snapshot", "paxos-paxg-product-snapshot"],
        )

    def test_rvc_evidence_root_is_preserved_exactly(self) -> None:
        result = self.service.get_asset("USDY", include_certificate=False)
        self.assertEqual(
            result.evidence_commitment.value,
            "0xf2d10bc16dfeb5c9d45ecd40f388b56710b000d92eeeb3b8ab2cab40781d5669",
        )

    def test_unknown_source_type_is_handled_without_false_authenticity(self) -> None:
        service = EvidenceExplorerService(
            TrackingTools(unknown_source_type=True),
            FakeCertificateLookup(),
        )
        result = service.get_asset("USDY", include_certificate=False)
        record = result.evidence_records[0]
        self.assertEqual(record.source_type, "custodial_export")
        self.assertEqual(record.authenticity_labels, ["CACHED OFFICIAL EVIDENCE"])

    def test_existing_tier_labels_are_exposed_without_invented_definitions(self) -> None:
        result = self.service.get_asset("PAXG", include_certificate=False)
        self.assertEqual({item.evidence_tier for item in result.evidence_records}, {"A", "B"})
        self.assertFalse(result.evidence_tier_definitions_available)

    def test_no_write_methods_are_invoked(self) -> None:
        self.service.get_asset("USDY")
        self.assertEqual(
            set(self.tools.calls),
            {"get_asset_metadata", "get_evidence", "analyze_provenance", "verify_claim"},
        )
        self.assertTrue(all("write" not in call and "execute" not in call for call in self.tools.calls))
        self.assertEqual(self.certificates.calls, [(PASS_ID, False)])

    def test_unsupported_asset_is_rejected_before_tool_calls(self) -> None:
        with self.assertRaises(EvidenceExplorerError):
            self.service.get_asset("grain")
        self.assertEqual(self.tools.calls, [])

    def test_evidence_api_routes_return_read_only_models(self) -> None:
        with patch("apps.api.main.evidence_explorer", self.service):
            index = TestClient(app).get("/evidence")
            detail = TestClient(app).get("/evidence/usdy")
        self.assertEqual(index.status_code, 200)
        self.assertEqual(detail.status_code, 200)
        self.assertFalse(index.json()["blockchain_write_performed"])
        self.assertFalse(detail.json()["blockchain_write_performed"])

    def test_evidence_api_rejects_unsupported_asset(self) -> None:
        with patch("apps.api.main.evidence_explorer", self.service):
            response = TestClient(app).get("/evidence/grain")
        self.assertEqual(response.status_code, 400)
        self.assertIn("supported assets", response.json()["error"])


if __name__ == "__main__":
    unittest.main()
