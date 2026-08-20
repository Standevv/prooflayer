"""Diagnostic script to verify configuration loading without exposing secrets."""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    # Simulate the non-overriding environment load used by the application.
    print(f"PROJECT_ROOT: {PROJECT_ROOT}")
    print(f".env exists: {(PROJECT_ROOT / '.env').exists()}")
    load_dotenv(PROJECT_ROOT / ".env", override=False)

    print("After load_dotenv:")
    print(f"  AI_API_KEY configured: {bool(os.getenv('AI_API_KEY', '').strip())}")
    print(f"  AI_MODEL configured: {bool(os.getenv('AI_MODEL', '').strip())}")
    print(f"  AI_BASE_URL configured: {bool(os.getenv('AI_BASE_URL', '').strip())}")
    print(f"  AI_PROVIDER configured: {bool(os.getenv('AI_PROVIDER', '').strip())}")
    print(
        "  OPENAI_API_KEY configured: "
        f"{bool(os.getenv('OPENAI_API_KEY', '').strip())}"
    )
    print(f"  OPENAI_MODEL configured: {bool(os.getenv('OPENAI_MODEL', '').strip())}")
    print(
        "  OPENAI_BASE_URL configured: "
        f"{bool(os.getenv('OPENAI_BASE_URL', '').strip())}"
    )

    sys.path.insert(0, str(PROJECT_ROOT))
    from services.agent.verification_agent import (
        configured_api_key,
        configured_base_url,
        configured_model,
        configured_provider_name,
        is_agent_configured,
    )

    print("\nAgent configuration:")
    print(f"  is_agent_configured: {is_agent_configured()}")
    print(f"  configured_model: {configured_model()}")
    print(f"  configured_base_url present: {bool(configured_base_url().strip())}")
    print(f"  configured_provider_name: {configured_provider_name()}")
    print(f"  configured_api_key present: {bool(configured_api_key().strip())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
