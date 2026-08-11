"""Deterministic policy validation, normalization, identity, and commitment rules."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from .models import InstitutionalPolicy, InstitutionalPolicyDraft


class PolicyValidationError(ValueError):
    """Raised when a policy is unsupported, unsafe, or internally inconsistent."""


def policy_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:64]
    if len(slug) < 3:
        raise PolicyValidationError(
            "Policy name must produce an identifier containing at least three letters or numbers."
        )
    return slug


def material_policy_payload(policy: InstitutionalPolicyDraft | InstitutionalPolicy) -> dict[str, Any]:
    """Return only decision-relevant fields in stable key order."""

    return {
        "blocking_reason_codes": sorted(policy.blocking_reason_codes),
        "enabled": policy.enabled,
        "maximum_attestation_age_days": policy.maximum_attestation_age_days,
        "minimum_independent_roots": policy.minimum_independent_roots,
        "require_certificate": policy.require_certificate,
        "require_certificate_usable": policy.require_certificate_usable,
        "require_not_revoked": policy.require_not_revoked,
        "require_policygate_allow": policy.require_policygate_allow,
        "required_verification_results": sorted(policy.required_verification_results),
        "supported_asset": policy.supported_asset,
        "supported_claim": policy.supported_claim,
    }


def policy_commitment(policy_id: str, policy: InstitutionalPolicyDraft | InstitutionalPolicy) -> str:
    payload = {"policy_id": policy_id, "requirements": material_policy_payload(policy)}
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "0x" + hashlib.sha256(encoded).hexdigest()


def validate_policy_draft(policy: InstitutionalPolicyDraft) -> InstitutionalPolicyDraft:
    """Explicit boundary retained for service callers and human-readable errors."""

    if policy.required_verification_results != ["PASS"]:
        raise PolicyValidationError(
            "Custom policies may require PASS but cannot relabel FAIL or INDETERMINATE as PASS."
        )
    return policy


__all__ = [
    "PolicyValidationError",
    "material_policy_payload",
    "policy_commitment",
    "policy_slug",
    "validate_policy_draft",
]
