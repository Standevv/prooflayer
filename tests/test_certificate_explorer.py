from __future__ import annotations

import unittest

from services.certificate_explorer.lookup import (
    CertificateLookupError,
    CertificateLookupService,
)
from services.rvc.certificate_serializer import identifier_to_bytes32


PASS_ID = "0xba3c44801fb90231df4c22a51f0fd392f6f9638cbb3f8d99f3ef6c867e86ee7f"
INDETERMINATE_ID = "0x042b888f361b295945c0daaf15a5fb3f7ce21419c01aeab4d02c37a60e20c228"
UNKNOWN_ID = "0x" + "1" * 64
ISSUER = "0x1111111111111111111111111111111111111111"


def registered_state(
    certificate_id: str = PASS_ID,
    *,
    result: str = "PASS",
    result_code: int = 1,
    usable: bool = False,
    revoked: bool = False,
    valid_until: int = 1_786_215_710,
    asset_id: str | None = None,
    claim_type: str | None = None,
    policy_id: str | None = None,
) -> dict[str, object]:
    return {
        "certificate_id": certificate_id,
        "certificate_status": "REGISTERED_USABLE" if usable else "REGISTERED_UNUSABLE",
        "exists": True,
        "registered": True,
        "usable": usable,
        "chain_id": 1952,
        "asset_id": asset_id or identifier_to_bytes32("USDY"),
        "claim_type": claim_type or identifier_to_bytes32("TreasuryBacking"),
        "policy_id": policy_id or identifier_to_bytes32("default-treasury-policy"),
        "evidence_root": (
            "0x9e535ebc0264a2c05b9a326337c7ab9719f26856b15ac5f89c9d5031ec5d7843"
            if certificate_id == PASS_ID
            else "0x905fdf826f723cb89e66263048f240d154ba0f51ebab42cd61e878d8f5b494ed"
        ),
        "observed_at": 1_786_212_110,
        "valid_until": valid_until,
        "independent_root_count": 2,
        "result_code": result_code,
        "result": result,
        "issuer": ISSUER,
        "revoked": revoked,
    }


class FakeCertificateTools:
    def __init__(
        self,
        state: dict[str, object] | None = None,
        *,
        rpc_error: bool = False,
        decisions: list[dict[str, object]] | None = None,
    ) -> None:
        self.state = state or {
            "certificate_id": UNKNOWN_ID,
            "certificate_status": "NOT_REGISTERED",
            "exists": False,
            "registered": False,
            "result": None,
            "valid_until": None,
            "revoked": None,
            "issuer": None,
            "usable": False,
            "chain_id": 1952,
        }
        self.rpc_error = rpc_error
        self.decisions = decisions or []
        self.calls: list[str] = []

    def get_certificate_state(self, certificate_id: str):
        self.calls.append("get_certificate_state")
        if self.rpc_error:
            raise RuntimeError("RPC offline")
        return {**self.state, "certificate_id": certificate_id}

    def get_xlayer_status(self):
        self.calls.append("get_xlayer_status")
        if self.rpc_error:
            raise RuntimeError("RPC offline")
        return {"chain_id": 1952, "latest_block": 38_000_123}

    def get_decision_history(self, certificate_id: str):
        self.calls.append("get_decision_history")
        if self.rpc_error:
            raise RuntimeError("RPC offline")
        return {
            "certificate_id": certificate_id,
            "decision_count": 8,
            "matching_decisions": self.decisions,
            "query_from_block": 37_752_610,
            "query_to_block": 38_000_123,
            "history_complete_since_deployment": True,
        }

    def get_policygate_state(
        self,
        certificate_id: str,
        asset: str,
        claim: str,
        policy: str,
    ):
        self.calls.append("get_policygate_state")
        if self.rpc_error:
            raise RuntimeError("RPC offline")
        usable = bool(self.state.get("usable"))
        return {
            "certificate_id": certificate_id,
            "asset": asset,
            "claim": claim,
            "policy": policy,
            "policygate_outcome": "ALLOWED" if usable else "BLOCKED",
            "certificate_usable": usable,
            "reason": "Read-only assessment.",
            "action_executed": False,
        }


