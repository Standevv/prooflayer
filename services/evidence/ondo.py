import hashlib
import json
import re
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from services.rvc.models import EvidenceRecord

from .evm import EvmAdapterError, EvmJsonRpcClient, RpcCall, read_erc20_evidence
from .models import RawEvidence
from .normalizer import normalize_evidence_batch


ONDO_USDY_PRODUCT_URL = "https://ondo.finance/usdy"
ONDO_USDY_BASICS_URL = (
    "https://docs.ondo.finance/general-access-products/usdy/basics"
)
ONDO_ADDRESSES_URL = "https://docs.ondo.finance/addresses.md"
ETHEREUM_USDY_ADDRESS = "0x96F6eF951840721AdBF46Ac996b59E0235CB985C"
ETHEREUM_MAINNET_CHAIN_ID = 1
USDY_DECIMALS = 18

DEFAULT_USDY_SNAPSHOT = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "snapshots"
    / "usdy"
    / "2026-08-08T121726Z.json"
)

_CACHE_STATUS = "cached_official_evidence"
_PRODUCT_SNAPSHOT_SOURCE_ID = "ondo-usdy-product-snapshot"
_ADDRESS_SNAPSHOT_SOURCE_ID = "ondo-contract-addresses-snapshot"
_LIVE_ADDRESS_SOURCE_ID = "ondo-contract-addresses"
_PROVIDED_ADDRESS_SOURCE_ID = "ondo-contract-addresses-provided"

HttpGet = Callable[[str], str]


class OndoAdapterError(ValueError):
    """Raised when official USDY evidence cannot be parsed safely."""


def _required_mapping(name: str, value: Any) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise OndoAdapterError(f"{name} must be an object")
    return value


def _required_text(name: str, value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise OndoAdapterError(f"{name} is required")
    return value.strip()


def _parse_timestamp(name: str, value: Any, *, naive_utc: bool) -> datetime:
    if isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, str) and value.strip():
        raw_timestamp = value.strip()
        if raw_timestamp.endswith("Z"):
            raw_timestamp = raw_timestamp[:-1] + "+00:00"
        try:
            timestamp = datetime.fromisoformat(raw_timestamp)
        except ValueError as error:
            raise OndoAdapterError(f"{name} must be an ISO-8601 timestamp") from error
    else:
        raise OndoAdapterError(f"{name} is required")

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    else:
        timestamp = timestamp.astimezone(timezone.utc)

    return timestamp.replace(tzinfo=None) if naive_utc else timestamp


def _parse_nonnegative_decimal(name: str, value: Any) -> Decimal:
    if isinstance(value, bool):
        raise OndoAdapterError(f"{name} must be numeric")

    if isinstance(value, str):
        normalized = value.strip().replace(",", "").replace("$", "")
        if normalized.endswith("%"):
            normalized = normalized[:-1].strip()
    else:
        normalized = str(value)

    try:
        parsed = Decimal(normalized)
    except (InvalidOperation, ValueError) as error:
        raise OndoAdapterError(f"{name} must be numeric") from error

    if not parsed.is_finite() or parsed < 0:
        raise OndoAdapterError(f"{name} must be a finite non-negative number")
    return parsed


