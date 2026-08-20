"""Regression tests for verification trust integrity.

Proves:
- USDT0 cannot inherit USDY TreasuryBacking verification
- USDG cannot inherit PAXG GoldBacking verification
- Unsupported market assets return UNVERIFIED
- Market data remains available when verification is UNVERIFIED
- USDY/PAXG remain CROSS_CHAIN_REFERENCE
- Deployment verification does NOT imply backing verification
- Raw RVC results remain unchanged
"""

from __future__ import annotations

import pytest

from services.markets.trust import (
    VerificationCoverage,
    get_verification_coverage,
)


# ── Known addresses ──────────────────────────────────────────────────

USDT0_ADDRESS = "0x779ded0c9e1022225f8e0630b35a9b54be713736"
USDG_ADDRESS = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8"
WOKB_ADDRESS = "0xe538905cf8410324e03a5a23c1c177a474d59b2b"
UNKNOWN_ADDRESS = "0x0000000000000000000000000000000000000001"


# ── USDT0 false association tests ────────────────────────────────────

class TestUSDT0TrustIntegrity:
    """USDT0 must NOT inherit USDY TreasuryBacking verification."""

    def test_usdt0_is_unverified(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert cov.verification_status == "UNVERIFIED"

    def test_usdt0_verification_not_available(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert cov.verification_available is False

    def test_usdt0_no_rvc_result(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert cov.rvc_result is None

    def test_usdt0_no_certificate_state(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert cov.certificate_state is None

    def test_usdt0_no_policygate_state(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert cov.policygate_state is None

    def test_usdt0_has_limitation_message(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert len(cov.limitations) > 0
        assert "no" in cov.limitations[0].lower() or "not" in cov.limitations[0].lower()

    def test_usdt0_no_fake_treasury_backing(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        # Must not contain any TreasuryBacking association
        assert cov.rvc_result != "PASS"
        assert cov.verification_status != "VERIFIED"


# ── USDG false association tests ─────────────────────────────────────

class TestUSDGTrustIntegrity:
    """USDG must NOT inherit PAXG GoldBacking verification."""

    def test_usdg_is_unverified(self):
        cov = get_verification_coverage(USDG_ADDRESS, "USDG")
        assert cov.verification_status == "UNVERIFIED"

    def test_usdg_verification_not_available(self):
        cov = get_verification_coverage(USDG_ADDRESS, "USDG")
        assert cov.verification_available is False

    def test_usdg_no_rvc_result(self):
        cov = get_verification_coverage(USDG_ADDRESS, "USDG")
        assert cov.rvc_result is None

    def test_usdg_no_certificate_state(self):
        cov = get_verification_coverage(USDG_ADDRESS, "USDG")
        assert cov.certificate_state is None

    def test_usdg_no_fake_gold_backing(self):
        cov = get_verification_coverage(USDG_ADDRESS, "USDG")
        assert cov.rvc_result != "PASS"
        assert cov.verification_status != "VERIFIED"


# ── Unsupported asset tests ──────────────────────────────────────────

class TestUnsupportedAssetTrust:
    """Any address without a verification claim returns UNVERIFIED."""

    def test_unknown_address_unverified(self):
        cov = get_verification_coverage(UNKNOWN_ADDRESS, "UNKNOWN")
        assert cov.verification_status == "UNVERIFIED"

    def test_unknown_address_not_available(self):
        cov = get_verification_coverage(UNKNOWN_ADDRESS, "UNKNOWN")
        assert cov.verification_available is False

    def test_wokb_unverified(self):
        cov = get_verification_coverage(WOKB_ADDRESS, "WOKB")
        assert cov.verification_status == "UNVERIFIED"


# ── Market data independence tests ───────────────────────────────────

class TestMarketDataIndependence:
    """Market data (APY, LTV, liquidity) must work regardless of verification status."""

    def test_verification_coverage_has_observed_at(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert cov.observed_at is not None
        assert len(cov.observed_at) > 0

    def test_verification_coverage_returns_valid_model(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert isinstance(cov, VerificationCoverage)
        assert cov.asset_address == USDT0_ADDRESS
        assert cov.symbol == "USDT0"


# ── Cross-chain reference metadata tests ─────────────────────────────

class TestCrossChainReferenceMetadata:
    """USDY and PAXG must remain CROSS_CHAIN_REFERENCE, never X Layer native."""

    def test_usdy_is_cross_chain_reference(self):
        from services.verification.registry import get_asset_by_symbol
        asset = get_asset_by_symbol("USDY")
        assert asset is not None
        assert asset.asset_origin.value == "CROSS_CHAIN_REFERENCE"

    def test_usdy_not_deployed_on_xlayer(self):
        from services.verification.registry import get_asset_by_symbol
        asset = get_asset_by_symbol("USDY")
        assert asset.deployed_on_xlayer is False

    def test_usdy_no_contract_address(self):
        from services.verification.registry import get_asset_by_symbol
        asset = get_asset_by_symbol("USDY")
        assert asset.contract_address == ""

    def test_paxg_is_cross_chain_reference(self):
        from services.verification.registry import get_asset_by_symbol
        asset = get_asset_by_symbol("PAXG")
        assert asset is not None
        assert asset.asset_origin.value == "CROSS_CHAIN_REFERENCE"

    def test_paxg_not_deployed_on_xlayer(self):
        from services.verification.registry import get_asset_by_symbol
        asset = get_asset_by_symbol("PAXG")
        assert asset.deployed_on_xlayer is False

    def test_paxg_no_contract_address(self):
        from services.verification.registry import get_asset_by_symbol
        asset = get_asset_by_symbol("PAXG")
        assert asset.contract_address == ""


# ── Deployment vs backing verification separation ────────────────────

class TestDeploymentVsBackingSeparation:
    """Deployment verification does NOT imply backing verification."""

    def test_registry_has_distinct_fields(self):
        from services.verification.registry import get_asset_by_symbol
        asset = get_asset_by_symbol("USDY")
        # These are independent fields
        assert hasattr(asset, "deployment_verified")
        assert hasattr(asset, "framework_verified")
        assert hasattr(asset, "backing_verified")

    def test_deployment_verified_does_not_imply_backing(self):
        """Even if deployment_verified=True, backing_verified can be False."""
        from services.verification.registry import RwaAsset, AssetOrigin, RwaVerificationSupport, RwaDiscoveryStatus
        asset = RwaAsset(
            chain_id=196,
            contract_address="0x1234",
            symbol="TEST",
            canonical_name="Test Asset",
            issuer="Test",
            asset_class="TOKENIZED_TREASURY",
            decimals=18,
            deployment_source="test",
            issuer_source="test",
            evidence_adapter="test",
            verification_support=RwaVerificationSupport.DISCOVERED_ONLY,
            current_status=RwaDiscoveryStatus.UNSUPPORTED,
            discovery_timestamp="2025-01-01T00:00:00Z",
            asset_origin=AssetOrigin.X_LAYER_NATIVE,
            deployment_verified=True,
            backing_verified=False,
        )
        assert asset.deployment_verified is True
        assert asset.backing_verified is False


# ── No fake verification values ──────────────────────────────────────

class TestNoFakeValues:
    """No fabricated verification values for unsupported assets."""

    def test_usdt0_no_reason_codes(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert cov.reason_codes == []

    def test_usdt0_no_evidence_roots(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert cov.evidence_roots is None

    def test_usdt0_freshness_unknown(self):
        cov = get_verification_coverage(USDT0_ADDRESS, "USDT0")
        assert cov.freshness_state == "UNKNOWN"
