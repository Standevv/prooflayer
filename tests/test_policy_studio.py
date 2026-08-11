from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from apps.api.main import app
from services.continuous_verification.models import EvidenceFreshnessRecord, TrustSnapshot
from services.policy_studio.evaluator import (
    InstitutionalPolicyEvaluator,
    POLICY_PRESETS,
    PolicyEvaluationError,
    PolicyStudioService,
)
from services.policy_studio.models import InstitutionalPolicyDraft, PolicyEvaluationRequest
from services.policy_studio.store import PolicyStore, PolicyStoreError
from services.policy_studio.validator import policy_commitment


NOW = datetime(2026, 8, 10, 20, 0, tzinfo=timezone.utc)
ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"


def draft(**changes: object) -> InstitutionalPolicyDraft:
    values: dict[str, object] = {
        "policy_id": "institutional-treasury-standard",
        "name": "Institutional Treasury Standard",
        "description": "Typed requirements for treasury eligibility.",
        "supported_asset": "USDY",
        "supported_claim": "TreasuryBacking",
        "minimum_independent_roots": 1,
        "require_certificate": False,
        "require_certificate_usable": False,
        "require_not_revoked": False,
        "require_policygate_allow": False,
        "maximum_attestation_age_days": None,
        "blocking_reason_codes": [],
    }
    values.update(changes)
    return InstitutionalPolicyDraft(**values)


def snapshot(
    *,
    result: str = "PASS",
    roots: int | None = 2,
    reasons: list[str] | None = None,
    certificate_exists: bool | None = True,
    certificate_usable: bool | None = True,
    lifecycle: str = "ACTIVE",
    gate: str = "ALLOW",
    attestation_days_old: int | None = 5,
) -> TrustSnapshot:
    freshness_records = []
    if attestation_days_old is not None:
        freshness_records = [
            EvidenceFreshnessRecord(
                source_id="attestation-1",
                source_type="attestation",
                observed_at=(NOW - timedelta(days=attestation_days_old)).isoformat(),
                policy_max_age="<= 31 days",
                freshness="CURRENT" if attestation_days_old <= 31 else "STALE",
                explanation="Fixture freshness state.",
                authenticity_labels=["ATTESTATION"],
            )
        ]
    return TrustSnapshot(
        snapshot_id="0x" + "a" * 64,
        asset="USDY",
        claim="TreasuryBacking",
        checked_at=NOW,
        verification_result=result,
        reason_codes=reasons or [],
        evidence_root="0x" + "b" * 64,
        independent_root_count=roots,
        evidence_freshness="CURRENT" if attestation_days_old is not None and attestation_days_old <= 31 else "STALE",
        evidence_freshness_records=freshness_records,
        certificate_id="0x" + "c" * 64 if certificate_exists is not None else None,
        certificate_exists=certificate_exists,
        certificate_usable=certificate_usable,
        certificate_status="REGISTERED_USABLE" if certificate_usable else "REGISTERED_UNUSABLE",
        certificate_lifecycle_state=lifecycle,
        certificate_historical_result="PASS" if certificate_exists else None,
        certificate_valid_until=int((NOW + timedelta(days=1)).timestamp()) if certificate_exists else None,
        policygate_outcome=gate,
        source_status="COMPLETE",
        authenticity_sources=["DETERMINISTIC RVC", "CACHED OFFICIAL EVIDENCE", "LIVE ON-CHAIN"],
    )


class FakeStateReader:
    def __init__(self, state: TrustSnapshot) -> None:
        self.state = state
        self.calls: list[tuple[str, str]] = []

    def inspect_current_state(self, asset: str, claim: str) -> TrustSnapshot:
        self.calls.append((asset, claim))
        return self.state.model_copy(update={"asset": asset, "claim": claim})


