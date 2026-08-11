"""Conservative institutional policy evaluation over existing ProofLayer trust state."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from services.continuous_verification.engine import ContinuousVerificationEngine
from services.continuous_verification.models import TrustSnapshot

from .models import (
    InstitutionalPolicy,
    InstitutionalPolicyDraft,
    PolicyDecisionTransition,
    PolicyDetail,
    PolicyEvaluation,
    PolicyEvaluationRequest,
    PolicyRuleResult,
    PolicyStudioOverview,
    PolicySummary,
    SUPPORTED_REASON_CODES,
)
from .store import PolicyStore
from .validator import PolicyValidationError, policy_commitment


class PolicyEvaluationError(ValueError):
    """Raised when policy evaluation is unsupported or internally inconsistent."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "0x" + hashlib.sha256(encoded).hexdigest()


def _preset(
    *,
    policy_id: str,
    name: str,
    description: str,
    asset: str,
    claim: str,
    roots: int,
    age_days: int | None,
    gate: bool,
) -> InstitutionalPolicy:
    draft = InstitutionalPolicyDraft(
        policy_id=policy_id,
        name=name,
        description=description,
        supported_asset=asset,
        supported_claim=claim,
        minimum_independent_roots=roots,
        require_certificate=True,
        require_certificate_usable=True,
        require_not_revoked=True,
        require_policygate_allow=gate,
        maximum_attestation_age_days=age_days,
        blocking_reason_codes=["MISSING_EVIDENCE", "STALE_ATTESTATION"],
    )
    timestamp = datetime(2026, 8, 10, tzinfo=timezone.utc)
    return InstitutionalPolicy(
        **draft.model_dump(exclude={"policy_id"}),
        policy_id=policy_id,
        policy_version=1,
        policy_commitment=policy_commitment(policy_id, draft),
        source="DEMO POLICY PRESET",
        created_at=timestamp,
        updated_at=timestamp,
    )


POLICY_PRESETS: dict[str, InstitutionalPolicy] = {
    "demo-conservative-lending": _preset(
        policy_id="demo-conservative-lending",
        name="Conservative Lending",
        description="Asset eligibility for collateral consideration.",
        asset="USDY",
        claim="TreasuryBacking",
        roots=2,
        age_days=None,
        gate=True,
    ),
    "demo-rwa-vault": _preset(
        policy_id="demo-rwa-vault",
        name="RWA Vault",
        description="Conservative admission requirements for a tokenized commodity vault.",
        asset="PAXG",
        claim="GoldBacking",
        roots=2,
        age_days=31,
        gate=True,
    ),
    "demo-treasury-allocation": _preset(
        policy_id="demo-treasury-allocation",
        name="Treasury Allocation",
        description="Asset eligibility for treasury allocation consideration.",
        asset="USDY",
        claim="TreasuryBacking",
        roots=1,
        age_days=30,
        gate=False,
    ),
}