def _sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _snapshot_content_hash(snapshot: Mapping[str, Any]) -> str:
    payload = json.dumps(
        snapshot,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return _sha256(payload)


def _issuer_raw_evidence(
    *,
    source_id: str,
    field: str,
    value: Any,
    unit: str | None,
    observed_at: datetime,
    retrieved_at: datetime,
    content_hash: str,
    extra_metadata: Mapping[str, Any] | None = None,
) -> RawEvidence:
    metadata = {
        "root_source_id": "ondo",
        "retrieved_at": retrieved_at,
        "content_hash": content_hash,
        "evidence_tier": "B",
        "source_url": ONDO_USDY_PRODUCT_URL,
        "cache_status": _CACHE_STATUS,
    }
    if extra_metadata is not None:
        metadata.update(extra_metadata)
    return RawEvidence(
        source_type="issuer",
        source_id=source_id,
        asset="USDY",
        field=field,
        value=value,
        unit=unit,
        observed_at=observed_at,
        metadata=metadata,
    )


def _parse_portfolio_snapshot(
    portfolio: Mapping[str, Any],
    *,
    retrieved_at: datetime,
    content_hash: str,
) -> list[RawEvidence]:
    source_url = _required_text("portfolio.source_url", portfolio.get("source_url"))
    if source_url != ONDO_USDY_PRODUCT_URL:
        raise OndoAdapterError("portfolio.source_url must be the official USDY page")

    observed_at = _parse_timestamp(
        "portfolio.observed_at", portfolio.get("observed_at"), naive_utc=True
    )
    raw_evidence: list[RawEvidence] = []

    if "asset_class" in portfolio:
        derivation_url = _required_text(
            "portfolio.asset_class_source_url",
            portfolio.get("asset_class_source_url"),
        )
        if derivation_url != ONDO_USDY_BASICS_URL:
            raise OndoAdapterError(
                "asset_class must be derived from the official USDY documentation"
            )
        asset_class = _required_text("portfolio.asset_class", portfolio["asset_class"])
        raw_evidence.append(
            _issuer_raw_evidence(
                source_id=_PRODUCT_SNAPSHOT_SOURCE_ID,
                field="asset_class",
                value=asset_class,
                unit=None,
                observed_at=observed_at,
                retrieved_at=retrieved_at,
                content_hash=content_hash,
                extra_metadata={"derivation_source_url": derivation_url},
            )
        )

    numeric_fields = (
        ("underlying_asset_value", "underlying_asset_value", "USD"),
        ("outstanding_token_value", "outstanding_token_value", "USD"),
    )
    parsed_financials: dict[str, Decimal] = {}
    for snapshot_field, canonical_field, unit in numeric_fields:
        if snapshot_field not in portfolio:
            continue
        parsed_value = _parse_nonnegative_decimal(
            f"portfolio.{snapshot_field}", portfolio[snapshot_field]
        )
        parsed_financials[snapshot_field] = parsed_value
        raw_evidence.append(
            _issuer_raw_evidence(
                source_id=_PRODUCT_SNAPSHOT_SOURCE_ID,
                field=canonical_field,
                value=parsed_value,
                unit=unit,
                observed_at=observed_at,
                retrieved_at=retrieved_at,
                content_hash=content_hash,
            )
        )

    if "collateralization_ratio_percent" in portfolio:
        published_percent = _parse_nonnegative_decimal(
            "portfolio.collateralization_ratio_percent",
            portfolio["collateralization_ratio_percent"],
        )
        raw_evidence.append(
            _issuer_raw_evidence(
                source_id=_PRODUCT_SNAPSHOT_SOURCE_ID,
                field="collateralization_ratio",
                value=published_percent / Decimal(100),
                unit=None,
                observed_at=observed_at,
                retrieved_at=retrieved_at,
                content_hash=content_hash,
            )
        )

    positions = portfolio.get("positions")
    if positions is not None:
        if not isinstance(positions, list):
            raise OndoAdapterError("portfolio.positions must be a list")
        parsed_positions = [
            _required_mapping("portfolio.positions item", position)
            for position in positions
        ]
        treasury_positions = [
            position
            for position in parsed_positions
            if position.get("name") == "US Treasuries"
        ]
        if len(treasury_positions) > 1:
            raise OndoAdapterError("portfolio contains duplicate US Treasuries positions")
        underlying_value = parsed_financials.get("underlying_asset_value")
        if treasury_positions and underlying_value is not None:
            if underlying_value == 0:
                raise OndoAdapterError(
                    "underlying_asset_value must be positive to derive treasury_exposure"
                )
            treasury_value = _parse_nonnegative_decimal(
                "portfolio.positions.US Treasuries.value",
                treasury_positions[0].get("value"),
            )
            if treasury_value > underlying_value:
                raise OndoAdapterError(
                    "US Treasuries position cannot exceed underlying assets"
                )
            raw_evidence.append(
                _issuer_raw_evidence(
                    source_id=_PRODUCT_SNAPSHOT_SOURCE_ID,
                    field="treasury_exposure",
                    value=treasury_value / underlying_value,
                    unit=None,
                    observed_at=observed_at,
                    retrieved_at=retrieved_at,
                    content_hash=content_hash,
                )
            )

    raw_evidence.append(
        _issuer_raw_evidence(
            source_id=_PRODUCT_SNAPSHOT_SOURCE_ID,
            field="portfolio_observation_timestamp",
            value=observed_at,
            unit=None,
            observed_at=observed_at,
            retrieved_at=retrieved_at,
            content_hash=content_hash,
            extra_metadata={
                "timestamp_semantics": "issuer_portfolio_observation",
                "independent_attestation": False,
            },
        )
    )
    return raw_evidence


def _parse_cached_contract_listing(
    contract_listing: Mapping[str, Any],
) -> str:
    source_url = _required_text(
        "contract_listing.source_url", contract_listing.get("source_url")
    )
    if source_url != ONDO_ADDRESSES_URL:
        raise OndoAdapterError(
            "contract_listing.source_url must be the official address listing"
        )
    network = _required_text(
        "contract_listing.network", contract_listing.get("network")
    ).lower()
    if network != "ethereum":
        raise OndoAdapterError("contract_listing.network must be ethereum")
    if _required_text(
        "contract_listing.contract_name", contract_listing.get("contract_name")
    ) != "USDY":
        raise OndoAdapterError("contract_listing.contract_name must be USDY")

    address = _required_text(
        "contract_listing.contract_address",
        contract_listing.get("contract_address"),
    )
    if address.lower() != ETHEREUM_USDY_ADDRESS.lower():
        raise OndoAdapterError("cached USDY contract does not match the official address")

    _parse_timestamp(
        "contract_listing.observed_at",
        contract_listing.get("observed_at"),
        naive_utc=True,
    )
    return address


def parse_usdy_official_snapshot(
    snapshot: Mapping[str, Any],
    *,
    content_hash: str | None = None,
) -> list[EvidenceRecord]:
    snapshot = _required_mapping("snapshot", snapshot)
    if snapshot.get("schema_version") != 1:
        raise OndoAdapterError("unsupported USDY snapshot schema_version")
    if snapshot.get("asset") != "USDY":
        raise OndoAdapterError("snapshot.asset must be USDY")
    if snapshot.get("cache_status") != _CACHE_STATUS:
        raise OndoAdapterError("snapshot must be marked cached_official_evidence")

    retrieved_at = _parse_timestamp(
        "snapshot.retrieved_at", snapshot.get("retrieved_at"), naive_utc=False
    )
    resolved_content_hash = content_hash or _snapshot_content_hash(snapshot)
    raw_evidence: list[RawEvidence] = []

    if "portfolio" in snapshot:
        raw_evidence.extend(
            _parse_portfolio_snapshot(
                _required_mapping("snapshot.portfolio", snapshot["portfolio"]),
                retrieved_at=retrieved_at,
                content_hash=resolved_content_hash,
            )
        )

    if "contract_listing" in snapshot:
        contract_listing = _required_mapping(
            "snapshot.contract_listing", snapshot["contract_listing"]
        )
        address = _parse_cached_contract_listing(contract_listing)
        address_observed_at = _parse_timestamp(
            "contract_listing.observed_at",
            contract_listing.get("observed_at"),
            naive_utc=True,
        )
        raw_evidence.append(
            _issuer_raw_evidence(
                source_id=_ADDRESS_SNAPSHOT_SOURCE_ID,
                field="official_contract_address",
                value=address,
                unit=None,
                observed_at=address_observed_at,
                retrieved_at=retrieved_at,
                content_hash=resolved_content_hash,
                extra_metadata={
                    "source_url": ONDO_ADDRESSES_URL,
                    "cache_status": _CACHE_STATUS,
                },
            )
        )

    return normalize_evidence_batch(raw_evidence)


def _load_usdy_snapshot_document(
    snapshot_path: str | Path,
) -> tuple[Mapping[str, Any], str]:
    path = Path(snapshot_path)
    try:
        payload = path.read_bytes()
        snapshot = json.loads(payload.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OndoAdapterError(f"unable to load USDY snapshot: {path}") from error

    return _required_mapping("snapshot", snapshot), _sha256(payload)


def load_usdy_official_snapshot(
    snapshot_path: str | Path = DEFAULT_USDY_SNAPSHOT,
) -> list[EvidenceRecord]:
    snapshot, content_hash = _load_usdy_snapshot_document(snapshot_path)

    return parse_usdy_official_snapshot(snapshot, content_hash=content_hash)


def parse_official_usdy_ethereum_address(addresses_markdown: str) -> str:
    document = _required_text("addresses_markdown", addresses_markdown)
    usdy_section = document.find("## USDY")
    if usdy_section < 0:
        raise OndoAdapterError("official address document has no USDY section")
    ethereum_section = document.find("### Ethereum", usdy_section)
    if ethereum_section < 0:
        raise OndoAdapterError("official USDY section has no Ethereum subsection")

    next_subsection = document.find("\n### ", ethereum_section + len("### Ethereum"))
    section_end = next_subsection if next_subsection >= 0 else len(document)
    ethereum_usdy_section = document[ethereum_section:section_end]
    match = re.search(
        r"(?m)^\|\s*USDY\s*\|\s*(?:\[\s*)?`?(0x[a-fA-F0-9]{40})(?![0-9a-fA-F])",
        ethereum_usdy_section,
    )
    if not match:
        raise OndoAdapterError("official USDY Ethereum address is missing or malformed")

    address = match.group(1)
    if address.lower() != ETHEREUM_USDY_ADDRESS.lower():
        raise OndoAdapterError("official USDY Ethereum address changed unexpectedly")
    return address


def _stdlib_http_get(url: str) -> str:
    request = Request(
        url,
        headers={"Accept": "text/markdown", "User-Agent": "ProofLayer/0.1"},
    )
    with urlopen(request, timeout=15) as response:
        return response.read().decode("utf-8")


def get_live_usdy_contract_address(
    *,
    http_get: HttpGet | None = None,
) -> str:
    fetch = http_get or _stdlib_http_get
    try:
        addresses_markdown = fetch(ONDO_ADDRESSES_URL)
    except Exception as error:
        raise OndoAdapterError("unable to retrieve official Ondo addresses") from error
    return parse_official_usdy_ethereum_address(addresses_markdown)


def get_live_usdy_contract_evidence(
    *,
    http_get: HttpGet | None = None,
    rpc_call: RpcCall | None = None,
    rpc_url: str | None = None,
    rpc_source: str | None = None,
    block_number: int | str | None = None,
    retrieved_at: datetime | str | None = None,
) -> EvidenceRecord:
    """Verify the live official address against deployed Ethereum bytecode."""
    if rpc_call is None and rpc_url is None:
        raise OndoAdapterError(
            "an Ethereum RPC deployed-code check is required for contract verification"
        )

    fetch = http_get or _stdlib_http_get
    try:
        addresses_markdown = fetch(ONDO_ADDRESSES_URL)
    except Exception as error:
        raise OndoAdapterError("unable to retrieve official Ondo addresses") from error
    official_address = parse_official_usdy_ethereum_address(addresses_markdown)
    retrieval_time = _parse_timestamp(
        "retrieved_at",
        datetime.now(timezone.utc) if retrieved_at is None else retrieved_at,
        naive_utc=False,
    )
    evidence = read_usdy_onchain_evidence(
        rpc_call,
        rpc_url=rpc_url,
        rpc_source=rpc_source,
        block_number=block_number,
        retrieved_at=retrieval_time,
        official_address=official_address,
        official_source_id=_LIVE_ADDRESS_SOURCE_ID,
        official_content_hash=_sha256(addresses_markdown.encode("utf-8")),
    )
    verification = next(
        item for item in evidence if item.field == "issuer_contract_verified"
    )
    verification.metadata.update(
        {
            "official_address_source_url": ONDO_ADDRESSES_URL,
            "official_address_source_id": _LIVE_ADDRESS_SOURCE_ID,
            "official_address_retrieved_at": retrieval_time,
            "official_address_content_hash": _sha256(
                addresses_markdown.encode("utf-8")
            ),
            "official_address_cache_status": "live_official_evidence",
        }
    )
    return verification


def read_usdy_onchain_evidence(
    rpc_call: RpcCall | None = None,
    *,
    rpc_url: str | None = None,
    rpc_source: str | None = None,
    block_number: int | str | None = None,
    retrieved_at: datetime | str | None = None,
    official_address: str | None = ETHEREUM_USDY_ADDRESS,
    official_source_id: str | None = _ADDRESS_SNAPSHOT_SOURCE_ID,
    official_content_hash: str | None = None,
) -> list[EvidenceRecord]:
    if rpc_call is None and rpc_url is None:
        raise OndoAdapterError("rpc_url or rpc_call is required")

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
        return read_erc20_evidence(
            endpoint,
            ETHEREUM_USDY_ADDRESS,
            USDY_DECIMALS,
            asset="USDY",
            root_source_id="ethereum",
            expected_chain_id=ETHEREUM_MAINNET_CHAIN_ID,
            official_address=official_address,
            official_source_id=official_source_id,
            official_content_hash=official_content_hash,
            official_root_source_id="ondo",
            block_number=block_number,
            retrieved_at=retrieved_at,
            client=client,
        )
    except EvmAdapterError as error:
        raise OndoAdapterError(f"unable to read USDY Ethereum evidence: {error}") from error


def read_usdy_onchain_supply(
    rpc_call: RpcCall | None = None,
    *,
    rpc_url: str | None = None,
    rpc_source: str | None = None,
    block_number: int | str | None = None,
    retrieved_at: datetime | str | None = None,
) -> EvidenceRecord:
    evidence = read_usdy_onchain_evidence(
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
        raise OndoAdapterError("USDY onchain_supply is unavailable without deployed code")
    return supply


def create_json_rpc_caller(
    rpc_url: str,
    *,
    opener: Callable[..., Any] | None = None,
    timeout: float = 15,
) -> RpcCall:
    return EvmJsonRpcClient(
        rpc_url,
        opener=opener,
        timeout=timeout,
    ).call


def get_usdy_evidence(
    snapshot_path: str | Path = DEFAULT_USDY_SNAPSHOT,
    *,
    addresses_markdown: str | None = None,
    addresses_retrieved_at: datetime | str | None = None,
    rpc_call: RpcCall | None = None,
    rpc_url: str | None = None,
    rpc_source: str | None = None,
    rpc_block_number: int | str | None = None,
    rpc_retrieved_at: datetime | str | None = None,
) -> list[EvidenceRecord]:
    if addresses_retrieved_at is not None and addresses_markdown is None:
        raise OndoAdapterError("addresses_retrieved_at requires addresses_markdown")

    snapshot, content_hash = _load_usdy_snapshot_document(snapshot_path)
    evidence = parse_usdy_official_snapshot(snapshot, content_hash=content_hash)

    official_address: str | None = None
    official_source_id: str | None = None
    official_address_metadata: dict[str, Any] = {}

    if addresses_markdown is not None:
        official_address = parse_official_usdy_ethereum_address(addresses_markdown)
        official_source_id = _PROVIDED_ADDRESS_SOURCE_ID
        address_retrieval_time = _parse_timestamp(
            "addresses_retrieved_at",
            datetime.now(timezone.utc)
            if addresses_retrieved_at is None
            else addresses_retrieved_at,
            naive_utc=False,
        )
        official_address_metadata = {
            "official_address_source_url": ONDO_ADDRESSES_URL,
            "official_address_source_id": official_source_id,
            "official_address_retrieved_at": address_retrieval_time,
            "official_address_content_hash": _sha256(
                addresses_markdown.encode("utf-8")
            ),
            "official_address_cache_status": "provided_official_evidence",
        }
        evidence = [
            item for item in evidence if item.field != "official_contract_address"
        ]
        evidence.extend(
            normalize_evidence_batch(
                [
                    _issuer_raw_evidence(
                        source_id=official_source_id,
                        field="official_contract_address",
                        value=official_address,
                        unit=None,
                        observed_at=address_retrieval_time,
                        retrieved_at=address_retrieval_time,
                        content_hash=official_address_metadata[
                            "official_address_content_hash"
                        ],
                        extra_metadata={
                            "source_url": ONDO_ADDRESSES_URL,
                            "cache_status": "provided_official_evidence",
                            "timestamp_semantics": "adapter_received_at",
                        },
                    )
                ]
            )
        )
    elif "contract_listing" in snapshot:
        contract_listing = _required_mapping(
            "snapshot.contract_listing", snapshot["contract_listing"]
        )
        official_address = _parse_cached_contract_listing(contract_listing)
        official_source_id = _ADDRESS_SNAPSHOT_SOURCE_ID
        official_address_metadata = {
            "official_address_source_url": ONDO_ADDRESSES_URL,
            "official_address_source_id": official_source_id,
            "official_address_observed_at": _parse_timestamp(
                "contract_listing.observed_at",
                contract_listing.get("observed_at"),
                naive_utc=False,
            ),
            "official_address_content_hash": content_hash,
            "official_address_cache_status": _CACHE_STATUS,
        }
    if rpc_call is not None or rpc_url is not None:
        onchain_evidence = read_usdy_onchain_evidence(
            rpc_call,
            rpc_url=rpc_url,
            rpc_source=rpc_source,
            block_number=rpc_block_number,
            retrieved_at=rpc_retrieved_at,
            official_address=official_address,
            official_source_id=official_source_id,
            official_content_hash=official_address_metadata.get(
                "official_address_content_hash"
            ),
        )
        if official_address is not None:
            verification = next(
                item
                for item in onchain_evidence
                if item.field == "issuer_contract_verified"
            )
            verification.metadata.update(official_address_metadata)
        evidence.extend(onchain_evidence)

    return evidence


__all__ = [
    "DEFAULT_USDY_SNAPSHOT",
    "ETHEREUM_USDY_ADDRESS",
    "ONDO_ADDRESSES_URL",
    "ONDO_USDY_BASICS_URL",
    "ONDO_USDY_PRODUCT_URL",
    "OndoAdapterError",
    "create_json_rpc_caller",
    "get_live_usdy_contract_address",
    "get_live_usdy_contract_evidence",
    "get_usdy_evidence",
    "load_usdy_official_snapshot",
    "parse_official_usdy_ethereum_address",
    "parse_usdy_official_snapshot",
    "read_usdy_onchain_evidence",
    "read_usdy_onchain_supply",
]
