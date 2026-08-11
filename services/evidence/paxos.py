import hashlib
import json
import re
from collections.abc import Mapping
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from services.rvc.models import EvidenceRecord

from .evm import EvmAdapterError, EvmJsonRpcClient, RpcCall, read_erc20_evidence
from .models import RawEvidence
from .normalizer import normalize_evidence_batch


PAXOS_PAXG_PRODUCT_URL = "https://docs.paxos.com/guides/stablecoin/paxg.md"
PAXOS_PAXG_MAINNET_URL = (
    "https://docs.paxos.com/guides/stablecoin/paxg/mainnet.md"
)
PAXOS_PAXG_TRANSPARENCY_URL = "https://www.paxos.com/paxg-transparency"
PAXOS_PAXG_PRODUCT_SHA256 = (
    "sha256:0c4995ac1fbcd9affe645c04cd6db05dc09d9a0faa8e330ca1cdf7053371fbd2"
)
PAXOS_PAXG_MAINNET_SHA256 = (
    "sha256:b59954fc3d68ead09386946423848090f091a551db26851577513c0b6d54205a"
)
PAXOS_PAXG_CONTRACT_COMMIT = "1a21e856ebe70360de3817edd5c89baf30a429a4"
PAXOS_PAXG_CONTRACT_README_URL = (
    "https://github.com/paxosglobal/paxos-gold-contract/blob/"
    f"{PAXOS_PAXG_CONTRACT_COMMIT}/README.md"
)
PAXOS_PAXG_DECIMALS_SOURCE_URL = (
    "https://github.com/paxosglobal/paxos-gold-contract/blob/"
    f"{PAXOS_PAXG_CONTRACT_COMMIT}/contracts/PAXG.sol"
)
KPMG_PAXG_JUNE_2026_REPORT_URL = (
    "https://framerusercontent.com/assets/0YxpMVO4j9epePAUD6OKVqePIQ.pdf"
)
KPMG_PAXG_JUNE_2026_REPORT_SHA256 = (
    "sha256:2602f7dd6fe4987377beb8e343a1df68687ade1f28ef3c6fbd1d04f8e57693ed"
)
ETHEREUM_PAXG_ADDRESS = "0x45804880De22913dAFE09f4980848ECE6EcbAf78"
ETHEREUM_MAINNET_CHAIN_ID = 1
PAXG_DECIMALS = 18

DEFAULT_PAXG_SNAPSHOT = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "snapshots"
    / "paxg"
    / "2026-06-30-kpmg.json"
)

_CACHE_STATUS = "cached_official_evidence"
_PRODUCT_SOURCE_ID = "paxos-paxg-product-snapshot"
_ADDRESS_SOURCE_ID = "paxos-paxg-contract-address-snapshot"
_ATTESTATION_SOURCE_ID = "kpmg-paxg-examination-2026-06-30"
_KPMG_REPORT_FACT_HASHES = {
    # Pin transcribed report facts without duplicating current financial values
    # in executable source. The readable values remain in the dated snapshot.
    "observed_at": "sha256:fe57c9a05b1b2d9a06e870adc857d001e4d48a7d0a3b7dfe48a8b9ca1b8b0a7f",
    "issued_on": "sha256:c42c73576593e80f59dab76a0984e041fee70732b4a269572a24abb9a8cf49f0",
    "allocated_gold_oz": "sha256:0ceeabe0212d90b12517cc91ee442c6e953b0888d4f8242f21eeba0104842e09",
    "attested_total_redeemable_supply": "sha256:4609400a4ef39cbedd98113e113e601c19e22ed4b563cfac38df31e2c564a049",
    "attested_ethereum_token_supply": "sha256:0abae3073eed4b144c44c1b38fa5e5685ea01e9f94c8a0fa56125bcde3309013",
    "attested_solana_token_supply": "sha256:7dd772513658510e468debd6fef7966fb1b9b0ea77959a767548d4e40e796272",
    "reported_surplus_deficit_oz": "sha256:cb6bbf00cd2043a1c2c983567939eb2419bcea195346188b727b77fb9bafe52f",
}


class PaxosAdapterError(ValueError):
    """Raised when official PAXG evidence cannot be parsed safely."""


def _required_mapping(name: str, value: Any) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise PaxosAdapterError(f"{name} must be an object")
    return value


