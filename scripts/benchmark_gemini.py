"""Gemini native function-calling benchmark and end-to-end validation.

This is an explicitly opt-in network diagnostic. Importing this module is safe:
it does not load credentials or make provider/backend requests.
"""
import argparse
import json
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
BACKEND_URL = "http://127.0.0.1:8010"
PROXY_URL = "http://localhost:3000"

TOOLS = [
    {"type": "function", "function": {"name": "discover_assets", "description": "List assets", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_asset_metadata", "description": "Get metadata", "parameters": {"type": "object", "properties": {"asset": {"type": "string", "enum": ["USDY","PAXG"]}}, "required": ["asset"]}}},
    {"type": "function", "function": {"name": "get_evidence", "description": "Get evidence", "parameters": {"type": "object", "properties": {"asset": {"type": "string", "enum": ["USDY","PAXG"]}, "claim": {"type": "string", "enum": ["TreasuryBacking","GoldBacking"]}}, "required": ["asset","claim"]}}},
    {"type": "function", "function": {"name": "verify_claim", "description": "Run RVC", "parameters": {"type": "object", "properties": {"asset": {"type": "string", "enum": ["USDY","PAXG"]}, "claim": {"type": "string", "enum": ["TreasuryBacking","GoldBacking"]}}, "required": ["asset","claim"]}}},
    {"type": "function", "function": {"name": "analyze_provenance", "description": "Analyze provenance", "parameters": {"type": "object", "properties": {"asset": {"type": "string", "enum": ["USDY","PAXG"]}, "claim": {"type": "string", "enum": ["TreasuryBacking","GoldBacking"]}}, "required": ["asset","claim"]}}},
    {"type": "function", "function": {"name": "get_certificate_state", "description": "Read cert", "parameters": {"type": "object", "properties": {"certificate_id": {"type": "string"}}, "required": ["certificate_id"]}}},
    {"type": "function", "function": {"name": "get_policygate_state", "description": "Read PolicyGate", "parameters": {"type": "object", "properties": {"certificate_id": {"type": "string"}, "asset": {"type": "string"}, "claim": {"type": "string"}, "policy": {"type": "string"}}, "required": ["certificate_id","asset","claim","policy"]}}},
    {"type": "function", "function": {"name": "get_decision_history", "description": "Read decisions", "parameters": {"type": "object", "properties": {"certificate_id": {"type": "string"}}, "required": ["certificate_id"]}}},
]
ALLOWED = {t["function"]["name"] for t in TOOLS}


def _require_network_opt_in(allow_network: bool) -> None:
    if not allow_network:
        raise RuntimeError(
            "Network diagnostics are disabled. Run this script with "
            "--allow-network to opt in explicitly."
        )


def run_benchmarks(*, api_key: str, allow_network: bool = False):
    """Run 3 consecutive native function-calling benchmarks against Gemini."""
    _require_network_opt_in(allow_network)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    print("=" * 70)
    print("PART A: NATIVE GEMINI FUNCTION-CALLING BENCHMARK (3 runs)")
    print("=" * 70)

    body = {
        "model": "gemini-3.5-flash-lite",
        "messages": [
            {"role": "system", "content": "You are a ProofLayer verification agent."},
            {"role": "user", "content": "Check USDY TreasuryBacking evidence"},
        ],
        "tools": TOOLS,
        "tool_choice": "auto",
        "max_tokens": 200,
        "temperature": 0.0,
    }

    results = []
    for i in range(1, 4):
        sw = time.perf_counter()
        try:
            r = httpx.post(GEMINI_URL, headers=headers, json=body, timeout=30.0)
            elapsed = time.perf_counter() - sw
            data = r.json()
            # Gemini returns a list on error
            if isinstance(data, list):
                print(
                    f"  Run {i}: HTTP {r.status_code} | {elapsed:.2f}s | "
                    "ERROR_RESPONSE_OMITTED"
                )
                results.append({"i": i, "status": r.status_code, "time": elapsed, "tool": "NONE", "valid": False, "args_ok": False, "pass": False})
                continue
            choice = data["choices"][0]
            msg = choice["message"]
            tc_list = msg.get("tool_calls") or []
            tc = tc_list[0] if tc_list else {}
            name = tc.get("function", {}).get("name", "NONE")
            args_raw = tc.get("function", {}).get("arguments", "{}")
            valid_tool = name in ALLOWED
            try:
                args = json.loads(args_raw)
                has_args = len(args) > 0
                args_schema_valid = all(k in ("asset","claim","certificate_id","policy") for k in args)
            except Exception:
                has_args = False
                args_schema_valid = False
            ok = r.status_code == 200 and valid_tool and has_args
            print(f"  Run {i}: HTTP {r.status_code} | {elapsed:.2f}s | tool={name} | valid_tool={valid_tool} | args_valid={args_schema_valid} | finish={choice['finish_reason']} | PASS={ok}")
            results.append({"i": i, "status": r.status_code, "time": elapsed, "tool": name, "valid": valid_tool, "args_ok": args_schema_valid, "pass": ok})
        except Exception as error:
            elapsed = time.perf_counter() - sw
            print(f"  Run {i}: FAILED | {elapsed:.2f}s | {type(error).__name__}")
            results.append({"i": i, "status": 0, "time": elapsed, "tool": "NONE", "valid": False, "args_ok": False, "pass": False})
        time.sleep(0.5)

    passed = sum(1 for r in results if r["pass"])
    print(f"\n  RESULT: {passed}/3 benchmark runs PASSED")
    return results


def run_investigation(url, label, *, allow_network: bool = False):
    """Run a complete USDY TreasuryBacking investigation via /agent/verify."""
    _require_network_opt_in(allow_network)
    print(f"\n{'=' * 70}")
    print(f"PART {label}: INVESTIGATION via {url}/agent/verify")
    print(f"{'=' * 70}")

    body = {"query": "Investigate USDY TreasuryBacking"}
    sw = time.perf_counter()
    try:
        r = httpx.post(f"{url}/agent/verify", json=body, timeout=300.0)
        elapsed = time.perf_counter() - sw
        data = r.json()
        print(f"  HTTP {r.status_code} | {elapsed:.2f}s")
        if r.status_code != 200:
            print("  ERROR_RESPONSE_OMITTED")
            return {"status": r.status_code, "time": elapsed, "data": data}
        print(f"  answer: {data.get('answer', 'NONE')[:200]}")
        print(f"  asset: {data.get('asset')}")
        print(f"  claim: {data.get('claim')}")
        print(f"  verification_result: {data.get('verification_result')}")
        print(f"  reason_codes: {data.get('reason_codes')}")
        print(f"  evidence_root_count: {data.get('evidence_root_count')}")
        print(f"  certificate_status: {data.get('certificate_status')}")
        print(f"  policygate_outcome: {data.get('policygate_outcome')}")
        print(f"  tools_used: {data.get('tools_used')}")
        trace = data.get("trace", [])
        print(f"  trace steps: {len(trace)}")
        for step in trace:
            print(f"    - {step.get('tool')}: {step.get('summary', '')[:100]}")
        return {"status": r.status_code, "time": elapsed, "data": data}
    except Exception as error:
        elapsed = time.perf_counter() - sw
        print(f"  FAILED: {type(error).__name__}")
        return {"status": 0, "time": elapsed, "data": {}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-network",
        action="store_true",
        help="Explicitly allow paid provider and local backend/proxy requests.",
    )
    args = parser.parse_args()
    if not args.allow_network:
        parser.error("network diagnostics require the explicit --allow-network flag")

    load_dotenv(ROOT / ".env", override=False)
    api_key = os.getenv("AI_API_KEY", "").strip()
    print(f"API key configured: {bool(api_key)}")

    # A: Benchmarks
    bench = run_benchmarks(api_key=api_key, allow_network=True)

    # B: Direct backend investigation
    direct = run_investigation(BACKEND_URL, "B", allow_network=True)

    # C: Proxy investigation
    proxy = run_investigation(PROXY_URL, "C", allow_network=True)

    # Summary
    print(f"\n{'=' * 70}")
    print("VALIDATION SUMMARY")
    print(f"{'=' * 70}")
    bench_ok = sum(1 for r in bench if r["pass"])
    print(f"GEMINI FUNCTION BENCHMARK 3/3: {'YES' if bench_ok == 3 else 'NO'} ({bench_ok}/3)")
    print(f"DIRECT INVESTIGATION COMPLETED: {'YES' if direct['status'] == 200 else 'NO'} ({direct['time']:.2f}s)")
    print(f"PROXY INVESTIGATION COMPLETED: {'YES' if proxy['status'] == 200 else 'NO'} ({proxy['time']:.2f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
