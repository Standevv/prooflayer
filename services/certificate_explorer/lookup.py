"""Normalize fixture and live reads into one provenance-aware explorer record."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from time import time
from typing import Any, Callable

from services.certificate_explorer.models import (
    CertificateCore,
    CertificateExplorerRecord,
    CertificateLabels,
    CertificateTimeline,
    DecisionHistory,
    DecisionRecord,
    EnforcementStatus,
    OffchainVerificationData,
    RegistryState,
    UsabilityAssessment,
)
from services.mcp_server.tools import (
    POLICY_GATE_ADDRESS,
    REGISTRY_ADDRESS,
    XLAYER_CHAIN_ID,
    ProofLayerTools,
)
from services.rvc.certificate_serializer import identifier_to_bytes32


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIXTURE_PATHS = (
    PROJECT_ROOT / "data" / "demo" / "usdy-pass-certificate.json",
    PROJECT_ROOT / "data" / "demo" / "usdy-indeterminate-certificate.json",
)
BYTES32_PATTERN = re.compile(r"^0x[0-9a-fA-F]{64}$")
RESULT_NAMES = {0: "INDETERMINATE", 1: "PASS", 2: "FAIL"}

KNOWN_ASSETS = {
    identifier_to_bytes32("USDY"): "USDY",
    identifier_to_bytes32("PAXG"): "PAXG",
}
KNOWN_CLAIMS = {
    identifier_to_bytes32("TreasuryBacking"): "TreasuryBacking",
    identifier_to_bytes32("GoldBacking"): "GoldBacking",
}
KNOWN_POLICIES = {
    identifier_to_bytes32("default-treasury-policy"): "default-treasury-policy",
    identifier_to_bytes32("default-gold-policy"): "default-gold-policy",
}


class CertificateLookupError(ValueError):
    """Raised before any RPC read when an explorer request is malformed."""


def normalize_certificate_id(value: str) -> str:
    if not isinstance(value, str) or not BYTES32_PATTERN.fullmatch(value.strip()):
        raise CertificateLookupError(
            "Certificate ID must be a 0x-prefixed 32-byte value (64 hexadecimal characters)."
        )
    return value.strip().lower()


def _safe_error(error: Exception) -> str:
    message = str(error).strip()
    return message or "X Layer RPC request failed"


class CertificateLookupService:
    """Read ProofLayer certificate state without transactions or inferred chain data."""

    def __init__(
        self,
        tools: ProofLayerTools | Any | None = None,
        *,
        fixture_paths: Sequence[Path] = DEFAULT_FIXTURE_PATHS,
        now: Callable[[], float] = time,
    ) -> None:
        self.tools = tools or ProofLayerTools()
        self._now = now
        self._fixtures = self._load_fixtures(fixture_paths)

    @staticmethod
    def _load_fixtures(paths: Sequence[Path]) -> dict[str, Mapping[str, Any]]:
        fixtures: dict[str, Mapping[str, Any]] = {}
        for path in paths:
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                certificate_id = normalize_certificate_id(
                    str(payload["solidity"]["certificateId"])
                )
                if isinstance(payload, Mapping):
                    fixtures[certificate_id] = payload
            except (OSError, KeyError, TypeError, json.JSONDecodeError, CertificateLookupError):
                continue
        return fixtures

    @property
    def known_certificate_ids(self) -> list[str]:
        return list(self._fixtures)

    def list_known(self) -> list[CertificateExplorerRecord]:
        return [self.lookup(certificate_id, include_related=False) for certificate_id in self._fixtures]

    def lookup(
        self,
        certificate_id: str,
        *,
        include_related: bool = True,
    ) -> CertificateExplorerRecord:
        normalized_id = normalize_certificate_id(certificate_id)
        fixture = self._fixtures.get(normalized_id)
        fixture_core = self._fixture_core(normalized_id, fixture)
        warnings: list[str] = []

        live: Mapping[str, Any] | None = None
        live_error: str | None = None
        try:
            candidate = self.tools.get_certificate_state(normalized_id)
            if not isinstance(candidate, Mapping):
                raise TypeError("certificate state reader returned an invalid response")
            live = candidate
        except Exception as error:
            live_error = _safe_error(error)
            warnings.append("Live X Layer certificate state is unavailable; local fixture metadata is preserved separately.")

        latest_block: int | None = None
        if live is not None:
            try:
                network = self.tools.get_xlayer_status()
                if isinstance(network, Mapping) and isinstance(network.get("latest_block"), int):
                    latest_block = int(network["latest_block"])
            except Exception as error:
                warnings.append(f"Latest X Layer block unavailable: {_safe_error(error)}")

        registered = bool(live.get("registered")) if live is not None else None
        if registered:
            core = self._live_core(normalized_id, live)
            field_sources = {
                field: "LIVE ON-CHAIN" for field in CertificateCore.model_fields
            }
        elif fixture_core is not None:
            core = fixture_core
            field_sources = {
                field: ("DEMO FIXTURE" if getattr(core, field) is not None else "UNAVAILABLE")
                for field in CertificateCore.model_fields
            }
        else:
            core = CertificateCore(certificate_id=normalized_id)
            field_sources = {
                field: ("DERIVED" if field == "certificate_id" else "UNAVAILABLE")
                for field in CertificateCore.model_fields
            }

        fixture_matches_live = self._fixture_matches_live(fixture_core, core, registered)
        labels = self._labels(core)
        offchain = self._offchain_data(fixture, fixture_matches_live, registered)
        if fixture is not None and registered and fixture_matches_live is False:
            warnings.append("Local fixture contents do not match the registered certificate; fixture interpretation is withheld.")

        usability = self._usability(live, core)
        registry = RegistryState(
            read_status="AVAILABLE" if live is not None else "UNAVAILABLE",
            certificate_exists=registered,
            current_usable=(bool(live.get("usable")) if live is not None else None),
            issuer=(str(live.get("issuer")) if live and live.get("issuer") else None),
            revoked=(bool(live.get("revoked")) if live and registered else None),
            latest_block=latest_block,
            error=live_error,
            source="LIVE ON-CHAIN" if live is not None else "UNAVAILABLE",
        )

        decisions = self._decision_history(
            normalized_id,
            registered=registered,
            live_available=live is not None,
            include_related=include_related,
        )
        if latest_block is None and decisions.query_to_block is not None:
            registry.latest_block = decisions.query_to_block
        enforcement = self._enforcement(
            normalized_id,
            labels,
            registered=registered,
            live_available=live is not None,
            include_related=include_related,
        )

        authenticity_sources: list[str] = []
        if fixture is not None:
            authenticity_sources.append("DEMO FIXTURE")
        if live is not None:
            authenticity_sources.append("LIVE ON-CHAIN")
        if any((labels.asset, labels.claim, labels.policy)):
            authenticity_sources.append("DERIVED FROM KNOWN PROJECT CONFIG")

        return CertificateExplorerRecord(
            certificate_id=normalized_id,
            found=bool(fixture is not None or registered),
            live_certificate_found=registered,
            local_fixture_found=fixture is not None,
            fixture_matches_live=fixture_matches_live,
            core=core,
            field_sources=field_sources,
            labels=labels,
            offchain_verification=offchain,
            registry=registry,
            usability=usability,
            decisions=decisions,
            enforcement=enforcement,
            timeline=CertificateTimeline(
                observed_at=core.observed_at,
                registered_network="X Layer Testnet" if registered else None,
                valid_until=core.valid_until,
                validity_state=(
                    "UNAVAILABLE"
                    if core.valid_until is None
                    else "EXPIRED"
                    if core.valid_until <= self._now()
                    else "ACTIVE"
                ),
                current_state=usability.state,
            ),
            authenticity_sources=authenticity_sources,
            warnings=warnings,
        )

    @staticmethod
    def _fixture_core(
        certificate_id: str,
        fixture: Mapping[str, Any] | None,
    ) -> CertificateCore | None:
        if fixture is None:
            return None
        solidity = fixture.get("solidity")
        human = fixture.get("human")
        if not isinstance(solidity, Mapping) or not isinstance(human, Mapping):
            return None
        result_code = int(solidity["result"])
        result = str(human.get("result") or RESULT_NAMES.get(result_code, "UNKNOWN"))
        return CertificateCore(
            certificate_id=certificate_id,
            asset_id=str(solidity["assetId"]).lower(),
            claim_type=str(solidity["claimType"]).lower(),
            policy_id=str(solidity["policyId"]).lower(),
            evidence_root=str(solidity["evidenceRoot"]).lower(),
            observed_at=int(solidity["observedAt"]),
            valid_until=int(solidity["validUntil"]),
            independent_root_count=int(solidity["independentRootCount"]),
            result_code=result_code,
            result=result,
        )

    @staticmethod
    def _live_core(certificate_id: str, live: Mapping[str, Any]) -> CertificateCore:
        result_code = live.get("result_code")
        normalized_result_code = int(result_code) if isinstance(result_code, int) else None
        result = str(live.get("result") or RESULT_NAMES.get(normalized_result_code, "UNKNOWN"))
        return CertificateCore(
            certificate_id=certificate_id,
            asset_id=str(live["asset_id"]).lower(),
            claim_type=str(live["claim_type"]).lower(),
            policy_id=str(live["policy_id"]).lower(),
            evidence_root=str(live["evidence_root"]).lower(),
            observed_at=int(live["observed_at"]),
            valid_until=int(live["valid_until"]),
            independent_root_count=int(live["independent_root_count"]),
            result_code=normalized_result_code,
            result=result,
            issuer=str(live["issuer"]),
            revoked=bool(live["revoked"]),
        )

    @staticmethod
    def _fixture_matches_live(
        fixture: CertificateCore | None,
        core: CertificateCore,
        registered: bool | None,
    ) -> bool | None:
        if fixture is None or not registered:
            return None
        fields = (
            "certificate_id",
            "asset_id",
            "claim_type",
            "policy_id",
            "evidence_root",
            "observed_at",
            "valid_until",
            "independent_root_count",
            "result_code",
        )
        return all(getattr(fixture, field) == getattr(core, field) for field in fields)

    @staticmethod
    def _labels(core: CertificateCore) -> CertificateLabels:
        return CertificateLabels(
            asset=KNOWN_ASSETS.get(core.asset_id or ""),
            claim=KNOWN_CLAIMS.get(core.claim_type or ""),
            policy=KNOWN_POLICIES.get(core.policy_id or ""),
        )

    @staticmethod
    def _offchain_data(
        fixture: Mapping[str, Any] | None,
        fixture_matches_live: bool | None,
        registered: bool | None,
    ) -> OffchainVerificationData | None:
        if fixture is None or (registered and fixture_matches_live is not True):
            return None
        human = fixture.get("human")
        if not isinstance(human, Mapping):
            return None
        reasons = human.get("reason_codes")
        return OffchainVerificationData(
            claim_version=str(human.get("claim_version", "Unknown")),
            policy_version=str(human.get("policy_version", "Unknown")),
            reason_codes=(
                [str(item) for item in reasons]
                if isinstance(reasons, Sequence) and not isinstance(reasons, (str, bytes))
                else []
            ),
            compiler_version=str(human.get("compiler_version", "Unknown")),
            simulation=bool(human.get("simulation")),
        )

    def _usability(
        self,
        live: Mapping[str, Any] | None,
        core: CertificateCore,
    ) -> UsabilityAssessment:
        if live is None:
            return UsabilityAssessment(
                state="LIVE READ UNAVAILABLE",
                reason="Current usability cannot be confirmed because the X Layer read is unavailable.",
                source="UNAVAILABLE",
            )
        if not live.get("registered"):
            return UsabilityAssessment(
                state="NOT REGISTERED",
                usable=False,
                reason="Certificate ID is not registered in the deployed CertificateRegistry.",
                source="LIVE ON-CHAIN",
            )
        if core.revoked:
            return UsabilityAssessment(
                state="REVOKED", usable=False, reason="The registered certificate is revoked.", source="LIVE ON-CHAIN"
            )
        if core.result != "PASS":
            return UsabilityAssessment(
                state="NON-PASS",
                usable=False,
                reason=f"Historical verification result is {core.result}; only PASS certificates can be usable.",
                source="LIVE ON-CHAIN",
            )
        if core.valid_until is not None and core.valid_until <= self._now():
            return UsabilityAssessment(
                state="EXPIRED", usable=False, reason="The certificate validity window has expired.", source="LIVE ON-CHAIN"
            )
        if bool(live.get("usable")):
            return UsabilityAssessment(
                state="USABLE", usable=True, reason="The registry currently reports this certificate as usable.", source="LIVE ON-CHAIN"
            )
        return UsabilityAssessment(
            state="UNUSABLE",
            usable=False,
            reason="The registry currently reports this PASS certificate as unusable.",
            source="LIVE ON-CHAIN",
        )

    def _decision_history(
        self,
        certificate_id: str,
        *,
        registered: bool | None,
        live_available: bool,
        include_related: bool,
    ) -> DecisionHistory:
        note = "Rejected PolicyGate calls revert and therefore do not create successful DecisionLog entries."
        if not include_related:
            return DecisionHistory(
                read_status="NOT CHECKED",
                note=note,
                source="UNAVAILABLE",
            )
        if not live_available:
            return DecisionHistory(read_status="UNAVAILABLE", note=note, source="UNAVAILABLE")
        if not registered:
            return DecisionHistory(
                read_status="NOT CHECKED",
                note=note,
                source="UNAVAILABLE",
            )
        try:
            history = self.tools.get_decision_history(certificate_id)
            if not isinstance(history, Mapping):
                raise TypeError("decision history reader returned an invalid response")
            raw_records = history.get("matching_decisions")
            records = []
            if isinstance(raw_records, Sequence) and not isinstance(raw_records, (str, bytes)):
                for item in raw_records:
                    if not isinstance(item, Mapping):
                        continue
                    records.append(
                        DecisionRecord(
                            decision_id=str(item["decision_id"]),
                            certificate_id=str(item["certificate_id"]),
                            actor=str(item["actor"]),
                            action_type=str(item["action_type"]),
                            allowed=bool(item["allowed"]),
                            timestamp=int(item["timestamp"]),
                            block_number=int(item["block_number"]),
                            transaction_hash=(
                                str(item["transaction_hash"])
                                if item.get("transaction_hash")
                                else None
                            ),
                        )
                    )
            return DecisionHistory(
                read_status="AVAILABLE",
                records=records,
                matching_count=len(records),
                total_decision_count=(
                    int(history["decision_count"])
                    if isinstance(history.get("decision_count"), int)
                    else None
                ),
                query_from_block=(
                    int(history["query_from_block"])
                    if isinstance(history.get("query_from_block"), int)
                    else None
                ),
                query_to_block=(
                    int(history["query_to_block"])
                    if isinstance(history.get("query_to_block"), int)
                    else None
                ),
                history_complete_since_deployment=(
                    bool(history["history_complete_since_deployment"])
                    if "history_complete_since_deployment" in history
                    else None
                ),
                note=note,
                source="LIVE ON-CHAIN",
            )
        except Exception:
            return DecisionHistory(read_status="UNAVAILABLE", note=note, source="UNAVAILABLE")

    def _enforcement(
        self,
        certificate_id: str,
        labels: CertificateLabels,
        *,
        registered: bool | None,
        live_available: bool,
        include_related: bool,
    ) -> EnforcementStatus:
        if not include_related:
            return EnforcementStatus(
                read_status="NOT CHECKED",
                outcome="NOT CHECKED",
                reason="PolicyGate is checked only for a registered certificate with known exact identifiers.",
                source="UNAVAILABLE",
            )
        if not live_available:
            return EnforcementStatus(
                read_status="UNAVAILABLE",
                outcome="UNAVAILABLE",
                reason="PolicyGate live read is unavailable.",
                source="UNAVAILABLE",
            )
        if not registered:
            return EnforcementStatus(
                read_status="NOT CHECKED",
                outcome="NOT CHECKED",
                reason="PolicyGate is checked only for a registered certificate with known exact identifiers.",
                source="UNAVAILABLE",
            )
        if not all((labels.asset, labels.claim, labels.policy)):
            return EnforcementStatus(
                read_status="NOT CHECKED",
                outcome="NOT CHECKED",
                reason="Unknown bytes32 identifiers are not reverse-mapped or submitted to PolicyGate assessment.",
                source="UNAVAILABLE",
            )
        try:
            result = self.tools.get_policygate_state(
                certificate_id,
                labels.asset,
                labels.claim,
                labels.policy,
            )
            if not isinstance(result, Mapping):
                raise TypeError("PolicyGate reader returned an invalid response")
            outcome = "ALLOW" if result.get("policygate_outcome") == "ALLOWED" else "BLOCK"
            return EnforcementStatus(
                read_status="AVAILABLE",
                certificate_usable=bool(result.get("certificate_usable")),
                outcome=outcome,
                reason=str(result.get("reason", "Read-only PolicyGate assessment completed.")),
                source="LIVE ON-CHAIN",
            )
        except Exception:
            return EnforcementStatus(
                read_status="UNAVAILABLE",
                outcome="UNAVAILABLE",
                reason="PolicyGate live read is unavailable.",
                source="UNAVAILABLE",
            )


__all__ = [
    "CertificateLookupError",
    "CertificateLookupService",
    "normalize_certificate_id",
]