def _required_text(name: str, value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PaxosAdapterError(f"{name} is required")
    return value.strip()


def _parse_timestamp(name: str, value: Any) -> datetime:
    if isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, str) and value.strip():
        raw_timestamp = value.strip()
        if raw_timestamp.endswith("Z"):
            raw_timestamp = raw_timestamp[:-1] + "+00:00"
        try:
            timestamp = datetime.fromisoformat(raw_timestamp)
        except ValueError as error:
            raise PaxosAdapterError(
                f"{name} must be an ISO-8601 timestamp"
            ) from error
    else:
        raise PaxosAdapterError(f"{name} is required")

    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _parse_nonnegative_decimal(name: str, value: Any) -> Decimal:
    if isinstance(value, bool):
        raise PaxosAdapterError(f"{name} must be numeric")
    normalized = value.strip().replace(",", "") if isinstance(value, str) else str(value)
    try:
        parsed = Decimal(normalized)
    except (InvalidOperation, ValueError) as error:
        raise PaxosAdapterError(f"{name} must be numeric") from error
    if not parsed.is_finite() or parsed < 0:
        raise PaxosAdapterError(f"{name} must be a finite non-negative number")
    return parsed


def _sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _canonical_decimal(value: Decimal) -> str:
    canonical = format(value, "f")
    if "." in canonical:
        canonical = canonical.rstrip("0").rstrip(".")
    return canonical or "0"


def _validate_pinned_report_fact(name: str, value: str) -> None:
    expected_hash = _KPMG_REPORT_FACT_HASHES[name]
    actual_hash = _sha256(f"{name}={value}".encode("utf-8"))
    if actual_hash != expected_hash:
        raise PaxosAdapterError(
            f"reserve_attestation.{name} does not match the hashed report"
        )


