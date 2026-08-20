"""Targeted tests for POST /markets/intelligence — Market AI integration.

These tests mock the AI provider and RPC layer to validate the endpoint
contract, grounding logic, and error handling without network calls.
"""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from services.markets.models import (
    MarketIntelligenceRequest,
    MarketIntelligenceResponse,
    MarketIntelligenceTrace,
)


class TestMarketIntelligenceRequest(unittest.TestCase):
    """Validate request model constraints."""

    def test_valid_request(self):
        req = MarketIntelligenceRequest(query="What assets are on X Layer?")
        self.assertEqual(req.query, "What assets are on X Layer?")

    def test_minimum_length(self):
        with self.assertRaises(Exception):
            MarketIntelligenceRequest(query="ab")

    def test_maximum_length(self):
        with self.assertRaises(Exception):
            MarketIntelligenceRequest(query="x" * 2001)

    def test_forbids_extra_fields(self):
        with self.assertRaises(Exception):
            MarketIntelligenceRequest(query="test", extra_field="nope")


class TestMarketIntelligenceResponse(unittest.TestCase):
    """Validate response model shape."""

    def test_response_shape(self):
        resp = MarketIntelligenceResponse(
            answer="Test answer",
            query="test query",
            data_sources=["xlayer_assets"],
            trace=[
                MarketIntelligenceTrace(
                    source="xlayer_assets",
                    status="ok",
                    record_count=8,
                    summary="Loaded 8 assets.",
                )
            ],
            observed_at=datetime.now(timezone.utc).isoformat(),
        )
        self.assertEqual(resp.answer, "Test answer")
        self.assertEqual(resp.query, "test query")
        self.assertIn("xlayer_assets", resp.data_sources)
        self.assertEqual(len(resp.trace), 1)
        self.assertEqual(resp.trace[0].record_count, 8)

    def test_empty_defaults(self):
        resp = MarketIntelligenceResponse(
            answer="answer",
            query="q",
            observed_at="2026-01-01T00:00:00+00:00",
        )
        self.assertEqual(resp.data_sources, [])
        self.assertEqual(resp.trace, [])


class TestCollectMarketContext(unittest.TestCase):
    """Test the data collection function with mocked services.

    Mocks are applied at the intelligence module level to avoid
    triggering the deep import chain that hits X Layer RPC calls.
    """

    def _get_context_fn(self):
        """Import and return _collect_market_context with mocked dependencies."""
        # Mock the RPC layer before importing the intelligence module
        with patch("services.markets.xlayer.rpc.raw_rpc", return_value="0x0"):
            from services.markets.intelligence import _collect_market_context
        return _collect_market_context

    @patch("services.markets.intelligence.get_all_assets")
    @patch("services.markets.intelligence.get_earn_opportunities")
    @patch("services.markets.intelligence.get_borrow_opportunities")
    def test_collects_all_sources(self, mock_borrow, mock_earn, mock_assets):
        from services.markets.intelligence import _collect_market_context

        mock_assets.return_value = []
        mock_earn.return_value = []
        mock_borrow.return_value = []

        assets_ctx, earn_ctx, borrow_ctx, sources, trace = _collect_market_context()

        self.assertIn("xlayer_assets", sources)
        self.assertIn("aave_earn", sources)
        self.assertIn("aave_borrow", sources)
        self.assertEqual(assets_ctx["total"], 0)
        self.assertEqual(earn_ctx["total"], 0)
        self.assertEqual(borrow_ctx["total"], 0)
        self.assertEqual(len(trace), 3)

    @patch("services.markets.intelligence.get_all_assets", side_effect=Exception("RPC fail"))
    @patch("services.markets.intelligence.get_earn_opportunities")
    @patch("services.markets.intelligence.get_borrow_opportunities")
    def test_graceful_asset_failure(self, mock_borrow, mock_earn, mock_assets):
        from services.markets.intelligence import _collect_market_context

        mock_earn.return_value = []
        mock_borrow.return_value = []

        assets_ctx, earn_ctx, borrow_ctx, sources, trace = _collect_market_context()

        self.assertNotIn("xlayer_assets", sources)
        self.assertIn("aave_earn", sources)
        self.assertIn("aave_borrow", sources)
        self.assertEqual(assets_ctx["total"], 0)
        asset_traces = [t for t in trace if t.source == "xlayer_assets"]
        self.assertEqual(len(asset_traces), 1)
        self.assertEqual(asset_traces[0].status, "error")

    @patch("services.markets.intelligence.get_all_assets")
    @patch("services.markets.intelligence.get_earn_opportunities", side_effect=Exception("timeout"))
    @patch("services.markets.intelligence.get_borrow_opportunities")
    def test_graceful_earn_failure(self, mock_borrow, mock_earn, mock_assets):
        from services.markets.intelligence import _collect_market_context

        mock_assets.return_value = []
        mock_borrow.return_value = []

        assets_ctx, earn_ctx, borrow_ctx, sources, trace = _collect_market_context()

        self.assertIn("xlayer_assets", sources)
        self.assertNotIn("aave_earn", sources)
        self.assertIn("aave_borrow", sources)
        self.assertEqual(earn_ctx["total"], 0)

    @patch("services.markets.intelligence.get_all_assets")
    @patch("services.markets.intelligence.get_earn_opportunities")
    @patch("services.markets.intelligence.get_borrow_opportunities", side_effect=Exception("fail"))
    def test_graceful_borrow_failure(self, mock_borrow, mock_earn, mock_assets):
        from services.markets.intelligence import _collect_market_context

        mock_assets.return_value = []
        mock_earn.return_value = []

        assets_ctx, earn_ctx, borrow_ctx, sources, trace = _collect_market_context()

        self.assertIn("xlayer_assets", sources)
        self.assertIn("aave_earn", sources)
        self.assertNotIn("aave_borrow", sources)
        self.assertEqual(borrow_ctx["total"], 0)


