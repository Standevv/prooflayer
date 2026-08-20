"""Verify /assets endpoint works correctly."""
import sys
sys.path.insert(0, ".")
from fastapi.testclient import TestClient
from apps.api.main import app

client = TestClient(app)

# Test /assets
r = client.get("/assets")
print(f"GET /assets: {r.status_code}")
d = r.json()
print(f"  total: {d['total']}")
print(f"  keys: {list(d.keys())}")
sample = d["assets"][0]
print(f"  sample fields: {list(sample.keys())}")

# Test filter
r2 = client.get("/assets?origin=CROSS_CHAIN_REFERENCE")
print(f"\nGET /assets?origin=CROSS_CHAIN_REFERENCE: {r2.status_code}")
d2 = r2.json()
print(f"  total: {d2['total']}")
print(f"  symbols: {[a['symbol'] for a in d2['assets']]}")

# Test search
r3 = client.get("/assets?search=TSLA")
print(f"\nGET /assets?search=TSLA: {r3.status_code}")
d3 = r3.json()
print(f"  total: {d3['total']}")
print(f"  symbols: {[a['symbol'] for a in d3['assets']]}")

# Test detail
r4 = client.get("/assets/AAPLx")
print(f"\nGET /assets/AAPLx: {r4.status_code}")
d4 = r4.json()
print(f"  symbol: {d4['symbol']}")
print(f"  deployment_verified: {d4['deployment_verified']}")
print(f"  framework_evidence type: {type(d4['framework_evidence']).__name__}")

# Test detail USDY
r5 = client.get("/assets/USDY")
print(f"\nGET /assets/USDY: {r5.status_code}")
d5 = r5.json()
print(f"  asset_origin: {d5['asset_origin']}")
print(f"  deployed_on_xlayer: {d5['deployed_on_xlayer']}")
print(f"  rvc_status: {d5['rvc_status']}")
