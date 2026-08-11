import json
import unittest
from datetime import datetime, timezone
from decimal import Decimal

from services.evidence.evm import (
    EvmAdapterError,
    EvmJsonRpcClient,
    EvmRpcError,
    TOTAL_SUPPLY_SELECTOR,
    get_contract_code,
    get_total_supply,
    has_deployed_bytecode,
    is_official_contract_deployed,
    read_erc20_evidence,
)
from services.rvc.models import EvidenceRecord


TOKEN_ADDRESS = "0x96F6eF951840721AdBF46Ac996b59E0235CB985C"
WRONG_ADDRESS = "0x0000000000000000000000000000000000000001"
BLOCK_NUMBER = 25_710_174
BLOCK_TAG = hex(BLOCK_NUMBER)
BLOCK_TIMESTAMP = 1_786_190_075
RETRIEVED_AT = datetime(2026, 8, 8, 12, 17, 26, tzinfo=timezone.utc)


def _abi_word(value: int) -> str:
    return "0x" + format(value, "064x")


class StubEvmClient:
    rpc_source = "mock-ethereum-rpc"

    def __init__(
        self,
        *,
        raw_supply: int = 971_535_697_170_034_516_449_071_459,
        code: str = "0x6001600055",
        chain_id: int = 1,
    ) -> None:
        self.raw_supply = raw_supply
        self.code = code
        self.chain_id = chain_id
        self.calls: list[tuple] = []

    def eth_call(self, address: str, data: str, block: str = "latest") -> str:
        self.calls.append(("eth_call", address, data, block))
        return _abi_word(self.raw_supply)

    def eth_get_code(self, address: str, block: str = "latest") -> str:
        self.calls.append(("eth_getCode", address, block))
        return self.code

    def eth_block_number(self) -> int:
        self.calls.append(("eth_blockNumber",))
        return BLOCK_NUMBER

    def eth_chain_id(self) -> int:
        self.calls.append(("eth_chainId",))
        return self.chain_id

    def eth_get_block_by_number(self, block: str):
        self.calls.append(("eth_getBlockByNumber", block))
        return {
            "number": BLOCK_TAG,
            "timestamp": hex(BLOCK_TIMESTAMP),
            "hash": "0x" + "ab" * 32,
        }