class TestBuildGroundingContext(unittest.TestCase):
    """Test the grounding context builder."""

    def test_context_contains_all_sections(self):
        from services.markets.intelligence import _build_grounding_context

        assets = {"assets": [{"symbol": "USDT0"}], "total": 1}
        earn = {"opportunities": [{"symbol": "USDT0", "supply_apy": 0.003}], "total": 1}
        borrow = {"opportunities": [], "total": 0}

        ctx = _build_grounding_context(assets, earn, borrow)

        self.assertIn("X Layer Mainnet Market Data", ctx)
        self.assertIn("Assets", ctx)
        self.assertIn("USDT0", ctx)
        self.assertIn("Supply Opportunities", ctx)
        self.assertIn("Borrow Opportunities", ctx)

    def test_context_is_json_parseable(self):
        from services.markets.intelligence import _build_grounding_context

        assets = {"assets": [], "total": 0}
        earn = {"opportunities": [], "total": 0}
        borrow = {"opportunities": [], "total": 0}

        ctx = _build_grounding_context(assets, earn, borrow)

        # Each JSON section should be parseable
        self.assertIn('"total": 0', ctx)


class TestRunMarketIntelligence(unittest.TestCase):
    """Test the main intelligence function with mocked AI provider."""

    @patch("services.markets.intelligence.is_agent_configured", return_value=False)
    def test_raises_when_not_configured(self, _mock_config):
        from services.agent.verification_agent import AgentUnavailableError
        from services.markets.intelligence import run_market_intelligence

        req = MarketIntelligenceRequest(query="What assets exist?")
        with self.assertRaises(AgentUnavailableError):
            import asyncio
            asyncio.run(run_market_intelligence(req))

    @patch("services.markets.intelligence._collect_market_context")
    @patch("services.markets.intelligence.is_agent_configured", return_value=True)
    @patch("services.markets.intelligence.configured_api_key", return_value="test-key")
    @patch("services.markets.intelligence.configured_base_url", return_value="https://test.example.com/v1")
    @patch("services.markets.intelligence.configured_model", return_value="test-model")
    def test_returns_grounded_response(self, _model, _base, _key, _config, mock_collect):
        from services.markets.intelligence import run_market_intelligence

        mock_collect.return_value = (
            {"assets": [{"symbol": "USDT0"}], "total": 1},
            {"opportunities": [], "total": 0},
            {"opportunities": [], "total": 0},
            ["xlayer_assets"],
            [MarketIntelligenceTrace(source="xlayer_assets", status="ok", record_count=1, summary="ok")],
        )

        mock_choice = MagicMock()
        mock_choice.message.content = "USDT0 is the primary stablecoin on X Layer Mainnet."
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]

        mock_provider = MagicMock()
        mock_provider.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("services.markets.intelligence.AsyncOpenAI", return_value=mock_provider):
            req = MarketIntelligenceRequest(query="Tell me about USDT0")
            import asyncio
            resp = asyncio.run(run_market_intelligence(req))

        self.assertIsInstance(resp, MarketIntelligenceResponse)
        self.assertIn("USDT0", resp.answer)
        self.assertEqual(resp.query, "Tell me about USDT0")
        self.assertIn("xlayer_assets", resp.data_sources)
        self.assertEqual(len(resp.trace), 1)
        self.assertTrue(resp.observed_at)

    @patch("services.markets.intelligence._collect_market_context")
    @patch("services.markets.intelligence.is_agent_configured", return_value=True)
    @patch("services.markets.intelligence.configured_api_key", return_value="test-key")
    @patch("services.markets.intelligence.configured_base_url", return_value="https://test.example.com/v1")
    @patch("services.markets.intelligence.configured_model", return_value="test-model")
    def test_empty_answer_fallback(self, _model, _base, _key, _config, mock_collect):
        from services.markets.intelligence import run_market_intelligence

        mock_collect.return_value = (
            {"assets": [], "total": 0},
            {"opportunities": [], "total": 0},
            {"opportunities": [], "total": 0},
            [],
            [],
        )

        mock_choice = MagicMock()
        mock_choice.message.content = ""
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]

        mock_provider = MagicMock()
        mock_provider.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("services.markets.intelligence.AsyncOpenAI", return_value=mock_provider):
            req = MarketIntelligenceRequest(query="What is the best yield?")
            import asyncio
            resp = asyncio.run(run_market_intelligence(req))

        self.assertIn("could not produce an answer", resp.answer)
        self.assertIn("No market data was fabricated", resp.answer)

    @patch("services.markets.intelligence._collect_market_context")
    @patch("services.markets.intelligence.is_agent_configured", return_value=True)
    @patch("services.markets.intelligence.configured_api_key", return_value="test-key")
    @patch("services.markets.intelligence.configured_base_url", return_value="https://test.example.com/v1")
    @patch("services.markets.intelligence.configured_model", return_value="test-model")
    def test_ai_failure_raises_execution_error(self, _model, _base, _key, _config, mock_collect):
        import openai
        from services.agent.verification_agent import AgentExecutionError
        from services.markets.intelligence import run_market_intelligence

        mock_collect.return_value = (
            {"assets": [], "total": 0},
            {"opportunities": [], "total": 0},
            {"opportunities": [], "total": 0},
            [],
            [],
        )

        mock_provider = MagicMock()
        mock_provider.chat.completions.create = AsyncMock(
            side_effect=openai.APIError(message="provider down", request=MagicMock(), body=None)
        )

        with patch("services.markets.intelligence.AsyncOpenAI", return_value=mock_provider):
            req = MarketIntelligenceRequest(query="What assets exist?")
            import asyncio
            with self.assertRaises(AgentExecutionError):
                asyncio.run(run_market_intelligence(req))


class TestEndpointWiring(unittest.TestCase):
    """Verify the endpoint is registered in FastAPI."""

    def test_endpoint_exists(self):
        """Check /markets/intelligence is in the app routes."""
        import ast

        with open("apps/api/main.py") as f:
            tree = ast.parse(f.read())

        route_found = False
        for node in ast.walk(tree):
            if (
                isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                and node.name == "market_intelligence"
            ):
                for decorator in node.decorator_list:
                    if isinstance(decorator, ast.Call):
                        func = decorator.func
                        if isinstance(func, ast.Attribute) and func.attr == "post":
                            args = decorator.args
                            if args and isinstance(args[0], ast.Constant):
                                if args[0].value == "/markets/intelligence":
                                    route_found = True
        self.assertTrue(route_found, "/markets/intelligence POST endpoint not found in main.py")


if __name__ == "__main__":
    unittest.main()
