import hashlib
import json
import re
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from decimal import Decimal
from itertools import count
from typing import Any
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from services.rvc.models import EvidenceRecord

from .models import RawEvidence
from .normalizer import normalize_evidence_batch


TOTAL_SUPPLY_SELECTOR = "0x18160ddd"

RpcCall = Callable[[str, list[Any]], Any]


class EvmAdapterError(ValueError):
    """Raised when EVM state cannot be decoded into trustworthy evidence."""


class EvmRpcError(EvmAdapterError):
    """Raised for JSON-RPC transport, envelope, and error responses."""


def _required_text(name: str, value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise EvmAdapterError(f"{name} is required")
    return value.strip()


def _validate_address(address: str) -> str:
    address = _required_text("address", address)
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", address):
        raise EvmAdapterError("address must be a full 20-byte EVM address")
    return address


def _validate_decimals(decimals: int) -> int:
    if isinstance(decimals, bool) or not isinstance(decimals, int) or decimals < 0:
        raise EvmAdapterError("decimals must be a non-negative integer")
    if decimals > 255:
        raise EvmAdapterError("decimals exceeds the ERC-20 uint8 range")
    return decimals


def _decode_quantity(name: str, value: Any) -> int:
    if not isinstance(value, str) or not re.fullmatch(
        r"(?:0x0|0x[1-9a-fA-F][0-9a-fA-F]*)", value
    ):
        raise EvmAdapterError(f"{name} must be a canonical hex quantity")
    return int(value, 16)


def _decode_uint256(name: str, value: Any) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"0x[0-9a-fA-F]+", value):
        raise EvmAdapterError(f"{name} must be a non-empty hex uint256")
    encoded_value = value[2:]
    if len(encoded_value) != 64:
        raise EvmAdapterError(f"{name} must be one 32-byte ABI word")
    return int(encoded_value, 16)


def _scale_uint256(value: int, decimals: int) -> Decimal:
    digits = tuple(int(character) for character in str(value))
    return Decimal((0, digits, -decimals))


def _normalize_block_tag(block_number: int | str | None) -> str:
    if block_number is None:
        return "latest"
    if isinstance(block_number, bool):
        raise EvmAdapterError("block_number must be an integer or hex quantity")
    if isinstance(block_number, int):
        if block_number < 0:
            raise EvmAdapterError("block_number must be non-negative")
        return hex(block_number)
    return hex(_decode_quantity("block_number", block_number))