class PolicyStudioTests(unittest.TestCase):
    def create_policy(self, temporary: str, policy_draft: InstitutionalPolicyDraft | None = None):
        store = PolicyStore(temporary, clock=lambda: NOW)
        return store, store.save_policy(policy_draft or draft())

    def evaluate(self, temporary: str, state: TrustSnapshot, policy_draft: InstitutionalPolicyDraft | None = None):
        store, policy = self.create_policy(temporary, policy_draft)
        reader = FakeStateReader(state)
        evaluator = InstitutionalPolicyEvaluator(reader, clock=lambda: NOW)
        evaluation = evaluator.evaluate(policy, PolicyEvaluationRequest(asset="USDY", claim="TreasuryBacking"))
        return store, policy, reader, evaluation

    def test_create_valid_policy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store, policy = self.create_policy(temporary)
            self.assertEqual(policy.policy_version, 1)
            self.assertEqual(store.get_policy(policy.policy_id), policy)

    def test_empty_name_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            draft(name="   ")

    def test_unsupported_claim_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            InstitutionalPolicyDraft(name="Unsupported", supported_claim="CarbonBacking")

    def test_negative_roots_are_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            draft(minimum_independent_roots=-1)

    def test_invalid_attestation_age_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            draft(maximum_attestation_age_days=0)

    def test_certificate_usability_dependency_validation(self) -> None:
        with self.assertRaisesRegex(ValidationError, "usability"):
            draft(require_certificate=False, require_certificate_usable=True)

    def test_not_revoked_dependency_validation(self) -> None:
        with self.assertRaisesRegex(ValidationError, "Not-revoked"):
            draft(require_certificate=False, require_not_revoked=True)

    def test_policygate_dependency_validation(self) -> None:
        with self.assertRaisesRegex(ValidationError, "PolicyGate ALLOW"):
            draft(require_certificate=True, require_certificate_usable=False, require_policygate_allow=True)

    def test_indeterminate_never_becomes_accept(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            _, _, _, evaluation = self.evaluate(temporary, snapshot(result="INDETERMINATE", reasons=["MISSING_EVIDENCE"]))
        self.assertEqual(evaluation.verification_result, "INDETERMINATE")
        self.assertEqual(evaluation.final_decision, "REVIEW_REQUIRED")

    def test_fail_never_becomes_accept(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            _, _, _, evaluation = self.evaluate(temporary, snapshot(result="FAIL"))
        self.assertEqual(evaluation.verification_result, "FAIL")
        self.assertEqual(evaluation.final_decision, "REJECT")

    def test_unsafe_required_result_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            draft(required_verification_results=["INDETERMINATE"])

    def test_pass_with_satisfied_requirements_accepts(self) -> None:
        requirements = draft(require_certificate=True, require_certificate_usable=True, require_not_revoked=True, require_policygate_allow=True, maximum_attestation_age_days=31)
        with tempfile.TemporaryDirectory() as temporary:
            _, _, _, evaluation = self.evaluate(temporary, snapshot(), requirements)
        self.assertEqual(evaluation.final_decision, "ACCEPT")
        self.assertTrue(all(rule.status in {"SATISFIED", "NOT_APPLICABLE"} for rule in evaluation.rule_results))

    def test_pass_with_expired_required_certificate_rejects(self) -> None:
        requirements = draft(require_certificate=True, require_certificate_usable=True, require_not_revoked=True)
        state = snapshot(certificate_usable=False, lifecycle="EXPIRED", gate="BLOCK")
        with tempfile.TemporaryDirectory() as temporary:
            _, _, _, evaluation = self.evaluate(temporary, state, requirements)
        self.assertEqual(evaluation.final_decision, "REJECT")

    def test_pass_with_unavailable_required_policygate_requires_review(self) -> None:
        requirements = draft(require_certificate=True, require_certificate_usable=True, require_policygate_allow=True)
        with tempfile.TemporaryDirectory() as temporary:
            _, _, _, evaluation = self.evaluate(temporary, snapshot(gate="UNAVAILABLE"), requirements)
        self.assertEqual(evaluation.final_decision, "REVIEW_REQUIRED")

    def test_independent_root_requirement_is_evaluated(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            _, _, _, evaluation = self.evaluate(temporary, snapshot(roots=1), draft(minimum_independent_roots=2))
        rule = next(rule for rule in evaluation.rule_results if rule.rule == "Minimum independent roots")
        self.assertEqual(rule.status, "NOT_SATISFIED")
        self.assertEqual(evaluation.final_decision, "REJECT")

    def test_blocking_reason_codes_are_evaluated(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            _, _, _, evaluation = self.evaluate(temporary, snapshot(reasons=["STALE_ATTESTATION"]), draft(blocking_reason_codes=["STALE_ATTESTATION"]))
        rule = next(rule for rule in evaluation.rule_results if rule.rule == "Blocking RVC reason codes")
        self.assertEqual(rule.status, "NOT_SATISFIED")
        self.assertEqual(evaluation.final_decision, "REJECT")

    def test_attestation_age_rule_is_evaluated(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            _, _, _, evaluation = self.evaluate(temporary, snapshot(attestation_days_old=40), draft(maximum_attestation_age_days=31))
        rule = next(rule for rule in evaluation.rule_results if rule.rule == "Maximum attestation age")
        self.assertEqual(rule.status, "NOT_SATISFIED")

    def test_policy_commitment_is_deterministic(self) -> None:
        item = draft()
        self.assertEqual(policy_commitment(item.policy_id or "", item), policy_commitment(item.policy_id or "", item))

    def test_material_edit_increments_version_and_changes_commitment(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store, first = self.create_policy(temporary, draft(minimum_independent_roots=2))
            second = store.save_policy(draft(minimum_independent_roots=3))
        self.assertEqual(second.policy_version, 2)
        self.assertNotEqual(first.policy_commitment, second.policy_commitment)

    def test_nonmaterial_description_edit_keeps_version_and_commitment(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store, first = self.create_policy(temporary)
            second = store.save_policy(draft(description="Updated explanatory copy only."))
        self.assertEqual(second.policy_version, 1)
        self.assertEqual(first.policy_commitment, second.policy_commitment)

    def test_historical_evaluation_retains_previous_version(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store, first = self.create_policy(temporary, draft(minimum_independent_roots=1))
            evaluator = InstitutionalPolicyEvaluator(FakeStateReader(snapshot()), clock=lambda: NOW)
            evaluation = evaluator.evaluate(first, PolicyEvaluationRequest(asset="USDY", claim="TreasuryBacking"))
            store.append_evaluation(evaluation)
            store.save_policy(draft(minimum_independent_roots=3))
            history = store.evaluations(first.policy_id)
        self.assertEqual(history[0].policy_version, 1)
        self.assertEqual(history[0].policy_commitment, first.policy_commitment)

    def test_malformed_stored_policy_is_handled_safely(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "policies.jsonl"
            path.write_text("{broken-json}\n", encoding="utf-8")
            with self.assertRaises(PolicyStoreError):
                PolicyStore(temporary).latest_policies()

    def test_no_blockchain_writes_or_openai_calls(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            _, _, reader, evaluation = self.evaluate(temporary, snapshot())
        self.assertEqual(reader.calls, [("USDY", "TreasuryBacking")])
        self.assertFalse(evaluation.blockchain_write_performed)
        self.assertFalse(evaluation.openai_call_performed)

    def test_incompatible_asset_claim_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            _, policy = self.create_policy(temporary)
            evaluator = InstitutionalPolicyEvaluator(FakeStateReader(snapshot()), clock=lambda: NOW)
            with self.assertRaises(PolicyEvaluationError):
                evaluator.evaluate(policy, PolicyEvaluationRequest(asset="PAXG", claim="GoldBacking"))

    def test_unsupported_reason_code_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValidationError, "Unsupported blocking reason"):
            draft(blocking_reason_codes=["ARBITRARY_CODE"])

    def test_demo_presets_are_explicitly_labelled(self) -> None:
        self.assertEqual(len(POLICY_PRESETS), 3)
        self.assertTrue(all(policy.source == "DEMO POLICY PRESET" for policy in POLICY_PRESETS.values()))

    def test_api_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store = PolicyStore(temporary, clock=lambda: NOW)
            service = PolicyStudioService(store=store, evaluator=InstitutionalPolicyEvaluator(FakeStateReader(snapshot()), clock=lambda: NOW))
            with patch("apps.api.main.policy_studio", service):
                client = TestClient(app)
                created = client.post("/policies", json=draft().model_dump(mode="json"))
                detail_response = client.get("/policies/institutional-treasury-standard")
                evaluated = client.post("/policies/institutional-treasury-standard/evaluate", json={"asset": "USDY", "claim": "TreasuryBacking"})
        self.assertEqual(created.status_code, 200)
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(evaluated.status_code, 200)
        self.assertEqual(evaluated.json()["final_decision"], "ACCEPT")

    def test_api_rejects_incompatible_asset(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            service = PolicyStudioService(store=PolicyStore(temporary, clock=lambda: NOW), evaluator=InstitutionalPolicyEvaluator(FakeStateReader(snapshot()), clock=lambda: NOW))
            service.create_policy(draft())
            with patch("apps.api.main.policy_studio", service):
                response = TestClient(app).post("/policies/institutional-treasury-standard/evaluate", json={"asset": "PAXG", "claim": "GoldBacking"})
        self.assertEqual(response.status_code, 400)

    def test_policy_api_paths_are_documented_by_openapi(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn("/policies", paths)
        self.assertIn("/policies/{policy_id}", paths)
        self.assertIn("/policies/{policy_id}/evaluate", paths)

    def test_frontend_routes_and_server_gateways_exist(self) -> None:
        for relative in (
            "app/policies/page.tsx",
            "app/policies/new/page.tsx",
            "app/policies/[policyId]/page.tsx",
            "app/api/policies/route.ts",
            "app/api/policies/[policyId]/route.ts",
            "app/api/policies/[policyId]/evaluate/route.ts",
        ):
            self.assertTrue((WEB / relative).is_file(), relative)

    def test_developer_platform_documents_real_policy_evaluation_endpoint(self) -> None:
        source = (WEB / "lib" / "developers.ts").read_text(encoding="utf-8")
        self.assertIn("/policies/{policy_id}/evaluate", source)
        self.assertIn("/policies/demo-conservative-lending/evaluate", source)
        self.assertNotIn("ProofLayerPolicySDK", source)

    def test_policy_frontend_contains_no_private_key_or_write_method(self) -> None:
        sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in [
                WEB / "lib" / "policies.ts",
                WEB / "components" / "policy-builder.tsx",
                WEB / "components" / "policy-detail.tsx",
            ]
        ).lower()
        self.assertNotIn("private_key", sources)
        self.assertNotIn("executeverifiedaction", sources)


if __name__ == "__main__":
    unittest.main()