class FakeHttpResponse:
    def __init__(self, payload: object) -> None:
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class EvmAdapterTests(unittest.TestCase):
    def test_total_supply_decodes_uint256_and_normalizes_decimals(self) -> None:
        client = StubEvmClient(raw_supply=1_234_567_890_123_456_789)

        supply = get_total_supply(
            "https://rpc.example/secret-path",
            TOKEN_ADDRESS,
            18,
            client=client,
        )

        self.assertEqual(Decimal("1.234567890123456789"), supply)
        self.assertEqual(
            [("eth_call", TOKEN_ADDRESS, TOTAL_SUPPLY_SELECTOR, "latest")],
            client.calls,
        )

    def test_zero_total_supply_is_valid(self) -> None:
        supply = get_total_supply(
            "https://rpc.example",
            TOKEN_ADDRESS,
            18,
            client=StubEvmClient(raw_supply=0),
        )

        self.assertEqual(Decimal(0), supply)

    def test_max_uint256_scaling_is_exact(self) -> None:
        raw_supply = (1 << 256) - 1

        supply = get_total_supply(
            "https://rpc.example",
            TOKEN_ADDRESS,
            18,
            client=StubEvmClient(raw_supply=raw_supply),
        )

        expected = Decimal((0, tuple(map(int, str(raw_supply))), -18))
        self.assertEqual(expected, supply)
        self.assertEqual(tuple(map(int, str(raw_supply))), supply.as_tuple().digits)
        self.assertEqual(-18, supply.as_tuple().exponent)

    def test_malformed_total_supply_response_fails_safely(self) -> None:
        malformed_values = (
            "not-hex",
            "0x",
            "0x1",
            "0x" + "00" * 31,
            "0x" + "00" * 33,
        )

        for value in malformed_values:
            with self.subTest(value=value):
                client = StubEvmClient()
                client.eth_call = lambda address, data, block="latest": value
                with self.assertRaises(EvmAdapterError):
                    get_total_supply(
                        "https://rpc.example",
                        TOKEN_ADDRESS,
                        18,
                        client=client,
                    )

    def test_rpc_callback_error_is_wrapped(self) -> None:
        def failing_rpc(method: str, params: list):
            raise RuntimeError("provider unavailable")

        client = EvmJsonRpcClient(
            "injected://test",
            rpc_call=failing_rpc,
            rpc_source="offline-test",
        )

        with self.assertRaises(EvmRpcError):
            get_total_supply(
                "injected://test",
                TOKEN_ADDRESS,
                18,
                client=client,
            )

    def test_contract_with_no_bytecode_is_not_deployed(self) -> None:
        client = StubEvmClient(code="0x")

        code = get_contract_code(
            "https://rpc.example",
            TOKEN_ADDRESS,
            client=client,
        )

        self.assertEqual("0x", code)
        self.assertFalse(has_deployed_bytecode(code))
        self.assertTrue(has_deployed_bytecode("0x00"))

    def test_malformed_contract_code_fails_safely(self) -> None:
        for code in ("not-hex", "0x0", "6000"):
            with self.subTest(code=code):
                with self.assertRaises(EvmAdapterError):
                    get_contract_code(
                        "https://rpc.example",
                        TOKEN_ADDRESS,
                        client=StubEvmClient(code=code),
                    )

    def test_canonical_address_and_bytecode_is_verified(self) -> None:
        self.assertTrue(
            is_official_contract_deployed(
                "https://rpc.example",
                TOKEN_ADDRESS.lower(),
                TOKEN_ADDRESS,
                client=StubEvmClient(code="0x6000"),
            )
        )

    def test_wrong_address_is_not_verified_without_an_rpc_read(self) -> None:
        client = StubEvmClient(code="0x6000")

        verified = is_official_contract_deployed(
            "https://rpc.example",
            WRONG_ADDRESS,
            TOKEN_ADDRESS,
            client=client,
        )

        self.assertFalse(verified)
        self.assertEqual([], client.calls)

    def test_normalized_supply_preserves_pinned_block_provenance(self) -> None:
        client = StubEvmClient()

        evidence = read_erc20_evidence(
            "https://user:password@rpc.example/v3/private-key?token=secret",
            TOKEN_ADDRESS,
            18,
            asset="USDY",
            root_source_id="ethereum",
            expected_chain_id=1,
            official_address=TOKEN_ADDRESS,
            official_source_id="ondo-contract-addresses-snapshot",
            official_root_source_id="ondo",
            retrieved_at=RETRIEVED_AT,
            client=client,
        )
        records = {item.field: item for item in evidence}
        supply = records["onchain_supply"]
        verification = records["issuer_contract_verified"]

        self.assertIsInstance(supply, EvidenceRecord)
        self.assertEqual("onchain", supply.source_type)
        self.assertEqual("ethereum", supply.root_source_id)
        self.assertIn(TOKEN_ADDRESS.lower(), supply.source_id)
        self.assertEqual("USDY", supply.asset)
        self.assertEqual("USDY", supply.unit)
        self.assertEqual(
            Decimal("971535697.170034516449071459"), supply.value
        )
        self.assertEqual(
            datetime.fromtimestamp(BLOCK_TIMESTAMP, tz=timezone.utc),
            supply.observed_at,
        )
        self.assertEqual(RETRIEVED_AT, supply.retrieved_at)
        self.assertEqual(BLOCK_NUMBER, supply.metadata["block_number"])
        self.assertEqual(BLOCK_TAG, supply.metadata["block_tag"])
        self.assertEqual(1, supply.metadata["chain_id"])
        self.assertEqual(TOKEN_ADDRESS, supply.metadata["contract_address"])
        self.assertEqual("mock-ethereum-rpc", supply.metadata["rpc_source"])
        self.assertEqual(supply.observed_at, supply.metadata["observed_at"])
        self.assertEqual(supply.retrieved_at, supply.metadata["retrieved_at"])
        self.assertEqual(TOTAL_SUPPLY_SELECTOR, supply.metadata["function_selector"])
        self.assertEqual(18, supply.metadata["decimals"])

        self.assertTrue(verification.value)
        self.assertEqual("ondo", verification.root_source_id)
        self.assertTrue(verification.metadata["official_address_match"])
        self.assertTrue(verification.metadata["deployed_bytecode"])
        self.assertEqual(
            ["ondo-contract-addresses-snapshot"],
            verification.dependency_parent_ids,
        )

        call_blocks = [
            call[-1]
            for call in client.calls
            if call[0] in {"eth_call", "eth_getCode"}
        ]
        self.assertEqual([BLOCK_TAG, BLOCK_TAG], call_blocks)
        self.assertEqual(1, client.calls.count(("eth_blockNumber",)))

    def test_explicit_block_pin_skips_eth_block_number(self) -> None:
        client = StubEvmClient()

        read_erc20_evidence(
            "https://rpc.example",
            TOKEN_ADDRESS,
            18,
            asset="USDY",
            root_source_id="ethereum",
            expected_chain_id=1,
            block_number=BLOCK_NUMBER,
            client=client,
        )

        self.assertNotIn(("eth_blockNumber",), client.calls)
        call_blocks = [
            call[-1]
            for call in client.calls
            if call[0] in {"eth_call", "eth_getCode"}
        ]
        self.assertEqual([BLOCK_TAG, BLOCK_TAG], call_blocks)

    def test_no_code_and_wrong_address_produce_false_verification(self) -> None:
        cases = (
            (TOKEN_ADDRESS, "0x"),
            (WRONG_ADDRESS, "0x6000"),
        )

        for address, code in cases:
            with self.subTest(address=address, code=code):
                evidence = read_erc20_evidence(
                    "https://rpc.example",
                    address,
                    18,
                    asset="USDY",
                    root_source_id="ethereum",
                    expected_chain_id=1,
                    official_address=TOKEN_ADDRESS,
                    client=StubEvmClient(code=code),
                )
                verification = next(
                    item
                    for item in evidence
                    if item.field == "issuer_contract_verified"
                )
                self.assertFalse(verification.value)

    def test_verification_hash_binds_official_identity(self) -> None:
        common_arguments = {
            "rpc_url": "https://rpc.example",
            "token_address": TOKEN_ADDRESS,
            "decimals": 18,
            "asset": "USDY",
            "root_source_id": "ethereum",
            "expected_chain_id": 1,
            "official_source_id": "ondo-addresses",
            "official_content_hash": "sha256:" + "ab" * 32,
            "client": StubEvmClient(),
        }
        verified = read_erc20_evidence(
            official_address=TOKEN_ADDRESS,
            **common_arguments,
        )[-1]
        rejected = read_erc20_evidence(
            official_address=WRONG_ADDRESS,
            **{**common_arguments, "client": StubEvmClient()},
        )[-1]

        self.assertTrue(verified.value)
        self.assertFalse(rejected.value)
        self.assertNotEqual(verified.content_hash, rejected.content_hash)

    def test_standard_library_client_supports_required_rpc_methods(self) -> None:
        requests: list[dict] = []

        def opener(request, timeout):
            payload = json.loads(request.data.decode("utf-8"))
            requests.append(payload)
            results = {
                "eth_blockNumber": BLOCK_TAG,
                "eth_getCode": "0x6000",
                "eth_call": _abi_word(42),
            }
            return FakeHttpResponse(
                {
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": results[payload["method"]],
                }
            )

        client = EvmJsonRpcClient(
            "https://user:password@rpc.example/v3/private-key?token=secret",
            opener=opener,
        )

        self.assertEqual(BLOCK_NUMBER, client.eth_block_number())
        self.assertEqual("0x6000", client.eth_get_code(TOKEN_ADDRESS, BLOCK_TAG))
        self.assertEqual(
            _abi_word(42),
            client.eth_call(TOKEN_ADDRESS, TOTAL_SUPPLY_SELECTOR, BLOCK_TAG),
        )
        self.assertEqual(
            ["eth_blockNumber", "eth_getCode", "eth_call"],
            [request["method"] for request in requests],
        )
        self.assertEqual("https://rpc.example", client.rpc_source)
        self.assertNotIn("password", client.rpc_source)
        self.assertNotIn("private-key", client.rpc_source)

    def test_json_rpc_error_and_malformed_envelope_fail_safely(self) -> None:
        response_payloads = (
            {"jsonrpc": "2.0", "id": 1, "error": {"code": -32000}},
            {"jsonrpc": "1.0", "id": 1, "result": BLOCK_TAG},
            {"jsonrpc": "2.0", "id": 99, "result": BLOCK_TAG},
            {"jsonrpc": "2.0", "id": 1},
            {"jsonrpc": "2.0", "id": 1, "result": None},
            ["not", "an", "object"],
        )

        for payload in response_payloads:
            with self.subTest(payload=payload):
                client = EvmJsonRpcClient(
                    "https://rpc.example",
                    opener=lambda request, timeout, payload=payload: FakeHttpResponse(
                        payload
                    ),
                )
                with self.assertRaises(EvmRpcError):
                    client.eth_block_number()

        class InvalidJsonResponse(FakeHttpResponse):
            def read(self) -> bytes:
                return b"{not-json"

        client = EvmJsonRpcClient(
            "https://rpc.example",
            opener=lambda request, timeout: InvalidJsonResponse(None),
        )
        with self.assertRaises(EvmRpcError):
            client.eth_block_number()


if __name__ == "__main__":
    unittest.main()
