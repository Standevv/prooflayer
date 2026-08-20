# ProofLayer

**Evidence → Verification → Intelligence → Action**
*for tokenized real-world assets on X Layer*

ProofLayer is evidence-grounded verification infrastructure for tokenized real-world assets, combining deterministic verification, market context, and AI-assisted interpretation.

---

## What ProofLayer Does

Users can **discover** tokenized assets on X Layer, **inspect** the evidence behind them, **verify** claims deterministically, **understand** trust context, and **act** through X Layer markets — all with clear separation between on-chain facts, verification results, and AI interpretation.

ProofLayer is not just:
- a market dashboard (markets exist, but verification is the core)
- an AI chatbot (AI explains, but does not decide)
- a token list (discovery exists, but evidence is the point)
- a proof-of-reserves page (backing claims are evaluated, not displayed as badges)

It connects **evidence** to **verification** and brings that verification context into **market decisions**.

---

## The Problem

A tokenized RWA may have:
- a deployed token contract
- liquidity on a DEX
- an APY on a lending protocol
- an issuer website claiming backing

None of those facts automatically prove:
- what actually backs the asset
- whether backing evidence is fresh
- whether a backing claim is independently supported
- whether the evidence source is trustworthy

**ProofLayer addresses that gap.**

---

## Why X Layer

X Layer Mainnet (chain 196) is the primary deployment target:

- **RWA/xStocks discovery** — bytecode-confirmed deployment evidence for 120+ tokenized assets discovered on X Layer Mainnet
- **Market integration** — Aave V3 and Uniswap V3 live on X Layer Mainnet
- **Wallet execution** — supply, borrow, swap via connected wallet
- **On-chain exploration** — contract verification, deployment evidence

Verification reads also use Ethereum Mainnet (chain 1) for cross-chain reference assets like USDY and PAXG.

---

## What's Live

| Component | Chain | Status |
|-----------|-------|--------|
| xStocks discovery & bytecode verification | X Layer Mainnet **196** | **LIVE MAINNET** |
| Asset registry | X Layer Mainnet **196** | **LIVE MAINNET** |
| Aave V3 market integration | X Layer Mainnet **196** | **LIVE MAINNET** |
| Uniswap V3 quote & execution | X Layer Mainnet **196** | **LIVE MAINNET** |
| Wallet connection & transaction flows | X Layer Mainnet **196** | **IMPLEMENTED** |
| USDY reference evidence | Ethereum Mainnet **1** | **REFERENCE EVIDENCE** |
| PAXG reference evidence | Ethereum Mainnet **1** | **REFERENCE EVIDENCE** |
| RVC deterministic verification | Pure Python | **DETERMINISTIC COMPUTATION** |
| Certificate registry | X Layer Testnet **1952** | **TESTNET DEMO INFRASTRUCTURE** |
| PolicyGate enforcement | X Layer Testnet **1952** | **TESTNET DEMO INFRASTRUCTURE** |
| DecisionLog audit trail | X Layer Testnet **1952** | **TESTNET DEMO INFRASTRUCTURE** |
| AI verification intelligence | Application layer | **NON-AUTHORITATIVE** |

---

## How It Works

ProofLayer evaluates tokenized asset claims through a deterministic pipeline:

```
Evidence Sources (Ethereum reads, attestations, xStocks API, Aave/Uniswap state)
        │
        ▼
Evidence Normalizer ──→ Provenance Engine
        │                    (dependency validation, trusted-root counting)
        ▼
Deterministic RVC ──→ PASS / FAIL / INDETERMINATE
        │               (no AI involved)
        ├──→ Certificate (anchored on-chain)
        └──→ PolicyGate (enforces eligibility)
              │
              ▼
AI Interpretation (explains, compares — read-only, cannot change results)
              │
              ▼
Markets / User Action (Explore, Earn, Borrow, Swap, Portfolio)
```

**Chain separation:**

| Layer | Chain |
|-------|-------|
| Evidence reads (USDY/PAXG) | Ethereum Mainnet (1) |
| RVC computation | Pure Python (no chain) |
| Certificate / PolicyGate | X Layer Testnet (1952) |
| Asset discovery / Markets | X Layer Mainnet (196) |

### Verification Results

| Result | Meaning |
|--------|---------|
| **PASS** | All required evidence present, fresh, and policy-compliant |
| **FAIL** | Evidence contradicts policy requirements |
| **INDETERMINATE** | Insufficient or stale evidence to determine pass/fail |
| **UNSUPPORTED** | No verification claim exists for this asset/claim pair |

**FAIL does not always mean "the asset is bad."** It may mean the evidence is stale, incomplete, or from an unverifiable source. ProofLayer preserves that uncertainty honestly.

Example: USDY currently returns **FAIL** with reason `STALE_ATTESTATION` — the most recent reserve attestation is older than the policy threshold. This does not prove USDY is unbacked; it means ProofLayer cannot verify the backing under this policy.

---

## Markets & Trust

ProofLayer's Markets feature provides real-time DeFi data on X Layer Mainnet:

| Tab | What It Shows |
|-----|---------------|
| **Explore** | Market assets with APY, APR, LTV, liquidity, trust badges |
| **Earn** | Aave V3 supply opportunities with real rates |
| **Borrow** | Aave V3 borrow parameters, collateral requirements, LTV |
| **Swap** | Uniswap V3 read-only quotes; user-signed execution when wallet connected |
| **Portfolio** | Wallet balances, Aave positions, health factor |

### The Trust Layer

Every market asset has a **trust badge** that shows ProofLayer verification coverage alongside market data.

**The integrity example — USDT0:**

| Field | Value |
|-------|-------|
| Contract | Deployed on X Layer Mainnet ✅ |
| Market data | Active — real Aave V3 supply/borrow rates ✅ |
| Backing verification | **UNVERIFIED** |

> **Deployment verification does not imply backing verification.**
>
> A token being deployed on X Layer does not mean ProofLayer has verified
> what backs it. USDT0 has real market data and a real contract, but
> ProofLayer has no asset-specific backing evidence for it — so it
> correctly reports UNVERIFIED.

This is a core integrity feature, not a limitation.

---

## AI Intelligence

ProofLayer includes two AI-assisted surfaces:

**Verification Intelligence** — investigate assets, compare evidence quality, understand verification results.

**Market Comparison** — compare two X Layer assets across market data and verification coverage.

### What AI Does

- Summarizes evidence and verification results
- Compares assets across verification and market dimensions
- Explains deterministic RVC results in natural language
- Grounds responses in ProofLayer tool outputs

### What AI Does NOT Do

- Create or fabricate evidence
- Change PASS / FAIL / INDETERMINATE results
- Approve or certify assets
- Override PolicyGate
- Execute transactions

> **AI explains. RVC decides. PolicyGate enforces.**

---

## Authority Model

Three layers of truth, always presented separately:

| Layer | What It Is | Examples |
|-------|-----------|----------|
| **ONCHAIN FACT** | Direct blockchain / protocol state | Contract bytecode, Aave APY, LTV, liquidity, token balances |
| **PROOFLAYER VERIFICATION** | Deterministic evidence evaluation | RVC result, evidence freshness, certificate state, PolicyGate outcome |
| **AI INTERPRETATION** | Non-authoritative explanation | Comparison narrative, risk summary, evidence explanation |

Raw authoritative values remain accessible in the UI. AI never replaces explicit verification states with synthetic trust scores.

---

## Supported Assets

### X Layer Native

Dynamically discovered xStocks — individual tokenized stocks/ETFs deployed on X Layer Mainnet via CREATE2 cross-chain deterministic deployment. Each asset is bytecode-verified on chain 196.

Current snapshot: 123 discovered xStocks. Examples: AAPLx, TSLAx, NVDAx, MSFTx, GOOGLx

### Market-Supported Assets

Assets with active Aave V3 and/or Uniswap V3 integration on X Layer Mainnet:

USDT0, USDG, WOKB, xBTC, xETH, xSOL, xBETH, xOKSOL

### Cross-Chain Reference Assets

| Asset | Origin | Evidence Chain | RVC Status |
|-------|--------|----------------|------------|
| **USDY** | Cross-chain reference | Ethereum Mainnet | FAIL (STALE_ATTESTATION) |
| **PAXG** | Cross-chain reference | Ethereum Mainnet | INDETERMINATE |

USDY and PAXG are **NOT deployed on X Layer**. They are verified via Ethereum mainnet evidence reads and serve as reference examples of ProofLayer's verification pipeline.

---

## Architecture

```
prooflayer/
├── contracts/              Solidity: CertificateRegistry, PolicyGate, DecisionLog, MarketAdapter
├── services/
│   ├── evidence/           Evidence adapters (Ondo, Paxos, xStocks, EVM, attestation)
│   ├── provenance/         Provenance engine, dependency validation
│   ├── rvc/                Deterministic verification (TreasuryBacking, GoldBacking)
│   ├── verification/       RWA asset registry, mainnet discovery
│   ├── markets/            Aave reader, Uniswap quotes, trust layer, aggregation
│   ├── agent/              AI verification agent, tool routing
│   ├── blockchain/         Certificate issuance, testnet signer
│   └── architecture/       System catalog, authority boundaries
├── apps/
│   ├── api/                FastAPI backend (read-only orchestration)
│   └── web/                Next.js frontend, wallet integration
├── data/                   Chain configs, demo fixtures, snapshots
├── tests/                  Python test suites
└── docs/                   Internal architecture and security documentation
```

---

## Quick Start

### Prerequisites

- **Python** 3.14 (validated locally)
- **Node.js** 18+ and npm
- **Git**
- A wallet extension (MetaMask, OKX Wallet) for wallet flows

### Backend

```bash
# Clone and enter the repository
git clone <repo-url> && cd prooflayer

# Create Python virtual environment
python -m venv .venv
.venv/Scripts/activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# Install Python dependencies
pip install -r requirements-agent.txt

# Configure environment
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux
# Edit .env — see Environment Variables below

# Start the API server (port 8010)
python scripts/run_agent_api.py
```

### Frontend

```bash
# In a second terminal
cd apps/web

# Install Node dependencies
npm install

# Start the development server (port 61442)
npm run dev
```