def _snapshot_content_hash(snapshot: Mapping[str, Any]) -> str:
    payload = json.dumps(
        snapshot,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return _sha256(payload)


def _raw_evidence(
    *,
    source_type: str,
    source_id: str,
    root_source_id: str,
    evidence_tier: str,
    field: str,
    value: Any,
    unit: str | None,
    observed_at: datetime,
    retrieved_at: datetime,
    content_hash: str,
    source_url: str,
    extra_metadata: Mapping[str, Any] | None = None,
) -> RawEvidence:
    metadata: dict[str, Any] = {
        "root_source_id": root_source_id,
        "retrieved_at": retrieved_at,
        "content_hash": content_hash,
        "evidence_tier": evidence_tier,
        "source_url": source_url,
        "cache_status": _CACHE_STATUS,
    }
    if extra_metadata is not None:
        metadata.update(extra_metadata)
    return RawEvidence(
        source_type=source_type,
        source_id=source_id,
        asset="PAXG",
        field=field,
        value=value,
        unit=unit,
        observed_at=observed_at,
        metadata=metadata,
    )


def _validate_url(name: str, value: Any, expected: str) -> str:
    url = _required_text(name, value)
    if url != expected:
        raise PaxosAdapterError(f"{name} must identify the expected official source")
    return url


def _parse_product_claims(
    product: Mapping[str, Any],
    *,
    retrieved_at: datetime,
    content_hash: str,
) -> tuple[list[RawEvidence], Decimal | None]:
    source_url = _validate_url(
        "product_claims.source_url",
        product.get("source_url"),
        PAXOS_PAXG_PRODUCT_URL,
    )
    if _required_text(
        "product_claims.source_sha256", product.get("source_sha256")
    ) != PAXOS_PAXG_PRODUCT_SHA256:
        raise PaxosAdapterError(
            "product_claims.source_sha256 does not match the cached official document"
        )
    observed_at = _parse_timestamp(
        "product_claims.observed_at", product.get("observed_at")
    )
    records: list[RawEvidence] = []
    common_metadata = {
        "official_source_kind": "paxos_product_documentation",
        "source_document_sha256": PAXOS_PAXG_PRODUCT_SHA256,
        "snapshot_content_hash": content_hash,
        "taxonomy_note": product.get("relationship_note"),
    }

    if "asset_class" in product:
        asset_class = _required_text(
            "product_claims.asset_class", product["asset_class"]
        )
        if asset_class != "TOKENIZED_GOLD":
            raise PaxosAdapterError(
                "product_claims.asset_class must be TOKENIZED_GOLD"
            )
        records.append(
            _raw_evidence(
                source_type="issuer",
                source_id=_PRODUCT_SOURCE_ID,
                root_source_id="paxos",
                evidence_tier="B",
                field="asset_class",
                value=asset_class,
                unit=None,
                observed_at=observed_at,
                retrieved_at=retrieved_at,
                content_hash=PAXOS_PAXG_PRODUCT_SHA256,
                source_url=source_url,
                extra_metadata={
                    **common_metadata,
                    "derivation": "ProofLayer taxonomy derived from official product description",
                },
            )
        )

    if "reserve_asset" in product:
        reserve_asset = _required_text(
            "product_claims.reserve_asset", product["reserve_asset"]
        )
        if reserve_asset != "LBMA_GOOD_DELIVERY_GOLD":
            raise PaxosAdapterError(
                "product_claims.reserve_asset must be LBMA_GOOD_DELIVERY_GOLD"
            )
        records.append(
            _raw_evidence(
                source_type="issuer",
                source_id=_PRODUCT_SOURCE_ID,
                root_source_id="paxos",
                evidence_tier="B",
                field="reserve_asset",
                value=reserve_asset,
                unit=None,
                observed_at=observed_at,
                retrieved_at=retrieved_at,
                content_hash=PAXOS_PAXG_PRODUCT_SHA256,
                source_url=source_url,
                extra_metadata={
                    **common_metadata,
                    "derivation": "ProofLayer taxonomy derived from official product description",
                },
            )
        )

    relationship: Decimal | None = None
    if "fine_troy_ounces_per_token" in product:
        relationship = _parse_nonnegative_decimal(
            "product_claims.fine_troy_ounces_per_token",
            product["fine_troy_ounces_per_token"],
        )
        if relationship != Decimal(1):
            raise PaxosAdapterError(
                "official PAXG relationship must be one fine troy ounce per token"
            )
        records.append(
            _raw_evidence(
                source_type="issuer",
                source_id=_PRODUCT_SOURCE_ID,
                root_source_id="paxos",
                evidence_tier="B",
                field="fine_troy_ounces_per_token",
                value=relationship,
                unit="fine_troy_ounce/PAXG",
                observed_at=observed_at,
                retrieved_at=retrieved_at,
                content_hash=PAXOS_PAXG_PRODUCT_SHA256,
                source_url=source_url,
                extra_metadata={
                    **common_metadata,
                    "relationship_semantics": "one_token_represents_one_fine_troy_ounce",
                },
            )
        )

    return records, relationship


def _parse_contract_listing(
    contract: Mapping[str, Any],
    *,
    retrieved_at: datetime,
    content_hash: str,
) -> tuple[list[RawEvidence], str]:
    source_url = _validate_url(
        "contract_listing.source_url",
        contract.get("source_url"),
        PAXOS_PAXG_MAINNET_URL,
    )
    if _required_text(
        "contract_listing.source_sha256", contract.get("source_sha256")
    ) != PAXOS_PAXG_MAINNET_SHA256:
        raise PaxosAdapterError(
            "contract_listing.source_sha256 does not match the cached official document"
        )
    _validate_url(
        "contract_listing.corroborating_source_url",
        contract.get("corroborating_source_url"),
        PAXOS_PAXG_CONTRACT_README_URL,
    )
    _validate_url(
        "contract_listing.decimals_source_url",
        contract.get("decimals_source_url"),
        PAXOS_PAXG_DECIMALS_SOURCE_URL,
    )
    if _required_text(
        "contract_listing.source_commit", contract.get("source_commit")
    ) != PAXOS_PAXG_CONTRACT_COMMIT:
        raise PaxosAdapterError("contract_listing.source_commit is not the pinned commit")
    if _required_text(
        "contract_listing.network", contract.get("network")
    ).lower() != "ethereum":
        raise PaxosAdapterError("contract_listing.network must be ethereum")
    if contract.get("chain_id") != ETHEREUM_MAINNET_CHAIN_ID:
        raise PaxosAdapterError("contract_listing.chain_id must be Ethereum mainnet")
    if _required_text(
        "contract_listing.contract_name", contract.get("contract_name")
    ) != "PAXG":
        raise PaxosAdapterError("contract_listing.contract_name must be PAXG")
    if contract.get("decimals") != PAXG_DECIMALS:
        raise PaxosAdapterError("contract_listing.decimals must be 18")

    address = _required_text(
        "contract_listing.contract_address", contract.get("contract_address")
    )
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", address):
        raise PaxosAdapterError("contract_listing.contract_address must be a full address")
    if address.lower() != ETHEREUM_PAXG_ADDRESS.lower():
        raise PaxosAdapterError(
            "cached PAXG contract does not match the official Paxos address"
        )
    observed_at = _parse_timestamp(
        "contract_listing.observed_at", contract.get("observed_at")
    )
    evidence = _raw_evidence(
        source_type="issuer",
        source_id=_ADDRESS_SOURCE_ID,
        root_source_id="paxos",
        evidence_tier="B",
        field="official_contract_address",
        value=address,
        unit=None,
        observed_at=observed_at,
        retrieved_at=retrieved_at,
        content_hash=PAXOS_PAXG_MAINNET_SHA256,
        source_url=source_url,
        extra_metadata={
            "official_source_kind": "paxos_contract_documentation",
            "source_document_sha256": PAXOS_PAXG_MAINNET_SHA256,
            "snapshot_content_hash": content_hash,
            "corroborating_source_url": PAXOS_PAXG_CONTRACT_README_URL,
            "decimals_source_url": PAXOS_PAXG_DECIMALS_SOURCE_URL,
            "source_commit": PAXOS_PAXG_CONTRACT_COMMIT,
            "chain_id": ETHEREUM_MAINNET_CHAIN_ID,
            "decimals": PAXG_DECIMALS,
        },
    )
    return [evidence], address


def _validate_attestation_artifact(attestation: Mapping[str, Any]) -> None:
    _validate_url(
        "reserve_attestation.source_index_url",
        attestation.get("source_index_url"),
        PAXOS_PAXG_TRANSPARENCY_URL,
    )
    artifact_url = _required_text(
        "reserve_attestation.artifact_url", attestation.get("artifact_url")
    )
    if artifact_url != KPMG_PAXG_JUNE_2026_REPORT_URL:
        raise PaxosAdapterError(
            "reserve_attestation.artifact_url must be the known report linked by Paxos"
        )
    artifact_hash = _required_text(
        "reserve_attestation.artifact_sha256",
        attestation.get("artifact_sha256"),
    )
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", artifact_hash):
        raise PaxosAdapterError(
            "reserve_attestation.artifact_sha256 must be a SHA-256 digest"
        )
    if artifact_hash != KPMG_PAXG_JUNE_2026_REPORT_SHA256:
        raise PaxosAdapterError("cached KPMG report digest does not match the artifact")


def _parse_attestation(
    attestation: Mapping[str, Any],
    *,
    retrieved_at: datetime,
    content_hash: str,
    product_relationship: Decimal | None,
) -> list[RawEvidence]:
    _validate_attestation_artifact(attestation)
    observed_at = _parse_timestamp(
        "reserve_attestation.observed_at", attestation.get("observed_at")
    )
    issued_on = _required_text(
        "reserve_attestation.issued_on", attestation.get("issued_on")
    )
    try:
        date.fromisoformat(issued_on)
    except ValueError as error:
        raise PaxosAdapterError(
            "reserve_attestation.issued_on must be an ISO-8601 date"
        ) from error
    _validate_pinned_report_fact("observed_at", observed_at.isoformat())
    _validate_pinned_report_fact("issued_on", issued_on)
    auditor = _required_text("reserve_attestation.auditor", attestation.get("auditor"))
    root_source_id = _required_text(
        "reserve_attestation.auditor_root_source_id",
        attestation.get("auditor_root_source_id"),
    ).lower()
    if auditor != "KPMG LLP" or root_source_id != "kpmg":
        raise PaxosAdapterError(
            "cached report must establish KPMG LLP as the independent auditor"
        )
    artifact_url = _required_text(
        "reserve_attestation.artifact_url", attestation.get("artifact_url")
    )
    artifact_hash = _required_text(
        "reserve_attestation.artifact_sha256",
        attestation.get("artifact_sha256"),
    )
    common_metadata = {
        "source_index_url": PAXOS_PAXG_TRANSPARENCY_URL,
        "artifact_url": artifact_url,
        "artifact_sha256": artifact_hash,
        "artifact_size_bytes": attestation.get("artifact_size_bytes"),
        "snapshot_content_hash": content_hash,
        "auditor": auditor,
        "report_title": attestation.get("report_title"),
        "issued_on": issued_on,
        "issued_on_precision": "day",
        "docusign_envelope_id": attestation.get("docusign_envelope_id"),
        "evidence_role": "independent_auditor_examination",
        "timestamp_semantics": "reserve_report_effective_at",
        "reported_precision": attestation.get("reported_precision"),
        "scope_note": attestation.get("scope_note"),
    }
    raw_evidence: list[RawEvidence] = []

    numeric_fields = (
        ("allocated_gold_oz", "allocated_gold_oz", "fine_troy_ounce"),
        (
            "attested_total_redeemable_supply",
            "attested_total_redeemable_supply",
            "PAXG",
        ),
        (
            "attested_ethereum_token_supply",
            "attested_ethereum_token_supply",
            "PAXG",
        ),
        (
            "attested_solana_token_supply",
            "attested_solana_token_supply",
            "PAXG",
        ),
        ("reported_surplus_deficit_oz", "reported_surplus_deficit_oz", "fine_troy_ounce"),
    )
    parsed_values: dict[str, Decimal] = {}
    for snapshot_field, canonical_field, unit in numeric_fields:
        if snapshot_field not in attestation:
            continue
        parsed_value = _parse_nonnegative_decimal(
            f"reserve_attestation.{snapshot_field}", attestation[snapshot_field]
        )
        _validate_pinned_report_fact(
            snapshot_field, _canonical_decimal(parsed_value)
        )
        parsed_values[snapshot_field] = parsed_value
        field_metadata = dict(common_metadata)
        if snapshot_field == "attested_total_redeemable_supply":
            field_metadata["chain_scope"] = "global_ethereum_and_solana"
        elif snapshot_field == "attested_ethereum_token_supply":
            field_metadata["chain_scope"] = "ethereum"
        elif snapshot_field == "attested_solana_token_supply":
            field_metadata["chain_scope"] = "solana"
        raw_evidence.append(
            _raw_evidence(
                source_type="attestation",
                source_id=_ATTESTATION_SOURCE_ID,
                root_source_id=root_source_id,
                evidence_tier="A",
                field=canonical_field,
                value=parsed_value,
                unit=unit,
                observed_at=observed_at,
                retrieved_at=retrieved_at,
                content_hash=artifact_hash,
                source_url=artifact_url,
                extra_metadata=field_metadata,
            )
        )

    allocated = parsed_values.get("allocated_gold_oz")
    total_supply = parsed_values.get("attested_total_redeemable_supply")
    if total_supply is not None:
        raw_evidence.append(
            _raw_evidence(
                source_type="attestation",
                source_id=_ATTESTATION_SOURCE_ID,
                root_source_id=root_source_id,
                evidence_tier="A",
                field="circulating_token_supply",
                value=total_supply,
                unit="PAXG",
                observed_at=observed_at,
                retrieved_at=retrieved_at,
                content_hash=artifact_hash,
                source_url=artifact_url,
                extra_metadata={
                    **common_metadata,
                    "chain_scope": "global_ethereum_and_solana",
                    "supply_semantics": "auditor_attested_redeemable_tokens",
                    "source_field": "attested_total_redeemable_supply",
                },
            )
        )
    if (
        allocated is not None
        and total_supply is not None
        and total_supply > 0
        and product_relationship == Decimal(1)
    ):
        raw_evidence.append(
            _raw_evidence(
                source_type="attestation",
                source_id=_ATTESTATION_SOURCE_ID,
                root_source_id=root_source_id,
                evidence_tier="A",
                field="backing_ratio",
                value=allocated / total_supply,
                unit=None,
                observed_at=observed_at,
                retrieved_at=retrieved_at,
                content_hash=artifact_hash,
                source_url=artifact_url,
                extra_metadata={
                    **common_metadata,
                    "derivation": "allocated_gold_oz / attested_total_redeemable_supply",
                    "derivation_inputs": [
                        "allocated_gold_oz",
                        "attested_total_redeemable_supply",
                    ],
                    "relationship_source_id": _PRODUCT_SOURCE_ID,
                    "relationship_value": str(product_relationship),
                    "dependency_parent_ids": [_PRODUCT_SOURCE_ID],
                },
            )
        )

    raw_evidence.append(
        _raw_evidence(
            source_type="attestation",
            source_id=_ATTESTATION_SOURCE_ID,
            root_source_id=root_source_id,
            evidence_tier="A",
            field="reserve_attestation_timestamp",
            value=observed_at,
            unit=None,
            observed_at=observed_at,
            retrieved_at=retrieved_at,
            content_hash=artifact_hash,
            source_url=artifact_url,
            extra_metadata=common_metadata,
        )
    )
    return raw_evidence


def parse_paxg_official_snapshot(
    snapshot: Mapping[str, Any],
    *,
    content_hash: str | None = None,
) -> list[EvidenceRecord]:
    snapshot = _required_mapping("snapshot", snapshot)
    if snapshot.get("schema_version") != 1:
        raise PaxosAdapterError("unsupported PAXG snapshot schema_version")
    if snapshot.get("asset") != "PAXG":
        raise PaxosAdapterError("snapshot.asset must be PAXG")
    if snapshot.get("cache_status") != _CACHE_STATUS:
        raise PaxosAdapterError("snapshot must be marked cached_official_evidence")
    retrieved_at = _parse_timestamp("snapshot.retrieved_at", snapshot.get("retrieved_at"))
    resolved_content_hash = content_hash or _snapshot_content_hash(snapshot)
    raw_evidence: list[RawEvidence] = []
    product_relationship: Decimal | None = None

    if "product_claims" in snapshot:
        product_records, product_relationship = _parse_product_claims(
            _required_mapping("snapshot.product_claims", snapshot["product_claims"]),
            retrieved_at=retrieved_at,
            content_hash=resolved_content_hash,
        )
        raw_evidence.extend(product_records)
    if "contract_listing" in snapshot:
        contract_records, _ = _parse_contract_listing(
            _required_mapping("snapshot.contract_listing", snapshot["contract_listing"]),
            retrieved_at=retrieved_at,
            content_hash=resolved_content_hash,
        )
        raw_evidence.extend(contract_records)
    if "reserve_attestation" in snapshot:
        raw_evidence.extend(
            _parse_attestation(
                _required_mapping(
                    "snapshot.reserve_attestation", snapshot["reserve_attestation"]
                ),
                retrieved_at=retrieved_at,
                content_hash=resolved_content_hash,
                product_relationship=product_relationship,
            )
        )
    return normalize_evidence_batch(raw_evidence)


def _load_paxg_snapshot_document(
    snapshot_path: str | Path,
) -> tuple[Mapping[str, Any], str]:
    path = Path(snapshot_path)
    try:
        payload = path.read_bytes()
        snapshot = json.loads(payload.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PaxosAdapterError(f"unable to load PAXG snapshot: {path}") from error
    return _required_mapping("snapshot", snapshot), _sha256(payload)


def load_paxg_official_snapshot(
    snapshot_path: str | Path = DEFAULT_PAXG_SNAPSHOT,
) -> list[EvidenceRecord]:
    snapshot, content_hash = _load_paxg_snapshot_document(snapshot_path)
    return parse_paxg_official_snapshot(snapshot, content_hash=content_hash)


def read_paxg_onchain_evidence(
    rpc_call: RpcCall | None = None,
    *,
    rpc_url: str | None = None,
    rpc_source: str | None = None,
    block_number: int | str | None = None,
    retrieved_at: datetime | str | None = None,
    token_address: str = ETHEREUM_PAXG_ADDRESS,
    official_source_id: str | None = _ADDRESS_SOURCE_ID,
    official_content_hash: str | None = PAXOS_PAXG_MAINNET_SHA256,
) -> list[EvidenceRecord]:
    """Read Ethereum PAXG state without treating it as global PAXG supply."""
    if rpc_call is None and rpc_url is None:
        raise PaxosAdapterError("rpc_url or rpc_call is required")
    endpoint = rpc_url or "injected://ethereum-mainnet"
    resolved_rpc_source = rpc_source
    if resolved_rpc_source is None and rpc_url is None:
        resolved_rpc_source = "injected-ethereum-rpc"
    try:
        client = EvmJsonRpcClient(
            endpoint,
            rpc_call=rpc_call,
            rpc_source=resolved_rpc_source,
        )
        evidence = read_erc20_evidence(
            endpoint,
            token_address,
            PAXG_DECIMALS,
            asset="PAXG",
            root_source_id="ethereum",
            expected_chain_id=ETHEREUM_MAINNET_CHAIN_ID,
            official_address=ETHEREUM_PAXG_ADDRESS,
            official_source_id=official_source_id,
            official_content_hash=official_content_hash,
            official_root_source_id="paxos",
            block_number=block_number,
            retrieved_at=retrieved_at,
            client=client,
        )
    except EvmAdapterError as error:
        raise PaxosAdapterError(f"unable to read PAXG Ethereum evidence: {error}") from error

    address_matches = token_address.lower() == ETHEREUM_PAXG_ADDRESS.lower()
    normalized: list[EvidenceRecord] = []
    for item in evidence:
        if item.field == "onchain_supply":
            if not address_matches:
                continue
            item.metadata.update(
                {
                    "chain_scope": "ethereum",
                    "supply_semantics": "ethereum_erc20_total_supply",
                    "global_supply": False,
                    "multichain_warning": (
                        "PAXG also exists on Solana; this direct read is not global supply"
                    ),
                }
            )
        elif item.field == "issuer_contract_verified":
            item.metadata.update(
                {
                    "official_address_source_url": PAXOS_PAXG_MAINNET_URL,
                    "official_address_corroborating_url": (
                        PAXOS_PAXG_CONTRACT_README_URL
                    ),
                    "official_address_source_commit": PAXOS_PAXG_CONTRACT_COMMIT,
                }
            )
        normalized.append(item)
    return normalized


def read_paxg_onchain_supply(
    rpc_call: RpcCall | None = None,
    *,
    rpc_url: str | None = None,
    rpc_source: str | None = None,
    block_number: int | str | None = None,
    retrieved_at: datetime | str | None = None,
) -> EvidenceRecord:
    evidence = read_paxg_onchain_evidence(
        rpc_call,
        rpc_url=rpc_url,
        rpc_source=rpc_source,
        block_number=block_number,
        retrieved_at=retrieved_at,
    )
    supply = next(
        (item for item in evidence if item.field == "onchain_supply"),
        None,
    )
    if supply is None:
        raise PaxosAdapterError(
            "PAXG onchain_supply is unavailable without canonical deployed code"
        )
    return supply


def get_paxg_evidence(
    snapshot_path: str | Path = DEFAULT_PAXG_SNAPSHOT,
    *,
    rpc_call: RpcCall | None = None,
    rpc_url: str | None = None,
    rpc_source: str | None = None,
    rpc_block_number: int | str | None = None,
    rpc_retrieved_at: datetime | str | None = None,
) -> list[EvidenceRecord]:
    snapshot, content_hash = _load_paxg_snapshot_document(snapshot_path)
    evidence = parse_paxg_official_snapshot(snapshot, content_hash=content_hash)
    if rpc_call is None and rpc_url is None:
        return evidence

    address_record = next(
        (item for item in evidence if item.field == "official_contract_address"),
        None,
    )
    if address_record is None:
        raise PaxosAdapterError(
            "official PAXG contract address is required before an RPC read"
        )
    onchain_evidence = read_paxg_onchain_evidence(
        rpc_call,
        rpc_url=rpc_url,
        rpc_source=rpc_source,
        block_number=rpc_block_number,
        retrieved_at=rpc_retrieved_at,
        token_address=address_record.value,
        official_source_id=address_record.source_id,
        official_content_hash=address_record.content_hash,
    )
    return [*evidence, *onchain_evidence]


__all__ = [
    "DEFAULT_PAXG_SNAPSHOT",
    "ETHEREUM_MAINNET_CHAIN_ID",
    "ETHEREUM_PAXG_ADDRESS",
    "KPMG_PAXG_JUNE_2026_REPORT_SHA256",
    "KPMG_PAXG_JUNE_2026_REPORT_URL",
    "PAXG_DECIMALS",
    "PAXOS_PAXG_CONTRACT_COMMIT",
    "PAXOS_PAXG_CONTRACT_README_URL",
    "PAXOS_PAXG_DECIMALS_SOURCE_URL",
    "PAXOS_PAXG_MAINNET_URL",
    "PAXOS_PAXG_MAINNET_SHA256",
    "PAXOS_PAXG_PRODUCT_URL",
    "PAXOS_PAXG_PRODUCT_SHA256",
    "PAXOS_PAXG_TRANSPARENCY_URL",
    "PaxosAdapterError",
    "get_paxg_evidence",
    "load_paxg_official_snapshot",
    "parse_paxg_official_snapshot",
    "read_paxg_onchain_evidence",
    "read_paxg_onchain_supply",
]
