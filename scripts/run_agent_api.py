"""Run the local ProofLayer agent API without embedding secrets in commands."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Running this file directly puts `scripts/` on sys.path instead of the project
# root, which breaks `uvicorn.run("apps.api.main:app")`. Add the project root
# explicitly so the server starts from any working directory.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import uvicorn  # noqa: E402


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    host = os.getenv("PROOFLAYER_AGENT_HOST", "127.0.0.1")
    port = int(os.getenv("PROOFLAYER_AGENT_PORT", "8010"))
    uvicorn.run("apps.api.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
