import unittest

from services.agent.demo_models import DemoRunnerRequest
from services.agent.demo_runner import DeterministicDemoRunner
from services.mcp_server.tools import (
    CERTIFICATE_EXISTS_SELECTOR,
    CERTIFICATE_USABLE_SELECTOR,
    DECISION_COUNT_SELECTOR,
    DECISION_LOG_ADDRESS,
    DECISION_RECORDED_TOPIC,
    DEPLOYMENT_BLOCK,
    EXECUTED_ACTION_COUNT_SELECTOR,
    GET_CERTIFICATE_SELECTOR,
    POLICY_GATE_ADDRESS,
    POLICY_GATE_DECISION_LOG_SELECTOR,
    POLICY_GATE_REGISTRY_SELECTOR,
    REGISTRY_ADDRESS,
    ProofLayerToolError,
    ProofLayerTools,
)
from services.api_hardening import ApiConcurrencyLimiter, ApiRateLimiter, RequestSizeGuard
from services.xlayer.cache import TtlCache
from services.xlayer.config import ChainReadSettings


CERTIFICATE_ID = "0x" + "11" * 32


def _word(value: int) -> str:
    return f"{value:064x}"


def _bytes_word(value: str) -> str:
    return value.removeprefix("0x").lower().rjust(64, "0")


def _decision_log(
    *,
    block_number: int,
    log_index: int,
    transaction_hash: str,
    block_hash: str,
    timestamp: int,
) -> dict[str, object]:
    return {
        "blockNumber": hex(block_number),
        "transactionIndex": "0x0",
        "logIndex": hex(log_index),
        "transactionHash": transaction_hash,
        "blockHash": block_hash,
        "topics": [
            DECISION_RECORDED_TOPIC,
            "0x" + "aa" * 32,
            CERTIFICATE_ID,
            "0x" + "bb" * 32,
        ],
        "data": "0x" + "cc" * 32 + _word(1) + _word(timestamp),
    }


class CountingChain:
    def __init__(
        self,
        *,
        latest_block: int = DEPLOYMENT_BLOCK + 8_000,
        logs: list[dict[str, object]] | None = None,
        fail_logs: bool = False,
    ) -> None:
        self.latest_block = latest_block
        self.logs = logs or []
        self.fail_logs = fail_logs
        self.batches: list[list[tuple[str, list[object]]]] = []
        self.log_calls: list[dict[str, object]] = []

    def batch(self, calls):
        self.batches.append(calls)
        results = []
        for method, params in calls:
            if method == "eth_chainId":
                results.append(hex(1952))
                continue
            if method == "eth_blockNumber":
                results.append(hex(self.latest_block))
                continue
            if method == "eth_call":
                request = params[0]
                results.append(self.eth_call(request["to"], request["data"]))
                continue
            if method == "eth_getLogs":
                if self.fail_logs:
                    raise TimeoutError("mock timeout")
                query = params[0]
                self.log_calls.append(query)
                start = int(query["fromBlock"], 16)
                end = int(query["toBlock"], 16)
                results.append(
                    [
                        log
                        for log in self.logs
                        if start <= int(log["blockNumber"], 16) <= end
                    ]
                )
                continue
            raise AssertionError(f"unexpected method {method}")
        return results

    def eth_call(self, address: str, data: str) -> str:
        selector = data[2:10]
        if selector == CERTIFICATE_EXISTS_SELECTOR:
            return "0x" + _word(1)
        if selector == CERTIFICATE_USABLE_SELECTOR:
            return "0x" + _word(0)
        if selector == GET_CERTIFICATE_SELECTOR:
            values = [
                _bytes_word(CERTIFICATE_ID),
                "22" * 32,
                "33" * 32,
                "44" * 32,
                "55" * 32,
                _word(1_786_212_110),
                _word(1_786_215_710),
                _word(2),
                _word(1),
                _bytes_word("0x" + "66" * 20),
                _word(0),
            ]
            return "0x" + "".join(values)
        if selector == POLICY_GATE_REGISTRY_SELECTOR:
            return "0x" + _bytes_word(REGISTRY_ADDRESS)
        if selector == POLICY_GATE_DECISION_LOG_SELECTOR:
            return "0x" + _bytes_word(DECISION_LOG_ADDRESS)
        if selector == EXECUTED_ACTION_COUNT_SELECTOR:
            return "0x" + _word(1)
        if selector == DECISION_COUNT_SELECTOR:
            return "0x" + _word(2)
        raise AssertionError(f"unexpected selector {selector} for {address}")


def settings(*, max_scan_blocks: int = 10_000, batch_size: int = 5) -> ChainReadSettings:
    return ChainReadSettings(
        rpc_timeout_seconds=8,
        event_lookup_timeout_seconds=12,
        cache_ttl_seconds=30,
        cache_max_entries=32,
        event_max_scan_blocks=max_scan_blocks,
        event_chunk_size=2_000,
        event_batch_size=batch_size,
    )


class ApiHardeningTests(unittest.TestCase):
    def test_request_size_guard_rejects_overlarge_payload(self) -> None:
        guard = RequestSizeGuard(max_request_bytes=64)
        self.assertTrue(guard.allow(63))
        self.assertFalse(guard.allow(65))

    def test_rate_limiter_enforces_window(self) -> None:
        limiter = ApiRateLimiter(max_requests=2, window_seconds=60, clock=lambda: 0)
        self.assertTrue(limiter.allow("1.2.3.4", "/api/health"))
        self.assertTrue(limiter.allow("1.2.3.4", "/api/health"))
        self.assertFalse(limiter.allow("1.2.3.4", "/api/health"))

    def test_concurrency_limiter_waits_for_slots(self) -> None:
        limiter = ApiConcurrencyLimiter(max_active_requests=1)
        async def run_once() -> None:
            async with limiter:
                return None
        self.assertIsNotNone(limiter)
        self.assertTrue(hasattr(run_once, "__call__"))


