"""Offline safety tests for manually invoked provider diagnostics."""

from __future__ import annotations

import configparser
import io
import runpy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
DIAGNOSTIC_SCRIPTS = (
    ROOT / "scripts" / "benchmark_gemini.py",
    ROOT / "scripts" / "test_free_models.py",
    ROOT / "scripts" / "debug_thought.py",
    ROOT / "scripts" / "test_env_loading.py",
    ROOT / "scripts" / "test_agent_live.py",
)


class DiagnosticSafetyTests(unittest.TestCase):
    def test_importing_diagnostics_does_not_make_network_requests(self) -> None:
        with (
            patch("httpx.post") as http_post,
            patch("openai.AsyncOpenAI") as async_openai,
            patch("dotenv.load_dotenv") as load_dotenv,
        ):
            for script in DIAGNOSTIC_SCRIPTS:
                with self.subTest(script=script.name):
                    runpy.run_path(str(script), run_name=f"diagnostic_{script.stem}")

        http_post.assert_not_called()
        async_openai.assert_not_called()
        load_dotenv.assert_not_called()

    def test_network_helpers_fail_closed_without_explicit_opt_in(self) -> None:
        benchmark = runpy.run_path(
            str(ROOT / "scripts" / "benchmark_gemini.py"),
            run_name="diagnostic_benchmark",
        )
        free_models = runpy.run_path(
            str(ROOT / "scripts" / "test_free_models.py"),
            run_name="diagnostic_free_models",
        )
        thought = runpy.run_path(
            str(ROOT / "scripts" / "debug_thought.py"),
            run_name="diagnostic_thought",
        )

        for require_opt_in in (
            benchmark["_require_network_opt_in"],
            free_models["_require_network_opt_in"],
            thought["_require_network_opt_in"],
        ):
            with self.subTest(module=require_opt_in.__module__):
                with self.assertRaisesRegex(RuntimeError, "--allow-network"):
                    require_opt_in(False)

    def test_network_diagnostic_clis_require_opt_in_before_loading_env(self) -> None:
        network_scripts = (*DIAGNOSTIC_SCRIPTS[:3], DIAGNOSTIC_SCRIPTS[4])
        with (
            patch("httpx.post") as http_post,
            patch("openai.AsyncOpenAI") as async_openai,
            patch("dotenv.load_dotenv") as load_dotenv,
            patch.object(sys, "stderr", io.StringIO()),
        ):
            for script in network_scripts:
                namespace = runpy.run_path(
                    str(script),
                    run_name=f"diagnostic_cli_{script.stem}",
                )
                with self.subTest(script=script.name):
                    with (
                        patch.object(sys, "argv", [str(script)]),
                        self.assertRaises(SystemExit) as raised,
                    ):
                        namespace["main"]()
                    self.assertEqual(raised.exception.code, 2)

        http_post.assert_not_called()
        async_openai.assert_not_called()
        load_dotenv.assert_not_called()

    def test_pytest_default_collection_is_limited_to_tests(self) -> None:
        config = configparser.ConfigParser()
        config.read(ROOT / "pytest.ini", encoding="utf-8")
        pytest_config = config["pytest"]
        self.assertEqual(pytest_config.get("testpaths"), "tests")
        self.assertEqual(pytest_config.get("norecursedirs"), "scripts")

    def test_configuration_diagnostic_never_prints_credential_fragments(self) -> None:
        secret = "sentinel-super-secret-api-key-material"
        namespace = runpy.run_path(
            str(ROOT / "scripts" / "test_env_loading.py"),
            run_name="diagnostic_env_output",
        )
        namespace["main"].__globals__["load_dotenv"] = lambda *_args, **_kwargs: False
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(
                "os.environ",
                {
                    "AI_API_KEY": secret,
                    "OPENAI_API_KEY": secret,
                    "NVIDIA_API_KEY": secret,
                },
                clear=False,
            ),
            patch.object(sys, "stdout", stdout),
            patch.object(sys, "stderr", stderr),
        ):
            self.assertEqual(namespace["main"](), 0)
        rendered = stdout.getvalue() + stderr.getvalue()
        self.assertNotIn(secret, rendered)
        self.assertNotIn(secret[:8], rendered)


if __name__ == "__main__":
    unittest.main()
