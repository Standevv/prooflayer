"""Audit AI agent tools against xStocks queries."""
import json
import sys
sys.path.insert(0, ".")

from services.mcp_server.tools import ProofLayerTools


class FakeChain:
    def __init__(self, exists: bool = True):
        self._exists = exists

    def get_code(self, address: str) -> str:
        return "0x6080604052" if self._exists else "0x"

    def get_chain_id(self) -> int:
        return 196


tools = ProofLayerTools(chain=FakeChain())

# Query 1: Is AAPLx deployed on X Layer?
print("=== Q1: Is AAPLx deployed on X Layer? ===")
result = tools.discover_assets()
aapl = next((a for a in result["assets"] if a["asset"] == "AAPLx"), None)
if aapl:
    print(f"  symbol: {aapl['asset']}")
    print(f"  deployed_on_xlayer: {aapl['deployed_on_xlayer']}")
    print(f"  deployment_verified: {aapl['deployment_verified']}")
    print(f"  contract_address: {aapl['contract_address'][:20]}...")
else:
    print("  AAPLx not found in registry")

# Query 2: What backs TSLAx?
print()
print("=== Q2: What backs TSLAx? ===")
meta = tools.get_asset_metadata("TSLAx")
print(f"  asset: {meta['asset']}")
print(f"  name: {meta['name']}")
print(f"  asset_origin: {meta['asset_origin']}")
print(f"  framework_verified: {meta['framework_verified']}")
print(f"  backing_verified: {meta['backing_verified']}")
print(f"  rvc_status: {meta['rvc_status']}")
print(f"  evidence_adapter: {meta['evidence_adapter']}")

# Query 3: Why is SPYx verified/indeterminate?
print()
print("=== Q3: Why is SPYx indeterminate? ===")
meta = tools.get_asset_metadata("SPYx")
print(f"  asset: {meta['asset']}")
print(f"  deployment_verified: {meta['deployment_verified']}")
print(f"  framework_verified: {meta['framework_verified']}")
print(f"  backing_verified: {meta['backing_verified']}")
print(f"  rvc_status: {meta['rvc_status']}")

# Query 4: What evidence does ProofLayer have for NVDAx?
print()
print("=== Q4: What evidence for NVDAx? ===")
meta = tools.get_asset_metadata("NVDAx")
print(f"  asset: {meta['asset']}")
print(f"  evidence_adapter: {meta['evidence_adapter']}")
print(f"  asset_class: {meta['asset_class']}")
print(f"  deployment_verified: {meta['deployment_verified']}")
print(f"  framework_verified: {meta['framework_verified']}")

# Verify no raw JSON in discover_assets output
print()
print("=== JSON leakage check ===")
for a in result["assets"][:3]:
    serialized = json.dumps(a)
    if '"type":' in serialized or '"tool":' in serialized:
        print(f"  WARNING: JSON artifact found in {a['asset']}")
    else:
        print(f"  OK: {a['asset']} -- clean output")

# Verify USDY/PAXG are labeled correctly
print()
print("=== USDY/PAXG labeling ===")
usdy = next((a for a in result["assets"] if a["asset"] == "USDY"), None)
paxg = next((a for a in result["assets"] if a["asset"] == "PAXG"), None)
if usdy:
    print(f"  USDY: origin={usdy['asset_origin']}, deployed={usdy['deployed_on_xlayer']}")
if paxg:
    print(f"  PAXG: origin={paxg['asset_origin']}, deployed={paxg['deployed_on_xlayer']}")