class CertificateExplorerTests(unittest.TestCase):
    def test_valid_certificate_id_lookup(self) -> None:
        service = CertificateLookupService(FakeCertificateTools(registered_state()))
        result = service.lookup(PASS_ID)
        self.assertEqual(result.certificate_id, PASS_ID)
        self.assertTrue(result.found)
        self.assertFalse(result.blockchain_write_performed)

    def test_malformed_certificate_id_is_rejected_before_rpc(self) -> None:
        tools = FakeCertificateTools()
        service = CertificateLookupService(tools)
        with self.assertRaisesRegex(CertificateLookupError, "0x-prefixed 32-byte"):
            service.lookup("0x1234")
        self.assertEqual(tools.calls, [])

    def test_registered_certificate_is_normalized_from_live_state(self) -> None:
        service = CertificateLookupService(FakeCertificateTools(registered_state()))
        result = service.lookup(PASS_ID)
        self.assertTrue(result.live_certificate_found)
        self.assertEqual(result.core.issuer, ISSUER)
        self.assertEqual(result.labels.asset, "USDY")
        self.assertEqual(result.field_sources["result"], "LIVE ON-CHAIN")
        self.assertTrue(result.fixture_matches_live)

    def test_expired_pass_remains_pass_but_unusable(self) -> None:
        tools = FakeCertificateTools(registered_state(usable=False))
        result = CertificateLookupService(tools, now=lambda: 1_786_216_000).lookup(PASS_ID)
        self.assertEqual(result.core.result, "PASS")
        self.assertEqual(result.usability.state, "EXPIRED")
        self.assertFalse(result.usability.usable)

    def test_indeterminate_certificate_is_non_pass_and_unusable(self) -> None:
        state = registered_state(
            INDETERMINATE_ID,
            result="INDETERMINATE",
            result_code=0,
            usable=False,
        )
        result = CertificateLookupService(FakeCertificateTools(state), now=lambda: 1_786_212_500).lookup(
            INDETERMINATE_ID
        )
        self.assertEqual(result.core.result, "INDETERMINATE")
        self.assertEqual(result.usability.state, "NON-PASS")
        self.assertFalse(result.usability.usable)

    def test_revoked_certificate_is_unusable(self) -> None:
        state = registered_state(usable=False, revoked=True, valid_until=1_900_000_000)
        result = CertificateLookupService(FakeCertificateTools(state), now=lambda: 1_800_000_000).lookup(PASS_ID)
        self.assertEqual(result.usability.state, "REVOKED")
        self.assertFalse(result.usability.usable)

    def test_no_certificate_returns_not_found_state(self) -> None:
        result = CertificateLookupService(FakeCertificateTools()).lookup(UNKNOWN_ID)
        self.assertFalse(result.found)
        self.assertFalse(result.live_certificate_found)
        self.assertFalse(result.local_fixture_found)
        self.assertEqual(result.usability.state, "NOT REGISTERED")

    def test_rpc_unavailable_preserves_matching_local_metadata(self) -> None:
        result = CertificateLookupService(FakeCertificateTools(rpc_error=True)).lookup(PASS_ID)
        self.assertTrue(result.local_fixture_found)
        self.assertIsNone(result.live_certificate_found)
        self.assertEqual(result.core.result, "PASS")
        self.assertEqual(result.field_sources["result"], "DEMO FIXTURE")
        self.assertEqual(result.usability.state, "LIVE READ UNAVAILABLE")

    def test_unknown_bytes32_values_are_not_reverse_mapped(self) -> None:
        state = registered_state(
            UNKNOWN_ID,
            asset_id="0x" + "a" * 64,
            claim_type="0x" + "b" * 64,
            policy_id="0x" + "c" * 64,
            valid_until=1_900_000_000,
        )
        result = CertificateLookupService(FakeCertificateTools(state), now=lambda: 1_800_000_000).lookup(UNKNOWN_ID)
        self.assertIsNone(result.labels.asset)
        self.assertIsNone(result.labels.claim)
        self.assertIsNone(result.labels.policy)
        self.assertEqual(result.enforcement.outcome, "NOT CHECKED")

    def test_related_decision_history_is_normalized(self) -> None:
        decision = {
            "decision_id": "0x" + "d" * 64,
            "certificate_id": PASS_ID,
            "actor": "0x2222222222222222222222222222222222222222",
            "action_type": "0x" + "e" * 64,
            "allowed": True,
            "timestamp": 1_786_212_250,
            "block_number": 37_800_000,
            "transaction_hash": "0x" + "f" * 64,
        }
        result = CertificateLookupService(
            FakeCertificateTools(registered_state(), decisions=[decision])
        ).lookup(PASS_ID)
        self.assertEqual(result.decisions.read_status, "AVAILABLE")
        self.assertEqual(result.decisions.matching_count, 1)
        self.assertEqual(result.decisions.records[0].transaction_hash, decision["transaction_hash"])
        self.assertEqual(result.decisions.records[0].source, "LIVE ON-CHAIN")

    def test_rejected_decisions_are_not_fabricated(self) -> None:
        result = CertificateLookupService(FakeCertificateTools(registered_state())).lookup(PASS_ID)
        self.assertEqual(result.decisions.records, [])
        self.assertEqual(result.decisions.matching_count, 0)
        self.assertIn("revert", result.decisions.note)

    def test_no_write_methods_are_invoked(self) -> None:
        tools = FakeCertificateTools(registered_state())
        CertificateLookupService(tools).lookup(PASS_ID)
        self.assertEqual(
            set(tools.calls),
            {
                "get_certificate_state",
                "get_xlayer_status",
                "get_decision_history",
                "get_policygate_state",
            },
        )
        self.assertTrue(all("write" not in call and "execute" not in call for call in tools.calls))

    def test_usable_pass_is_reported_usable(self) -> None:
        state = registered_state(usable=True, valid_until=1_900_000_000)
        result = CertificateLookupService(FakeCertificateTools(state), now=lambda: 1_800_000_000).lookup(PASS_ID)
        self.assertEqual(result.usability.state, "USABLE")
        self.assertEqual(result.enforcement.outcome, "ALLOW")

    def test_unregistered_fixture_is_kept_separate_from_live_not_found(self) -> None:
        tools = FakeCertificateTools(
            {
                "certificate_id": PASS_ID,
                "certificate_status": "NOT_REGISTERED",
                "exists": False,
                "registered": False,
                "result": None,
                "usable": False,
                "chain_id": 1952,
            }
        )
        result = CertificateLookupService(tools).lookup(PASS_ID)
        self.assertTrue(result.local_fixture_found)
        self.assertFalse(result.live_certificate_found)
        self.assertEqual(result.core.result, "PASS")
        self.assertEqual(result.registry.certificate_exists, False)
        self.assertEqual(result.usability.state, "NOT REGISTERED")


if __name__ == "__main__":
    unittest.main()