def _utc_timestamp(value: datetime | str | None) -> datetime:
    if value is None:
        timestamp = datetime.now(timezone.utc)
    elif isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, str) and value.strip():
        raw_timestamp = value.strip()
        if raw_timestamp.endswith("Z"):
            raw_timestamp = raw_timestamp[:-1] + "+00:00"
        try:
            timestamp = datetime.fromisoformat(raw_timestamp)
        except ValueError as error:
            raise EvmAdapterError("retrieved_at must be an ISO-8601 timestamp") from error
    else:
        raise EvmAdapterError("retrieved_at must be an ISO-8601 timestamp")

    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _content_hash(payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _sanitize_rpc_source(value: str) -> str:
    source = _required_text("rpc_source", value)
    parsed = urlsplit(source)
    if parsed.scheme in {"http", "https"} and parsed.hostname:
        try:
            port = f":{parsed.port}" if parsed.port is not None else ""
        except ValueError as error:
            raise EvmAdapterError("rpc_source contains an invalid port") from error
        return f"{parsed.scheme}://{parsed.hostname}{port}"
    return source


class EvmJsonRpcClient:
    """Minimal standard-library EVM JSON-RPC client."""

    def __init__(
        self,
        rpc_url: str,
        *,
        opener: Callable[..., Any] | None = None,
        timeout: float = 15,
        rpc_source: str | None = None,
        rpc_call: RpcCall | None = None,
    ) -> None:
        self.rpc_url = _required_text("rpc_url", rpc_url)
        self._opener = opener or urlopen
        self._timeout = timeout
        self._request_ids = count(1)
        self._rpc_call = rpc_call

        parsed_url = urlsplit(self.rpc_url)
        if self._rpc_call is None and (
            parsed_url.scheme not in {"http", "https"} or not parsed_url.hostname
        ):
            raise EvmAdapterError("rpc_url must be an HTTP(S) endpoint")

        if parsed_url.scheme and parsed_url.hostname:
            try:
                port = f":{parsed_url.port}" if parsed_url.port is not None else ""
            except ValueError as error:
                raise EvmAdapterError("rpc_url contains an invalid port") from error
            default_source = f"{parsed_url.scheme}://{parsed_url.hostname}{port}"
        else:
            default_source = "injected-rpc"
        self.rpc_source = _sanitize_rpc_source(
            rpc_source if rpc_source is not None else default_source
        )

    def call(self, method: str, params: list[Any]) -> Any:
        method = _required_text("method", method)
        if self._rpc_call is not None:
            try:
                result = self._rpc_call(method, params)
            except Exception as error:
                raise EvmRpcError(f"EVM RPC call failed: {method}") from error
            if result is None:
                raise EvmRpcError(f"EVM RPC returned no result: {method}")
            return result

        request_id = next(self._request_ids)
        payload = json.dumps(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params,
            }
        ).encode("utf-8")
        request = Request(
            self.rpc_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with self._opener(request, timeout=self._timeout) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except Exception as error:
            raise EvmRpcError(f"EVM RPC transport failed: {method}") from error

        if not isinstance(response_payload, Mapping):
            raise EvmRpcError("EVM RPC response must be an object")
        if response_payload.get("jsonrpc") != "2.0":
            raise EvmRpcError("EVM RPC response has an invalid jsonrpc version")
        if response_payload.get("id") != request_id:
            raise EvmRpcError("EVM RPC response id does not match the request")
        if response_payload.get("error") is not None:
            raise EvmRpcError(f"EVM RPC error: {response_payload['error']}")
        if "result" not in response_payload or response_payload["result"] is None:
            raise EvmRpcError(f"EVM RPC returned no result: {method}")
        return response_payload["result"]

    def eth_call(self, address: str, data: str, block: str = "latest") -> str:
        if not isinstance(data, str) or not re.fullmatch(r"0x[0-9a-fA-F]*", data):
            raise EvmAdapterError("eth_call data must be hex")
        return self.call(
            "eth_call",
            [{"to": _validate_address(address), "data": data}, block],
        )

    def eth_get_code(self, address: str, block: str = "latest") -> str:
        return self.call("eth_getCode", [_validate_address(address), block])

    def eth_block_number(self) -> int:
        return _decode_quantity("eth_blockNumber", self.call("eth_blockNumber", []))

    def eth_chain_id(self) -> int:
        return _decode_quantity("eth_chainId", self.call("eth_chainId", []))

    def eth_get_block_by_number(self, block: str) -> Mapping[str, Any]:
        result = self.call("eth_getBlockByNumber", [block, False])
        if not isinstance(result, Mapping):
            raise EvmRpcError("eth_getBlockByNumber result must be an object")
        return result


def _client(
    rpc_url: str,
    client: EvmJsonRpcClient | None,
    *,
    opener: Callable[..., Any] | None = None,
    timeout: float = 15,
) -> EvmJsonRpcClient:
    return client or EvmJsonRpcClient(rpc_url, opener=opener, timeout=timeout)


def get_total_supply(
    rpc_url: str,
    token_address: str,
    decimals: int,
    *,
    block_number: int | str | None = None,
    client: EvmJsonRpcClient | None = None,
    opener: Callable[..., Any] | None = None,
    timeout: float = 15,
) -> Decimal:
    token_address = _validate_address(token_address)
    decimals = _validate_decimals(decimals)

    rpc = _client(rpc_url, client, opener=opener, timeout=timeout)
    block_tag = _normalize_block_tag(block_number)
    raw_supply = _decode_uint256(
        "totalSupply",
        rpc.eth_call(token_address, TOTAL_SUPPLY_SELECTOR, block_tag),
    )
    return _scale_uint256(raw_supply, decimals)


def get_contract_code(
    rpc_url: str,
    address: str,
    *,
    block_number: int | str | None = None,
    client: EvmJsonRpcClient | None = None,
    opener: Callable[..., Any] | None = None,
    timeout: float = 15,
) -> str:
    address = _validate_address(address)
    rpc = _client(rpc_url, client, opener=opener, timeout=timeout)
    code = rpc.eth_get_code(address, _normalize_block_tag(block_number))
    if (
        not isinstance(code, str)
        or not re.fullmatch(r"0x[0-9a-fA-F]*", code)
        or len(code[2:]) % 2 != 0
    ):
        raise EvmAdapterError("eth_getCode must return hex bytecode")
    return code


def has_deployed_bytecode(code: str) -> bool:
    if (
        not isinstance(code, str)
        or not re.fullmatch(r"0x[0-9a-fA-F]*", code)
        or len(code[2:]) % 2 != 0
    ):
        raise EvmAdapterError("contract code must be hex bytecode")
    return bool(code[2:])


def is_official_contract_deployed(
    rpc_url: str,
    address: str,
    official_address: str,
    *,
    block_number: int | str | None = None,
    client: EvmJsonRpcClient | None = None,
) -> bool:
    address = _validate_address(address)
    official_address = _validate_address(official_address)
    if address.lower() != official_address.lower():
        return False
    return has_deployed_bytecode(
        get_contract_code(
            rpc_url,
            address,
            block_number=block_number,
            client=client,
        )
    )


def read_erc20_evidence(
    rpc_url: str,
    token_address: str,
    decimals: int,
    *,
    asset: str,
    root_source_id: str,
    expected_chain_id: int,
    official_address: str | None = None,
    official_source_id: str | None = None,
    official_content_hash: str | None = None,
    official_root_source_id: str | None = None,
    block_number: int | str | None = None,
    retrieved_at: datetime | str | None = None,
    client: EvmJsonRpcClient | None = None,
) -> list[EvidenceRecord]:
    token_address = _validate_address(token_address)
    decimals = _validate_decimals(decimals)
    if isinstance(expected_chain_id, bool) or not isinstance(expected_chain_id, int):
        raise EvmAdapterError("expected_chain_id must be an integer")
    if expected_chain_id < 0:
        raise EvmAdapterError("expected_chain_id must be non-negative")
    if official_address is not None:
        official_address = _validate_address(official_address)
    rpc = _client(rpc_url, client)
    chain_id = rpc.eth_chain_id()
    if chain_id != expected_chain_id:
        raise EvmAdapterError(
            f"unexpected chain_id {chain_id}; expected {expected_chain_id}"
        )

    if block_number is None:
        resolved_block_number = rpc.eth_block_number()
    else:
        resolved_block_number = _decode_quantity(
            "block_number", _normalize_block_tag(block_number)
        )
    block_tag = hex(resolved_block_number)
    block = rpc.eth_get_block_by_number(block_tag)
    returned_block_number = _decode_quantity("block.number", block.get("number"))
    if returned_block_number != resolved_block_number:
        raise EvmAdapterError("EVM RPC returned a different block")
    block_timestamp = _decode_quantity("block.timestamp", block.get("timestamp"))
    try:
        observed_at = datetime.fromtimestamp(block_timestamp, tz=timezone.utc)
    except (OSError, OverflowError, ValueError) as error:
        raise EvmAdapterError("block.timestamp is outside the supported range") from error
    retrieval_time = _utc_timestamp(retrieved_at)

    contract_code = get_contract_code(
        rpc_url,
        token_address,
        block_number=block_tag,
        client=rpc,
    )
    deployed_bytecode = has_deployed_bytecode(contract_code)
    address_match = (
        official_address is not None
        and token_address.lower() == official_address.lower()
    )

    common_metadata = {
        "block_number": resolved_block_number,
        "block_tag": block_tag,
        "block_timestamp": block_timestamp,
        "chain_id": chain_id,
        "contract_address": token_address,
        "observed_at": observed_at,
        "retrieved_at": retrieval_time,
        "rpc_source": rpc.rpc_source,
    }
    if isinstance(block.get("hash"), str):
        common_metadata["block_hash"] = block["hash"]
    source_prefix = f"{root_source_id}-{asset.lower()}-{token_address.lower()}"
    raw_evidence: list[RawEvidence] = []

    if deployed_bytecode:
        raw_total_supply = _decode_uint256(
            "totalSupply",
            rpc.eth_call(token_address, TOTAL_SUPPLY_SELECTOR, block_tag),
        )
        total_supply = _scale_uint256(raw_total_supply, decimals)
        supply_hash = _content_hash(
            {
                **common_metadata,
                "contract_code": contract_code,
                "decimals": decimals,
                "raw_total_supply": str(raw_total_supply),
                "total_supply": str(total_supply),
            }
        )
        raw_evidence.append(
            RawEvidence(
                source_type="onchain",
                source_id=f"{source_prefix}-total-supply",
                asset=asset,
                field="onchain_supply",
                value=total_supply,
                unit=asset,
                observed_at=observed_at,
                metadata={
                    "root_source_id": root_source_id,
                    "retrieved_at": retrieval_time,
                    "content_hash": supply_hash,
                    "evidence_tier": "A",
                    "rpc_method": "eth_call",
                    "function_selector": TOTAL_SUPPLY_SELECTOR,
                    "decimals": decimals,
                    "raw_total_supply": str(raw_total_supply),
                    **common_metadata,
                },
            )
        )
    elif official_address is None:
        raise EvmAdapterError("token address has no deployed bytecode")

    if official_address is not None:
        verification_root = official_root_source_id or root_source_id
        verification_hash = _content_hash(
            {
                **common_metadata,
                "address_match": address_match,
                "contract_code": contract_code,
                "deployed_bytecode": deployed_bytecode,
                "official_content_hash": official_content_hash,
                "official_contract_address": official_address,
                "official_source_id": official_source_id,
                "verified": address_match and deployed_bytecode,
            }
        )
        verification_metadata = {
            "root_source_id": verification_root,
            "retrieved_at": retrieval_time,
            "content_hash": verification_hash,
            "evidence_tier": "A",
            "rpc_method": "eth_getCode",
            "official_contract_address": official_address,
            "official_address_match": address_match,
            "deployed_bytecode": deployed_bytecode,
            "onchain_root_source_id": root_source_id,
            **common_metadata,
        }
        if official_source_id is not None:
            verification_metadata["official_source_id"] = official_source_id
            verification_metadata["dependency_parent_ids"] = [official_source_id]
        if official_content_hash is not None:
            verification_metadata["official_content_hash"] = official_content_hash
        raw_evidence.append(
            RawEvidence(
                source_type="onchain",
                source_id=f"{source_prefix}-contract-verification",
                asset=asset,
                field="issuer_contract_verified",
                value=address_match and deployed_bytecode,
                unit=None,
                observed_at=observed_at,
                metadata=verification_metadata,
            )
        )

    return normalize_evidence_batch(raw_evidence)


__all__ = [
    "EvmAdapterError",
    "EvmJsonRpcClient",
    "EvmRpcError",
    "RpcCall",
    "TOTAL_SUPPLY_SELECTOR",
    "get_contract_code",
    "get_total_supply",
    "has_deployed_bytecode",
    "is_official_contract_deployed",
    "read_erc20_evidence",
]