class InstitutionalPolicyEvaluator:
    """Evaluate typed requirements without changing authoritative RVC semantics."""

    def __init__(
        self,
        state_reader: ContinuousVerificationEngine | Any | None = None,
        *,
        clock: Callable[[], datetime] = _now,
    ) -> None:
        self.state_reader = state_reader or ContinuousVerificationEngine()
        self.clock = clock

    def evaluate(
        self,
        policy: InstitutionalPolicy,
        request: PolicyEvaluationRequest,
    ) -> PolicyEvaluation:
        if not policy.enabled:
            raise PolicyEvaluationError("Disabled policies cannot be evaluated.")
        if request.claim != policy.supported_claim:
            raise PolicyEvaluationError(
                f"Policy {policy.policy_id} supports {policy.supported_claim}, not {request.claim}."
            )
        if policy.supported_asset is not None and request.asset != policy.supported_asset:
            raise PolicyEvaluationError(
                f"Policy {policy.policy_id} is restricted to {policy.supported_asset}."
            )

        snapshot: TrustSnapshot = self.state_reader.inspect_current_state(
            request.asset, request.claim
        )
        evaluated_at = self.clock().astimezone(timezone.utc)
        rules = self._rules(policy, snapshot, evaluated_at)
        decision = self._decision(snapshot.verification_result, rules)
        blocking = [
            rule.explanation
            for rule in rules
            if rule.status == "NOT_SATISFIED" and rule.rule != "Authoritative verification result"
        ]
        review = [rule.explanation for rule in rules if rule.status == "UNAVAILABLE"]
        if snapshot.verification_result in {"INDETERMINATE", "UNAVAILABLE"}:
            review.insert(
                0,
                f"The authoritative RVC result is {snapshot.verification_result}; the policy cannot relabel it PASS.",
            )
        if snapshot.verification_result == "FAIL":
            blocking.insert(0, "The authoritative RVC result is FAIL.")

        authenticity = ["CUSTOM POLICY", "DERIVED"]
        allowed = {
            "DETERMINISTIC RVC",
            "LIVE ON-CHAIN",
            "CACHED OFFICIAL EVIDENCE",
            "UNAVAILABLE",
        }
        authenticity.extend(
            source for source in snapshot.authenticity_sources if source in allowed
        )
        authenticity = list(dict.fromkeys(authenticity))
        explanation = self._explanation(
            decision,
            snapshot.verification_result,
            rules,
        )
        evaluation_id = _hash(
            {
                "asset": request.asset,
                "claim": request.claim,
                "evaluated_at": evaluated_at.isoformat(),
                "policy_commitment": policy.policy_commitment,
                "policy_id": policy.policy_id,
                "policy_version": policy.policy_version,
                "trust_snapshot_id": snapshot.snapshot_id,
            }
        )
        return PolicyEvaluation(
            evaluation_id=evaluation_id,
            policy_id=policy.policy_id,
            policy_version=policy.policy_version,
            policy_commitment=policy.policy_commitment,
            asset=request.asset,
            claim=request.claim,
            evaluated_at=evaluated_at,
            trust_snapshot_id=snapshot.snapshot_id,
            verification_result=snapshot.verification_result,
            final_decision=decision,
            rule_results=rules,
            blocking_reasons=blocking,
            review_reasons=review,
            explanation=explanation,
            source_authenticity=authenticity,
        )

    @staticmethod
    def _rules(
        policy: InstitutionalPolicy,
        snapshot: TrustSnapshot,
        evaluated_at: datetime,
    ) -> list[PolicyRuleResult]:
        rules: list[PolicyRuleResult] = []
        verification_status = (
            "SATISFIED" if snapshot.verification_result == "PASS" else "NOT_SATISFIED"
        )
        rules.append(
            PolicyRuleResult(
                rule="Authoritative verification result",
                required="PASS",
                observed=snapshot.verification_result,
                status=verification_status,
                explanation=(
                    "The authoritative RVC result satisfies the required PASS result."
                    if verification_status == "SATISFIED"
                    else f"The authoritative RVC result is {snapshot.verification_result}, not PASS."
                ),
            )
        )

        if policy.minimum_independent_roots is None:
            rules.append(PolicyRuleResult(rule="Minimum independent roots", status="NOT_APPLICABLE", explanation="No minimum independent-root requirement is configured."))
        elif snapshot.independent_root_count is None:
            rules.append(PolicyRuleResult(rule="Minimum independent roots", required=policy.minimum_independent_roots, observed=None, status="UNAVAILABLE", explanation="Independent-root count is unavailable."))
        else:
            satisfied = snapshot.independent_root_count >= policy.minimum_independent_roots
            rules.append(PolicyRuleResult(rule="Minimum independent roots", required=policy.minimum_independent_roots, observed=snapshot.independent_root_count, status="SATISFIED" if satisfied else "NOT_SATISFIED", explanation=f"Observed {snapshot.independent_root_count} independent evidence root(s); policy requires at least {policy.minimum_independent_roots}."))

        rules.append(InstitutionalPolicyEvaluator._certificate_exists_rule(policy, snapshot))
        rules.append(InstitutionalPolicyEvaluator._certificate_usable_rule(policy, snapshot))
        rules.append(InstitutionalPolicyEvaluator._not_revoked_rule(policy, snapshot))
        rules.append(InstitutionalPolicyEvaluator._policygate_rule(policy, snapshot))
        rules.append(InstitutionalPolicyEvaluator._attestation_age_rule(policy, snapshot, evaluated_at))

        if not policy.blocking_reason_codes:
            rules.append(PolicyRuleResult(rule="Blocking RVC reason codes", required=[], observed=snapshot.reason_codes, status="NOT_APPLICABLE", explanation="No blocking reason codes are configured."))
        else:
            matched = sorted(set(policy.blocking_reason_codes) & set(snapshot.reason_codes))
            rules.append(PolicyRuleResult(rule="Blocking RVC reason codes", required=policy.blocking_reason_codes, observed=matched, status="NOT_SATISFIED" if matched else "SATISFIED", explanation=("Current RVC reason codes match configured blockers: " + ", ".join(matched) + ".") if matched else "No configured blocking reason code is present."))
        return rules

    @staticmethod
    def _certificate_exists_rule(policy: InstitutionalPolicy, snapshot: TrustSnapshot) -> PolicyRuleResult:
        if not policy.require_certificate:
            return PolicyRuleResult(rule="Certificate exists", required=False, observed=snapshot.certificate_exists, status="NOT_APPLICABLE", explanation="A certificate is not required by this policy.")
        if snapshot.certificate_exists is None:
            return PolicyRuleResult(rule="Certificate exists", required=True, observed=None, status="UNAVAILABLE", explanation="Current certificate existence cannot be established from available state.")
        return PolicyRuleResult(rule="Certificate exists", required=True, observed=snapshot.certificate_exists, status="SATISFIED" if snapshot.certificate_exists else "NOT_SATISFIED", explanation="A mapped certificate exists." if snapshot.certificate_exists else "No mapped certificate is registered.")

    @staticmethod
    def _certificate_usable_rule(policy: InstitutionalPolicy, snapshot: TrustSnapshot) -> PolicyRuleResult:
        if not policy.require_certificate_usable:
            return PolicyRuleResult(rule="Certificate currently usable", required=False, observed=snapshot.certificate_usable, status="NOT_APPLICABLE", explanation="Current certificate usability is not required.")
        if snapshot.certificate_usable is None:
            return PolicyRuleResult(rule="Certificate currently usable", required=True, observed=None, status="UNAVAILABLE", explanation="Current certificate usability is unavailable.")
        return PolicyRuleResult(rule="Certificate currently usable", required=True, observed=snapshot.certificate_usable, status="SATISFIED" if snapshot.certificate_usable else "NOT_SATISFIED", explanation="The certificate is currently usable." if snapshot.certificate_usable else f"The certificate is not currently usable; lifecycle state is {snapshot.certificate_lifecycle_state}.")

    @staticmethod
    def _not_revoked_rule(policy: InstitutionalPolicy, snapshot: TrustSnapshot) -> PolicyRuleResult:
        if not policy.require_not_revoked:
            return PolicyRuleResult(rule="Certificate not revoked", required=True, observed=None, status="NOT_APPLICABLE", explanation="Not-revoked status is not required.")
        if snapshot.certificate_exists is None:
            return PolicyRuleResult(rule="Certificate not revoked", required=True, observed=None, status="UNAVAILABLE", explanation="Revocation state cannot be established without current certificate state.")
        if not snapshot.certificate_exists:
            return PolicyRuleResult(rule="Certificate not revoked", required=True, observed=None, status="NOT_SATISFIED", explanation="Not-revoked status cannot be satisfied because no certificate exists.")
        revoked = snapshot.certificate_lifecycle_state == "REVOKED"
        return PolicyRuleResult(rule="Certificate not revoked", required=True, observed=not revoked, status="NOT_SATISFIED" if revoked else "SATISFIED", explanation="The certificate is revoked." if revoked else "The current certificate state is not revoked.")

    @staticmethod
    def _policygate_rule(policy: InstitutionalPolicy, snapshot: TrustSnapshot) -> PolicyRuleResult:
        if not policy.require_policygate_allow:
            return PolicyRuleResult(rule="PolicyGate outcome", required=None, observed=snapshot.policygate_outcome, status="NOT_APPLICABLE", explanation="PolicyGate ALLOW is not required.")
        if snapshot.policygate_outcome in {"NOT CHECKED", "UNAVAILABLE"}:
            return PolicyRuleResult(rule="PolicyGate outcome", required="ALLOW", observed=snapshot.policygate_outcome, status="UNAVAILABLE", explanation=f"Required PolicyGate ALLOW cannot be established; current outcome is {snapshot.policygate_outcome}.")
        allowed = snapshot.policygate_outcome == "ALLOW"
        return PolicyRuleResult(rule="PolicyGate outcome", required="ALLOW", observed=snapshot.policygate_outcome, status="SATISFIED" if allowed else "NOT_SATISFIED", explanation="PolicyGate currently allows the action." if allowed else "PolicyGate currently blocks the action.")

    @staticmethod
    def _attestation_age_rule(policy: InstitutionalPolicy, snapshot: TrustSnapshot, evaluated_at: datetime) -> PolicyRuleResult:
        maximum = policy.maximum_attestation_age_days
        if maximum is None:
            return PolicyRuleResult(rule="Maximum attestation age", status="NOT_APPLICABLE", explanation="No attestation-age requirement is configured.")
        observed_times: list[datetime] = []
        for record in snapshot.evidence_freshness_records:
            if not record.observed_at:
                continue
            try:
                observed_times.append(datetime.fromisoformat(record.observed_at.replace("Z", "+00:00")).astimezone(timezone.utc))
            except ValueError:
                continue
        if not observed_times:
            return PolicyRuleResult(rule="Maximum attestation age", required=maximum, observed=None, status="UNAVAILABLE", explanation="No parseable attestation observation time is available for the configured age rule.")
        oldest_days = max(0.0, max((evaluated_at - observed).total_seconds() for observed in observed_times) / 86_400)
        satisfied = oldest_days <= maximum
        return PolicyRuleResult(rule="Maximum attestation age", required=maximum, observed=round(oldest_days, 2), status="SATISFIED" if satisfied else "NOT_SATISFIED", explanation=f"Oldest observed attestation is {oldest_days:.2f} days old; policy maximum is {maximum} days.")

    @staticmethod
    def _decision(verification_result: str, rules: list[PolicyRuleResult]) -> str:
        if verification_result == "FAIL":
            return "REJECT"
        if verification_result in {"INDETERMINATE", "UNAVAILABLE"}:
            return "REVIEW_REQUIRED"
        if any(rule.status == "NOT_SATISFIED" for rule in rules):
            return "REJECT"
        if any(rule.status == "UNAVAILABLE" for rule in rules):
            return "REVIEW_REQUIRED"
        return "ACCEPT"

    @staticmethod
    def _explanation(decision: str, verification_result: str, rules: list[PolicyRuleResult]) -> str:
        unmet = sum(rule.status == "NOT_SATISFIED" for rule in rules)
        unavailable = sum(rule.status == "UNAVAILABLE" for rule in rules)
        if decision == "ACCEPT":
            return "The authoritative RVC result is PASS and every applicable configured policy requirement is satisfied."
        if verification_result in {"INDETERMINATE", "UNAVAILABLE"}:
            suffix = f" {unmet} configured requirement(s) are also not satisfied." if unmet else ""
            return f"Policy evaluation requires review because the authoritative verification result is {verification_result}; the custom policy cannot convert it to PASS.{suffix}"
        if decision == "REVIEW_REQUIRED":
            return f"The authoritative RVC result is PASS, but {unavailable} required policy input(s) are unavailable and require review."
        return f"The authoritative RVC result is {verification_result}; {unmet} configured policy requirement(s) are not satisfied."