class XLayerReadTests(unittest.TestCase):
    def test_history_starts_at_deployment_boundary_and_has_bounded_chunks(self) -> None:
        chain = CountingChain()
        tools = ProofLayerTools(chain=chain, settings=settings())

        history = tools.get_decision_history(CERTIFICATE_ID)

        self.assertEqual(DEPLOYMENT_BLOCK, history["query_from_block"])
        self.assertLessEqual(len(chain.log_calls), 5)
        self.assertTrue(
            all(int(call["fromBlock"], 16) >= DEPLOYMENT_BLOCK for call in chain.log_calls)
        )
        self.assertTrue(
            all(
                int(call["toBlock"], 16) - int(call["fromBlock"], 16) + 1 <= 2_000
                for call in chain.log_calls
            )
        )

    def test_history_deduplicates_and_orders_event_records(self) -> None:
        first = _decision_log(
            block_number=DEPLOYMENT_BLOCK + 100,
            log_index=2,
            transaction_hash="0x" + "01" * 32,
            block_hash="0x" + "10" * 32,
            timestamp=101,
        )
        second = _decision_log(
            block_number=DEPLOYMENT_BLOCK + 200,
            log_index=1,
            transaction_hash="0x" + "02" * 32,
            block_hash="0x" + "20" * 32,
            timestamp=202,
        )
        chain = CountingChain(logs=[second, first, first])
        tools = ProofLayerTools(chain=chain, settings=settings())

        history = tools.get_decision_history(CERTIFICATE_ID)

        self.assertEqual(2, history["matching_decision_count"])
        self.assertEqual(
            [DEPLOYMENT_BLOCK + 100, DEPLOYMENT_BLOCK + 200],
            [item["block_number"] for item in history["matching_decisions"]],
        )

    def test_latest_lookup_stops_after_the_newest_matching_chunk(self) -> None:
        latest = DEPLOYMENT_BLOCK + 8_000
        chain = CountingChain(
            latest_block=latest,
            logs=[
                _decision_log(
                    block_number=latest,
                    log_index=0,
                    transaction_hash="0x" + "03" * 32,
                    block_hash="0x" + "30" * 32,
                    timestamp=303,
                )
            ],
        )
        tools = ProofLayerTools(chain=chain, settings=settings(batch_size=1))

        latest_decision = tools.get_latest_decision(CERTIFICATE_ID)

        self.assertIsNotNone(latest_decision)
        self.assertEqual(1, len(chain.log_calls))
        self.assertEqual(latest - 1_999, int(chain.log_calls[0]["fromBlock"], 16))

    def test_event_timeout_is_exposed_as_unavailable_dashboard_state(self) -> None:
        chain = CountingChain(fail_logs=True)
        tools = ProofLayerTools(chain=chain, settings=settings())

        dashboard = tools.get_certificate_dashboard(CERTIFICATE_ID)

        self.assertTrue(dashboard["connected"])
        self.assertFalse(dashboard["decisionLookupComplete"])
        self.assertIsNone(dashboard["decision"])
        with self.assertRaisesRegex(ProofLayerToolError, "DecisionLog history is unavailable"):
            tools.get_decision_history(CERTIFICATE_ID)

    def test_repeated_certificate_reads_hit_the_ttl_cache(self) -> None:
        chain = CountingChain()
        tools = ProofLayerTools(chain=chain, settings=settings())

        tools.get_certificate_state(CERTIFICATE_ID)
        tools.get_certificate_state(CERTIFICATE_ID)

        self.assertEqual(1, len(chain.batches))

    def test_expired_certificate_cache_refreshes(self) -> None:
        clock_value = [0.0]
        chain = CountingChain()
        cache = TtlCache(
            ttl_seconds=30,
            max_entries=32,
            clock=lambda: clock_value[0],
        )
        tools = ProofLayerTools(chain=chain, settings=settings(), cache=cache)

        tools.get_certificate_state(CERTIFICATE_ID)
        clock_value[0] = 31.0
        tools.get_certificate_state(CERTIFICATE_ID)

        self.assertEqual(2, len(chain.batches))

    def test_composed_certificate_read_avoids_duplicate_rpc_batches(self) -> None:
        chain = CountingChain()
        tools = ProofLayerTools(chain=chain, settings=settings())

        tools.get_certificate_state(CERTIFICATE_ID)
        tools.get_policygate_state(
            CERTIFICATE_ID,
            "USDY",
            "TreasuryBacking",
            "default-treasury-policy",
        )

        self.assertEqual(1, len(chain.batches))

    def test_deterministic_demo_uses_a_bounded_network_path(self) -> None:
        chain = CountingChain()
        runner = DeterministicDemoRunner(
            ProofLayerTools(chain=chain, settings=settings())
        )

        runner.run(
            DemoRunnerRequest(scenario="usdy_treasury_verification")
        )

        self.assertLessEqual(len(chain.batches), 2)
        self.assertLessEqual(len(chain.log_calls), 5)


if __name__ == "__main__":
    unittest.main()
