"""Run the local ProofLayer agent API without embedding secrets in commands."""

from __future__ import annotations

import os
import socket
import subprocess
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


def _is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0


def _kill_stale_process_on_port(port: int, host: str = "127.0.0.1") -> None:
    """Kill any process listening on the specified port (Windows)."""
    if not _is_port_in_use(port, host):
        return
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                if parts:
                    pid = parts[-1]
                    subprocess.run(
                        ["taskkill", "/PID", pid, "/F"],
                        capture_output=True,
                        timeout=5,
                    )
                    break
    except Exception:
        pass


def main() -> None:
    # Load .env with override=True so the latest values from disk always win.
    # This prevents stale environment variables from overriding the .env file
    # when the server is restarted after configuration changes.
    load_dotenv(PROJECT_ROOT / ".env", override=True)

    host = os.getenv("PROOFLAYER_AGENT_HOST", "127.0.0.1")
    port = int(os.getenv("PROOFLAYER_AGENT_PORT", "8010"))

    # Kill any stale process holding the port before starting
    _kill_stale_process_on_port(port, host)

    uvicorn.run("apps.api.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
