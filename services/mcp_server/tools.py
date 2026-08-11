"""Read-only ProofLayer tools exposed through the official MCP Python SDK."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from time import monotonic
from typing import Any, Callable, Mapping
from urllib.request import Request, urlopen

from services.evidence.evm import RpcCall
from services.evidence.ondo import (
    OndoAdapterError,
    get_usdy_evidence,
    load_usdy_official_snapshot,
)
from services.evidence.paxos import load_paxg_official_snapshot
from services.evidence.usdy_attestation import (
    UsdyAttestationError,
    load_usdy_attestation_snapshot,
)
from services.provenance.engine import analyze_provenance as run_provenance_analysis
from services.rvc.certificate_serializer import identifier_to_bytes32
from services.rvc.gold_backing import verify_gold_backing
from services.rvc.models import EvidenceRecord, VerificationCertificate
from services.rvc.treasury_backing import verify_treasury_backing
from services.xlayer.cache import MISSING, TtlCache
from services.xlayer.config import (
    ChainReadSettings,
    DECISION_LOG_ADDRESS,
    DECISION_LOG_DEPLOYMENT_BLOCK,
    DEFAULT_XLAYER_RPC_URL,
    POLICY_GATE_ADDRESS,
    REGISTRY_ADDRESS,
    XLAYER_CHAIN_ID,
    XLAYER_NETWORK,
)
from services.xlayer.events import BoundedEventQuery, EventQueryUnavailable


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEPLOYMENT_BLOCK = DECISION_LOG_DEPLOYMENT_BLOCK

# Keccak-256 selectors/topics computed from the deployed contract ABI.
CERTIFICATE_EXISTS_SELECTOR = "b440983e"
CERTIFICATE_USABLE_SELECTOR = "48a47542"
GET_CERTIFICATE_SELECTOR = "f333fe08"
POLICY_GATE_REGISTRY_SELECTOR = "7b103999"
POLICY_GATE_DECISION_LOG_SELECTOR = "de53d1bb"
EXECUTED_ACTION_COUNT_SELECTOR = "ec7cd918"
DECISION_COUNT_SELECTOR = "100b63cb"
DECISION_RECORDED_TOPIC = (
    "0xc1be669571e69cfae85eaeab7310cd8eaca34a9b5edf7b22e226748b3cd3da94"
)


class ProofLayerToolError(ValueError):
    """Raised when a tool cannot return authoritative data."""


def _iso(value: Any) -> Any:
    if isinstance(value, datetime):
        rendered = value.isoformat()
        return rendered if value.tzinfo is not None else rendered + "Z"
    return value


def _normalize_asset(asset: str) -> str:
    normalized = asset.strip().upper() if isinstance(asset, str) else ""
    if normalized not in {"USDY", "PAXG"}:
        raise ProofLayerToolError(
            f"unsupported asset {asset!r}; supported assets are USDY and PAXG"
        )
    return normalized


def _expected_claim(asset: str) -> str:
    return "TreasuryBacking" if asset == "USDY" else "GoldBacking"


def _normalize_claim(asset: str, claim: str) -> str:
    compact = "".join(character for character in claim if character.isalnum()).lower()
    expected = _expected_claim(asset)
    aliases = {
        "USDY": {"treasurybacking", "treasury"},
        "PAXG": {"goldbacking", "gold"},
    }
    if compact not in aliases[asset]:
        raise ProofLayerToolError(
            f"unsupported claim {claim!r} for {asset}; supported claim is {expected}"
        )
    return expected


def _bytes32(value: str, name: str = "certificate_id") -> str:
    if not isinstance(value, str):
        raise ProofLayerToolError(f"{name} must be a 0x-prefixed bytes32 value")
    normalized = value.strip().lower()
    if (
        len(normalized) != 66
        or not normalized.startswith("0x")
        or any(character not in "0123456789abcdef" for character in normalized[2:])
    ):
        raise ProofLayerToolError(f"{name} must be a 0x-prefixed bytes32 value")
    return normalized


def _fixture_certificate_id() -> str | None:
    path = PROJECT_ROOT / "data" / "demo" / "usdy-pass-certificate.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return _bytes32(payload["solidity"]["certificateId"])
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def _load_paxg_evidence() -> list[EvidenceRecord]:
    return load_paxg_official_snapshot()


def _evidence_value(value: Any) -> Any:
    value = _iso(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _evidence_record(item: EvidenceRecord) -> dict[str, Any]:
    return {
        "field": item.field,
        "value": _evidence_value(item.value),
        "unit": item.unit,
        "source_id": item.source_id,
        "source_type": item.source_type,
        "root_source_id": item.root_source_id,
        "evidence_tier": item.evidence_tier,
        "observed_at": _iso(item.observed_at),
        "retrieved_at": _iso(item.retrieved_at),
        "dependent_on": list(item.dependency_parent_ids),
        "content_hash": item.content_hash,
        "simulation": item.simulation,
        "cache_status": item.metadata.get("cache_status"),
        "rpc_source": item.metadata.get("rpc_source"),
    }


def _predicate(item: Any) -> dict[str, Any]:
    return {
        "predicate": item.predicate,
        "passed": item.passed,
        "expected": _evidence_value(item.expected),
        "observed": _evidence_value(item.observed),
        "reason_code": item.reason_code,
    }


def _certificate(certificate: VerificationCertificate) -> dict[str, Any]:
    return {
        "asset": certificate.asset_id,
        "claim": certificate.claim_type,
        "verification_result": certificate.result.value,
        "reason_codes": list(certificate.reason_codes),
        "evidence_root": certificate.evidence_root,
        "evidence_root_count": certificate.independent_root_count,
        "commitment_version": "pl-evidence-v1",
        "canonical_root_count": certificate.independent_root_count,
        "independent_trust_domain_count": certificate.independent_root_count,
        "observed_source_count": certificate.independent_root_count,
        "unknown_root_count": 0,
        "observed_at": _iso(certificate.observed_at),
        "valid_until": _iso(certificate.valid_until),
        "policy_id": certificate.policy_id,
        "policy_version": certificate.policy_version,
        "simulation": certificate.simulation_flag,
        "predicates": [_predicate(item) for item in certificate.predicate_results],
        "authority": "ProofLayer deterministic RVC",
    }


class XLayerReadClient:
    """Small, dependency-free JSON-RPC reader for the fixed testnet deployment."""

    def __init__(
        self,
        rpc_url: str | None = None,
        *,
        opener: Callable[..., Any] | None = None,
        timeout: float | None = None,
    ) -> None:
        self.rpc_url = rpc_url or os.getenv(
            "XLAYER_TESTNET_RPC_URL", DEFAULT_XLAYER_RPC_URL
        )
        self._opener = opener or urlopen
        self._timeout = timeout or ChainReadSettings.from_env().rpc_timeout_seconds
        self._request_id = 0

    def _post(self, payload: Any) -> Any:
        request = Request(
            self.rpc_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "ProofLayer/0.1"},
            method="POST",
        )
        try:
            with self._opener(request, timeout=self._timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            raise ProofLayerToolError("X Layer RPC request failed") from error

    def request(self, method: str, params: list[Any]) -> Any:
        self._request_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }
        response = self._post(payload)
        if not isinstance(response, Mapping) or "error" in response:
            message = response.get("error") if isinstance(response, Mapping) else response
            raise ProofLayerToolError(f"X Layer RPC returned an error: {message}")
        if "result" not in response:
            raise ProofLayerToolError("X Layer RPC returned no result")
        return response["result"]

    def batch(self, calls: list[tuple[str, list[Any]]]) -> list[Any]:
        payload = []
        ids: list[int] = []
        for method, params in calls:
            self._request_id += 1
            ids.append(self._request_id)
            payload.append(
                {
                    "jsonrpc": "2.0",
                    "id": self._request_id,
                    "method": method,
                    "params": params,
                }
            )
        response = self._post(payload)
        if not isinstance(response, list):
            raise ProofLayerToolError("X Layer RPC rejected a batch log request")
        by_id = {item.get("id"): item for item in response if isinstance(item, Mapping)}
        results: list[Any] = []
        for request_id in ids:
            item = by_id.get(request_id)
            if not item or "error" in item or "result" not in item:
                raise ProofLayerToolError("X Layer RPC returned an incomplete log batch")
            results.append(item["result"])
        return results

    def assert_chain(self) -> int:
        chain_id = int(str(self.request("eth_chainId", [])), 16)
        if chain_id != XLAYER_CHAIN_ID:
            raise ProofLayerToolError(
                f"RPC returned chain ID {chain_id}; expected {XLAYER_CHAIN_ID}"
            )
        return chain_id

    def eth_call(self, address: str, data: str) -> str:
        result = self.request("eth_call", [{"to": address, "data": data}, "latest"])
        if not isinstance(result, str) or not result.startswith("0x"):
            raise ProofLayerToolError("X Layer eth_call returned malformed data")
        return result

    def latest_block(self) -> int:
        return int(str(self.request("eth_blockNumber", [])), 16)


def _words(encoded: str) -> list[str]:
    payload = encoded[2:]
    if not payload or len(payload) % 64:
        raise ProofLayerToolError("contract returned malformed ABI data")
    return [payload[index : index + 64] for index in range(0, len(payload), 64)]


def _bool(encoded: str) -> bool:
    words = _words(encoded)
    return int(words[0], 16) != 0


def _uint(encoded: str) -> int:
    words = _words(encoded)
    return int(words[0], 16)


def _address(encoded: str) -> str:
    words = _words(encoded)
    return "0x" + words[0][-40:]


class ProofLayerTools:
    """Authoritative read-only operations used by both MCP and offline tests."""

    def __init__(
        self,
        chain: XLayerReadClient | Any | None = None,
        *,
        settings: ChainReadSettings | None = None,
        cache: TtlCache | None = None,
        ethereum_rpc_url: str | None = None,
        ethereum_rpc_call: RpcCall | None = None,
        usdy_attestation_path: str | Path | None = None,
    ) -> None:
        self.chain = chain or XLayerReadClient()
        self.settings = settings or ChainReadSettings.from_env()
        self._cache = cache or TtlCache(
            ttl_seconds=self.settings.cache_ttl_seconds,
            max_entries=self.settings.cache_max_entries,
        )
        self.ethereum_rpc_url = ethereum_rpc_url
        self.ethereum_rpc_call = ethereum_rpc_call
        self.usdy_attestation_path = usdy_attestation_path
        self._ethereum_live_read_failed = False
        self._attestation_read_failed = False

    def _cached(self, key: str, loader: Callable[[], Any]) -> Any:
        cached = self._cache.get(key)
        if cached is not MISSING:
            return cached
        value = loader()
        self._cache.set(key, value)
        return value

    def _load_evidence(self, asset: str) -> list[EvidenceRecord]:
        if asset != "USDY":
            return _load_paxg_evidence()
        if self.ethereum_rpc_url is None and self.ethereum_rpc_call is None:
            return load_usdy_official_snapshot()

        def load_live_evidence() -> list[EvidenceRecord]:
            self._ethereum_live_read_failed = False
            self._attestation_read_failed = False
            try:
                evidence = get_usdy_evidence(
                    rpc_url=self.ethereum_rpc_url,
                    rpc_call=self.ethereum_rpc_call,
                )
            except OndoAdapterError:
                self._ethereum_live_read_failed = True
                evidence = load_usdy_official_snapshot()
            if self.usdy_attestation_path is not None:
                try:
                    evidence = evidence + load_usdy_attestation_snapshot(
                        self.usdy_attestation_path
                    )
                except (UsdyAttestationError, OSError):
                    self._attestation_read_failed = True
            return evidence

        return self._cached("usdy-evidence", load_live_evidence)

    @property
    def _attestation_available(self) -> bool:
        return (
            self.usdy_attestation_path is not None
            and not self._attestation_read_failed
        )

    @property
    def _ethereum_live_read_enabled(self) -> bool:
        return self.ethereum_rpc_url is not None or self.ethereum_rpc_call is not None

    @property
    def _evidence_source_mode(self) -> str:
        if self._ethereum_live_read_enabled and not self._ethereum_live_read_failed:
            return "repository official snapshot + live Ethereum read"
        return "repository official snapshot"

    def _read_certificate_context(self, certificate_id: str) -> dict[str, Any]:
        argument = certificate_id[2:]
        calls = [
            ("eth_chainId", []),
            ("eth_blockNumber", []),
            (
                "eth_call",
                [
                    {
                        "to": REGISTRY_ADDRESS,
                        "data": "0x" + CERTIFICATE_EXISTS_SELECTOR + argument,
                    },
                    "latest",
                ],
            ),
            (
                "eth_call",
                [
                    {
                        "to": REGISTRY_ADDRESS,
                        "data": "0x" + CERTIFICATE_USABLE_SELECTOR + argument,
                    },
                    "latest",
                ],
            ),
            (
                "eth_call",
                [
                    {
                        "to": REGISTRY_ADDRESS,
                        "data": "0x" + GET_CERTIFICATE_SELECTOR + argument,
                    },
                    "latest",
                ],
            ),
            (
                "eth_call",
                [
                    {
                        "to": POLICY_GATE_ADDRESS,
                        "data": "0x" + POLICY_GATE_REGISTRY_SELECTOR,
                    },
                    "latest",
                ],
            ),
            (
                "eth_call",
                [
                    {
                        "to": POLICY_GATE_ADDRESS,
                        "data": "0x" + POLICY_GATE_DECISION_LOG_SELECTOR,
                    },
                    "latest",
                ],
            ),
            (
                "eth_call",
                [
                    {
                        "to": POLICY_GATE_ADDRESS,
                        "data": "0x" + EXECUTED_ACTION_COUNT_SELECTOR,
                    },
                    "latest",
                ],
            ),
            (
                "eth_call",
                [
                    {
                        "to": DECISION_LOG_ADDRESS,
                        "data": "0x" + DECISION_COUNT_SELECTOR,
                    },
                    "latest",
                ],
            ),
        ]
        try:
            results = self.chain.batch(calls)
        except Exception as error:
            raise ProofLayerToolError("X Layer certificate read failed") from error
        if not isinstance(results, list) or len(results) != len(calls):
            raise ProofLayerToolError("X Layer certificate read returned incomplete data")
        (
            raw_chain_id,
            raw_latest_block,
            raw_exists,
            raw_usable,
            raw_certificate,
            raw_registry,
            raw_decision_log,
            raw_action_count,
            raw_decision_count,
        ) = results
        try:
            chain_id = int(str(raw_chain_id), 16)
            latest_block = int(str(raw_latest_block), 16)
        except ValueError as error:
            raise ProofLayerToolError("X Layer returned malformed network data") from error
        if chain_id != XLAYER_CHAIN_ID:
            raise ProofLayerToolError(
                f"RPC returned chain ID {chain_id}; expected {XLAYER_CHAIN_ID}"
            )
        exists = _bool(str(raw_exists))
        usable = _bool(str(raw_usable))
        if exists:
            stored = _words(str(raw_certificate))
            if len(stored) < 11:
                raise ProofLayerToolError("registry returned an incomplete certificate")
            certificate = {
                "certificate_id": certificate_id,
                "certificate_status": (
                    "REGISTERED_USABLE" if usable else "REGISTERED_UNUSABLE"
                ),
                "exists": True,
                "registered": True,
                "usable": usable,
                "chain_id": XLAYER_CHAIN_ID,
                "asset_id": "0x" + stored[1],
                "claim_type": "0x" + stored[2],
                "policy_id": "0x" + stored[3],
                "evidence_root": "0x" + stored[4],
                "observed_at": int(stored[5], 16),
                "valid_until": int(stored[6], 16),
                "independent_root_count": int(stored[7], 16),
                "result_code": int(stored[8], 16),
                "result": {0: "INDETERMINATE", 1: "PASS", 2: "FAIL"}.get(
                    int(stored[8], 16), "UNKNOWN"
                ),
                "issuer": "0x" + stored[9][-40:],
                "revoked": int(stored[10], 16) != 0,
            }
        else:
            certificate = {
                "certificate_id": certificate_id,
                "certificate_status": "NOT_REGISTERED",
                "exists": False,
                "registered": False,
                "result": None,
                "valid_until": None,
                "revoked": None,
                "issuer": None,
                "usable": False,
                "chain_id": XLAYER_CHAIN_ID,
            }
        registry = _address(str(raw_registry))
        decision_log = _address(str(raw_decision_log))
        self._cache.set("chain-id", chain_id)
        self._cache.set("latest-block", latest_block)
        return {
            "certificate": certificate,
            "latest_block": latest_block,
            "chain_id": chain_id,
            "decision_count": _uint(str(raw_decision_count)),
            "policygate": {
                "registry": registry,
                "decision_log": decision_log,
                "wiring_valid": (
                    registry.lower() == REGISTRY_ADDRESS.lower()
                    and decision_log.lower() == DECISION_LOG_ADDRESS.lower()
                ),
                "executed_action_count": _uint(str(raw_action_count)),
            },
        }

    def get_certificate_context(self, certificate_id: str) -> dict[str, Any]:
        normalized_id = _bytes32(certificate_id)
        return self._cached(
            f"certificate-context:{normalized_id}",
            lambda: self._read_certificate_context(normalized_id),
        )

    def discover_assets(self) -> dict[str, Any]:
        return {
            "assets": [
                {
                    "asset": "USDY",
                    "asset_class": "Tokenized U.S. Treasuries",
                    "supported_claims": ["TreasuryBacking"],
                },
                {
                    "asset": "PAXG",
                    "asset_class": "Tokenized Gold",
                    "supported_claims": ["GoldBacking"],
                },
            ],
            "scope": "Existing deterministic ProofLayer RVC implementations only",
        }

    def get_asset_metadata(self, asset: str) -> dict[str, Any]:
        normalized = _normalize_asset(asset)
        certificate_id = _fixture_certificate_id() if normalized == "USDY" else None
        return {
            "asset": normalized,
            "claim": _expected_claim(normalized),
            "asset_class": (
                "Tokenized U.S. Treasuries"
                if normalized == "USDY"
                else "Tokenized Gold"
            ),
            "evidence_adapter": "Ondo official snapshot" if normalized == "USDY" else "Paxos official snapshot",
            "deterministic_verifier": (
                "verify_treasury_backing"
                if normalized == "USDY"
                else "verify_gold_backing"
            ),
            "known_live_certificate_id": certificate_id,
            "fixture_available": normalized == "USDY",
            "evidence_snapshot_available": True,
            "live_certificate_mapping_available": certificate_id is not None,
            "live_evidence_fetch_enabled": self._ethereum_live_read_enabled,
            "live_evidence_source": self._evidence_source_mode,
            "attestation_available": self._attestation_available,
            "policy": (
                "default-treasury-policy"
                if normalized == "USDY"
                else "default-gold-policy"
            ),
            "known_live_certificate_note": (
                "Existing USDY demo fixture mapped to the deployed X Layer registry; inspect current usability separately."
                if certificate_id
                else "No exported ProofLayer certificate fixture is available for this asset."
            ),
        }

    def get_evidence(self, asset: str, claim: str) -> dict[str, Any]:
        normalized = _normalize_asset(asset)
        resolved_claim = _normalize_claim(normalized, claim)
        evidence = self._load_evidence(normalized)
        fields = {item.field for item in evidence}
        live_active = self._evidence_source_mode != "repository official snapshot"
        if live_active:
            warning = (
                "Snapshot records are cached official evidence; on-chain records were read "
                "live from Ethereum mainnet at the pinned block. Attestation records are "
                "cached official evidence from the attestor's report; verify_claim decides "
                "policy semantics."
            )
        else:
            warning = (
                "Snapshot evidence may be stale or incomplete; verify_claim decides policy "
                "semantics."
            )
        return {
            "asset": normalized,
            "claim": resolved_claim,
            "evidence_count": len(evidence),
            "available_fields": sorted(fields),
            "evidence": [_evidence_record(item) for item in evidence],
            "source_mode": self._evidence_source_mode,
            "live_ethereum_read_enabled": self._ethereum_live_read_enabled,
            "live_ethereum_read_failed": self._ethereum_live_read_failed,
            "attestation_available": self._attestation_available,
            "attestation_read_failed": self._attestation_read_failed,
            "warning": warning,
        }

    def analyze_provenance(self, asset: str, claim: str) -> dict[str, Any]:
        normalized = _normalize_asset(asset)
        resolved_claim = _normalize_claim(normalized, claim)
        result = run_provenance_analysis(self._load_evidence(normalized))
        return {
            "asset": normalized,
            "claim": resolved_claim,
            "independent_root_count": result.independent_root_count,
            "independent_root_ids": result.independent_root_ids,
            "canonical_root_count": result.canonical_root_count,
            "independent_trust_domain_count": result.independent_trust_domain_count,
            "observed_source_count": result.observed_source_count,
            "unknown_root_count": result.unknown_root_count,
            "unknown_root_ids": result.unknown_root_ids,
            "source_count": result.source_count,
            "dependent_source_count": result.dependent_source_count,
            "dependency_groups": result.dependency_groups,
            "duplicated_or_dependent_sources": result.duplicated_or_dependent_sources,
            "trusted_root_ids": result.trusted_root_ids,
            "malformed": result.malformed,
            "validation_errors": result.validation_errors,
        }

    def verify_claim(self, asset: str, claim: str) -> dict[str, Any]:
        normalized = _normalize_asset(asset)
        resolved_claim = _normalize_claim(normalized, claim)
        evidence = self._load_evidence(normalized)
        certificate = (
            verify_treasury_backing(normalized, evidence)
            if normalized == "USDY"
            else verify_gold_backing(normalized, evidence)
        )
        result = _certificate(certificate)
        result["claim"] = resolved_claim
        result["known_live_certificate_id"] = (
            _fixture_certificate_id() if normalized == "USDY" else None
        )
        result["known_live_certificate_note"] = (
            "This ID belongs to an existing exported demo certificate; it is not the ephemeral RVC evaluation above."
            if result["known_live_certificate_id"]
            else "No exported on-chain certificate fixture is available."
        )
        return result

    def get_certificate_state(self, certificate_id: str) -> dict[str, Any]:
        context = self.get_certificate_context(certificate_id)
        certificate = context.get("certificate")
        if not isinstance(certificate, Mapping):
            raise ProofLayerToolError("X Layer certificate read returned invalid data")
        return dict(certificate)

    def get_xlayer_status(self) -> dict[str, Any]:
        """Return the fixed deployment network and latest block without a write."""

        chain_id = self._cached("chain-id", self.chain.assert_chain)
        latest_block = self._cached("latest-block", self.chain.latest_block)
        return {
            "network": XLAYER_NETWORK,
            "chain_id": chain_id,
            "latest_block": latest_block,
            "registry_address": REGISTRY_ADDRESS,
            "decision_log_address": DECISION_LOG_ADDRESS,
            "policygate_address": POLICY_GATE_ADDRESS,
            "read_only": True,
        }

    def get_policygate_state(
        self,
        certificate_id: str,
        asset: str,
        claim: str,
        policy: str,
    ) -> dict[str, Any]:
        normalized_id = _bytes32(certificate_id)
        normalized_asset = _normalize_asset(asset)
        normalized_claim = _normalize_claim(normalized_asset, claim)
        if not isinstance(policy, str) or not policy.strip():
            raise ProofLayerToolError("policy must be a non-empty ProofLayer policy ID")
        normalized_policy = policy.strip()
        context = self.get_certificate_context(normalized_id)
        certificate = context.get("certificate")
        policygate = context.get("policygate")
        if not isinstance(certificate, Mapping) or not isinstance(policygate, Mapping):
            raise ProofLayerToolError("X Layer PolicyGate read returned invalid data")
        registry = str(policygate.get("registry") or "")
        decision_log = str(policygate.get("decision_log") or "")
        wiring_valid = bool(policygate.get("wiring_valid"))
        intended_conditions_match = bool(
            certificate.get("registered")
            and certificate.get("asset_id") == identifier_to_bytes32(normalized_asset)
            and certificate.get("claim_type") == identifier_to_bytes32(normalized_claim)
            and certificate.get("policy_id") == identifier_to_bytes32(normalized_policy)
        )
        allowed = bool(
            certificate["usable"] and wiring_valid and intended_conditions_match
        )
        if not certificate["usable"]:
            reason = "The certificate is absent or currently unusable."
        elif not intended_conditions_match:
            reason = "The certificate does not match the intended asset, claim, and policy conditions."
        elif not wiring_valid:
            reason = "The deployed PolicyGate wiring does not match the configured registry and DecisionLog."
        else:
            reason = "The certificate is usable and matches the intended PolicyGate conditions."
        return {
            "certificate_id": normalized_id,
            "asset": normalized_asset,
            "claim": normalized_claim,
            "policy": normalized_policy,
            "policygate_outcome": "ALLOWED" if allowed else "BLOCKED",
            "read_only_assessment": True,
            "action_executed": False,
            "certificate_usable": certificate["usable"],
            "wiring_valid": wiring_valid,
            "intended_conditions_match": intended_conditions_match,
            "registry": registry,
            "decision_log": decision_log,
            "executed_action_count": int(policygate["executed_action_count"]),
            "reason": reason,
        }

    def get_decision_history(self, certificate_id: str) -> dict[str, Any]:
        normalized_id = _bytes32(certificate_id)
        return self._cached(
            f"decision-history:{normalized_id}",
            lambda: self._read_decision_history(normalized_id),
        )

    def _event_lookup(self, certificate_id: str, *, newest_only: bool):
        context = self.get_certificate_context(certificate_id)
        latest_block = context.get("latest_block")
        if not isinstance(latest_block, int):
            raise ProofLayerToolError("X Layer latest block is unavailable")
        query = BoundedEventQuery(
            self.chain,
            address=DECISION_LOG_ADDRESS,
            event_topic=DECISION_RECORDED_TOPIC,
            deployment_block=DEPLOYMENT_BLOCK,
            max_scan_blocks=self.settings.event_max_scan_blocks,
            chunk_size=self.settings.event_chunk_size,
            batch_size=self.settings.event_batch_size,
            timeout_seconds=self.settings.event_lookup_timeout_seconds,
        )
        try:
            return query.lookup(certificate_id, latest_block, newest_only=newest_only)
        except EventQueryUnavailable as error:
            raise ProofLayerToolError("DecisionLog history is unavailable") from error

    @staticmethod
    def _decision_records(logs: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
        decisions: list[dict[str, Any]] = []
        for item in logs:
            topics = item.get("topics")
            data = item.get("data")
            if not isinstance(topics, list) or len(topics) < 4 or not isinstance(data, str):
                continue
            try:
                data_words = _words(data)
            except ProofLayerToolError:
                continue
            if len(data_words) < 3:
                continue
            try:
                decisions.append(
                    {
                        "decision_id": topics[1],
                        "certificate_id": topics[2],
                        "actor": "0x" + str(topics[3])[-40:],
                        "action_type": "0x" + data_words[0],
                        "allowed": int(data_words[1], 16) != 0,
                        "timestamp": int(data_words[2], 16),
                        "block_number": int(str(item.get("blockNumber", "0x0")), 16),
                        "transaction_hash": item.get("transactionHash"),
                    }
                )
            except (TypeError, ValueError):
                continue
        return decisions

    def _read_decision_history(self, certificate_id: str) -> dict[str, Any]:
        context = self.get_certificate_context(certificate_id)
        lookup = self._event_lookup(certificate_id, newest_only=False)
        decisions = self._decision_records(lookup.logs)
        return {
            "certificate_id": certificate_id,
            "decision_count": int(context["decision_count"]),
            "matching_decisions": decisions,
            "matching_decision_count": len(decisions),
            "query_from_block": lookup.query_from_block,
            "query_to_block": lookup.query_to_block,
            "history_complete_since_deployment": lookup.history_complete_since_deployment,
            "note": "DecisionLog stores successful on-chain decisions only; reverted actions create no record.",
        }

    def get_latest_decision(self, certificate_id: str) -> dict[str, Any] | None:
        normalized_id = _bytes32(certificate_id)
        return self._cached(
            f"latest-decision:{normalized_id}",
            lambda: self._read_latest_decision(normalized_id),
        )

    def _read_latest_decision(self, certificate_id: str) -> dict[str, Any] | None:
        lookup = self._event_lookup(certificate_id, newest_only=True)
        records = self._decision_records(lookup.logs)
        return records[-1] if records else None

    def get_certificate_dashboard(self, certificate_id: str) -> dict[str, Any]:
        """Compose dashboard state in a bounded server-side read path."""

        normalized_id = _bytes32(certificate_id)
        try:
            context = self.get_certificate_context(normalized_id)
            certificate = context.get("certificate")
            policygate = context.get("policygate")
            if not isinstance(certificate, Mapping) or not isinstance(policygate, Mapping):
                raise ProofLayerToolError("X Layer certificate context is unavailable")
            decision_lookup_complete = True
            decision: dict[str, Any] | None = None
            try:
                decision = self.get_latest_decision(normalized_id)
            except ProofLayerToolError:
                decision_lookup_complete = False
            raw_certificate = None
            if certificate.get("registered"):
                raw_certificate = {
                    "certificateId": certificate.get("certificate_id"),
                    "assetId": certificate.get("asset_id"),
                    "claimType": certificate.get("claim_type"),
                    "policyId": certificate.get("policy_id"),
                    "evidenceRoot": certificate.get("evidence_root"),
                    "observedAt": certificate.get("observed_at"),
                    "validUntil": certificate.get("valid_until"),
                    "independentRootCount": certificate.get("independent_root_count"),
                    "result": certificate.get("result_code"),
                    "issuer": certificate.get("issuer"),
                    "revoked": certificate.get("revoked"),
                }
            raw_decision = (
                {
                    "decisionId": decision["decision_id"],
                    "certificateId": decision["certificate_id"],
                    "actor": decision["actor"],
                    "actionType": decision["action_type"],
                    "allowed": decision["allowed"],
                    "timestamp": decision["timestamp"],
                    "transactionHash": decision["transaction_hash"],
                }
                if decision is not None
                else None
            )
            return {
                "connected": True,
                "chainId": context["chain_id"],
                "latestBlock": context["latest_block"],
                "registered": certificate.get("registered"),
                "usable": certificate.get("usable"),
                "certificate": raw_certificate,
                "decision": raw_decision,
                "decisionLookupComplete": decision_lookup_complete,
                "executedActionCount": str(policygate["executed_action_count"]),
                "decisionCount": str(context["decision_count"]),
                "policygateOutcome": (
                    "ALLOWED"
                    if certificate.get("usable") and policygate.get("wiring_valid")
                    else "BLOCKED"
                ),
                "error": None,
            }
        except Exception:
            return {
                "connected": False,
                "chainId": None,
                "latestBlock": None,
                "registered": None,
                "usable": None,
                "certificate": None,
                "decision": None,
                "decisionLookupComplete": False,
                "executedActionCount": None,
                "decisionCount": None,
                "policygateOutcome": "UNAVAILABLE",
                "error": "X Layer state could not be retrieved.",
            }


__all__ = [
    "DEFAULT_XLAYER_RPC_URL",
    "ProofLayerToolError",
    "ProofLayerTools",
    "XLayerReadClient",
]