class PolicyStudioService:
    """Application service for presets, versioned policies, and persisted evaluations."""

    def __init__(
        self,
        *,
        store: PolicyStore | None = None,
        evaluator: InstitutionalPolicyEvaluator | None = None,
    ) -> None:
        self.store = store or PolicyStore()
        self.evaluator = evaluator or InstitutionalPolicyEvaluator()

    def create_policy(self, draft: InstitutionalPolicyDraft) -> InstitutionalPolicy:
        if draft.policy_id in POLICY_PRESETS:
            raise PolicyValidationError("Demo policy preset identifiers cannot be overwritten.")
        return self.store.save_policy(draft)

    def get_policy(self, policy_id: str) -> InstitutionalPolicy:
        policy = POLICY_PRESETS.get(policy_id) or self.store.get_policy(policy_id)
        if policy is None:
            raise PolicyEvaluationError(f"Policy {policy_id!r} was not found.")
        return policy

    def overview(self) -> PolicyStudioOverview:
        return PolicyStudioOverview(
            presets=[self._summary(policy) for policy in POLICY_PRESETS.values()],
            saved_policies=[self._summary(policy) for policy in self.store.latest_policies()],
            supported_reason_codes=sorted(SUPPORTED_REASON_CODES),
        )

    def detail(self, policy_id: str) -> PolicyDetail:
        policy = self.get_policy(policy_id)
        evaluations = self.store.evaluations(policy.policy_id)
        transitions: list[PolicyDecisionTransition] = []
        for previous, current in zip(evaluations, evaluations[1:]):
            if previous.final_decision != current.final_decision:
                transitions.append(PolicyDecisionTransition(previous_evaluation_id=previous.evaluation_id, current_evaluation_id=current.evaluation_id, occurred_at=current.evaluated_at, previous_decision=previous.final_decision, current_decision=current.final_decision))
        compatible = [policy.supported_asset] if policy.supported_asset else (["USDY"] if policy.supported_claim == "TreasuryBacking" else ["PAXG"])
        return PolicyDetail(policy=policy, evaluations=evaluations[-50:], decision_transitions=transitions[-50:], compatible_assets=compatible)

    def evaluate_policy(self, policy_id: str, request: PolicyEvaluationRequest) -> PolicyEvaluation:
        evaluation = self.evaluator.evaluate(self.get_policy(policy_id), request)
        self.store.append_evaluation(evaluation)
        return evaluation

    def evaluations(self, policy_id: str) -> list[PolicyEvaluation]:
        self.get_policy(policy_id)
        return self.store.evaluations(policy_id)

    def _summary(self, policy: InstitutionalPolicy) -> PolicySummary:
        evaluations = self.store.evaluations(policy.policy_id)
        return PolicySummary(policy=policy, last_evaluation=evaluations[-1] if evaluations else None, evaluation_count=len(evaluations), href=f"/policies/{policy.policy_id}")


__all__ = [
    "InstitutionalPolicyEvaluator",
    "POLICY_PRESETS",
    "PolicyEvaluationError",
    "PolicyStudioService",
]