Open **http://localhost:61442** in your browser.

---

## Environment Variables

Configure in `.env` (copy from `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `ETHEREUM_MAINNET_RPC_URL` | Yes | Ethereum RPC for USDY/PAXG evidence reads |
| `AI_PROVIDER` | No | AI provider: `gemini`, `nvidia`, `openai` |
| `AI_API_KEY` | No | API key for the configured AI provider |
| `AI_MODEL` | No | Model identifier (default: `gemini-3.5-flash-lite`) |
| `XLAYER_TESTNET_RPC_URL` | No | X Layer Testnet RPC (default: public endpoint) |
| `DEPLOYER_PRIVATE_KEY` | No | Only needed for testnet certificate issuance |
| `PROOFLAYER_TESTNET_ISSUANCE_ENABLED` | No | Must be `true` to enable testnet certificate writes |

**Never commit `.env` or private keys.**

---

## Running Tests

```bash
# Trust integrity tests (28 tests)
python -m pytest tests/test_trust_integrity.py -v

# Markets tests (31 tests)
python -m pytest tests/test_markets.py -v

# Hardhat tests (34 tests)
npx hardhat test

# TypeScript check
cd apps/web && npx tsc --noEmit

# Production build
cd apps/web && npx next build
```

> **Note:** Some verification registry tests depend on the xStocks API and may timeout when upstream services are unavailable. This is a network dependency, not a test failure.

---

## Demo Walkthrough

### 1. Landing (5 seconds)

Open `/`. The hero reads: **"Verify what backs the asset."**

The pipeline is shown: Evidence → Verify → Certify → Enforce.

### 2. Asset Discovery (15 seconds)

Navigate to `/assets`. Current snapshot: 123 X Layer native xStocks + 2 cross-chain reference assets.

Click an xStock (e.g., AAPLx) → shows deployment verified on X Layer chain 196, bytecode confirmed.

### 3. Trust Distinction (20 seconds) — The Credibility Moment

Open USDT0 Market Trust badge.

Show:
- Market data: **real** — Supply APY, Borrow APR, LTV
- Backing verification: **UNVERIFIED**

> "ProofLayer refuses to turn deployment evidence into a backing claim."

### 4. Deep Verification (20 seconds)

Navigate to `/assets/usdy`.

Show:
- **Cross-chain reference** — NOT deployed on X Layer
- Ethereum mainnet evidence
- RVC: **FAIL** — STALE_ATTESTATION
- "Where authoritative evidence exists, ProofLayer evaluates it deterministically."

### 5. AI Intelligence (15 seconds)

Navigate to `/intelligence`. Click "Compare USDY and PAXG."

Show AI explanation with evidence grounding. Point to the Authoritative Results section.

> "AI interprets evidence. It does not create the evidence or control the verification result."

### 6. Markets (15 seconds)

Navigate to `/markets`. Show Explore tab with real X Layer Mainnet assets and live Aave/Uniswap data.

### 7. Close (10 seconds)

> "ProofLayer connects Evidence → Verification → Intelligence → Action
> for tokenized real-world assets on X Layer."

---

## Known Limitations

- **Certificate/PolicyGate infrastructure** is currently on X Layer Testnet (chain 1952) as demo infrastructure, not X Layer Mainnet
- **USDY and PAXG** are cross-chain reference assets — not deployed on X Layer
- **Some verification claims** are unsupported for X Layer market assets (e.g., USDT0 has no backing verification claim)
- **Upstream RPC/API availability** affects live evidence reads and market data
- **xStocks registry tests** are network-dependent and may timeout when the xStocks API is unavailable
- **AI is non-authoritative** — it explains verification results but cannot create, change, or override them
- **Evidence commitments** currently omit some provenance metadata fields (documented in architecture)

---

## Security & Trust Assumptions

- **No server-side wallet custody** — all transactions are signed by the user's connected wallet
- **AI cannot execute transactions** — the agent has no signing key and exposes no write tool
- **Deterministic verification is separated from AI** — RVC results are computed by code, not inferred by a model
- **Evidence source quality matters** — ProofLayer evaluates what it receives; it does not independently verify issuer identity
- **Market data may be short-lived** — cached with observed timestamps; never presented as permanently fresh
- **Testnet certificates are demo infrastructure** — not production-grade issuance or custody

---

## Roadmap

- Expand deterministic verification coverage for additional X Layer RWA asset classes
- Migrate certificate and PolicyGate infrastructure to X Layer Mainnet when production-ready
- Add canonical issuer evidence sources beyond current adapters
- Improve automated evidence freshness monitoring and alerting
- Expand market protocol coverage beyond Aave V3 and Uniswap V3
- Improve cross-chain certificate portability and verification inheritance

---

## License

See [LICENSE](LICENSE) for details.

---

<!-- screenshot: homepage -->
<!-- screenshot: verify -->
<!-- screenshot: markets-explore -->
<!-- screenshot: markets-earn -->
<!-- screenshot: trust-badge-usdt0 -->
<!-- screenshot: usdy-verification -->
<!-- screenshot: ai-comparison -->
<!-- diagram: architecture-overview -->
