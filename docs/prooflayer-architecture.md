# ProofLayer architecture

This document describes the architecture implemented in this repository and the production architecture it is intended to become. It is deliberately explicit about which parts are current, partial, reference-only, or target state.

The machine-readable companion is `services/architecture/catalog.py`, schema `prooflayer-architecture-v1`. That catalog and this document describe repository and manifest truth; neither is a live-state oracle. Current verification results must come from an RVC run, and current chain state must come from read-only X Layer calls.

## Authority boundary

ProofLayer's trust model is:

```text
AI INVESTIGATES AND EXPLAINS
RVC DECIDES PASS / FAIL / INDETERMINATE
POLICYGATE ENFORCES CERTIFICATE ELIGIBILITY
```

The model, frontend, and operator are not verification authorities. They cannot upgrade `FAIL` or `INDETERMINATE` to `PASS`, choose authoritative certificate fields, issue or sign a certificate through an AI tool, bypass PolicyGate, or submit an unauthorized transaction.

Three facts must always be presented separately:

| Fact | Authority |
| --- | --- |
| **CURRENT RVC RESULT** | A current deterministic RVC execution over the evidence supplied to it |
| **HISTORICAL CERTIFICATE RESULT** | The result recorded by an earlier certificate |
| **CURRENT CERTIFICATE USABILITY** | Registry existence, stored result, revocation state, and expiry at the current block time |

At this repository checkpoint, the current USDY/TreasuryBacking verification is `FAIL` with `STALE_ATTESTATION`. The repository-known historical USDY `PASS` certificate is a separate, expired artifact and is not currently usable. Static documentation must not be used to answer a later current-state question; re-run the RVC and read the Registry.

## End-to-end flow

The conceptual verification and enforcement flow is:

```text
External RWA sources
        |
        v
Source-specific evidence adapters
        |
        v
Normalized EvidenceRecord values
        |
        +----> deterministic evidence commitment
        +----> provenance graph and trusted-root analysis
        |             |
        +-------------+
        v
Deterministic RVC
        |
        +---- FAIL / INDETERMINATE --------------------------> STOP
        |
        +---- authoritative, non-simulated, unexpired PASS
                       |
                       v
              Certificate serialization
                       |
                       v
              Authorized issuance boundary
                       |
                       v
              TypeScript / Hardhat signer
                       |
                       v
              X Layer CertificateRegistry
                       |
                       v
              PolicyGate reference primitive
                       |
                       v
              DecisionLog successful action
                       |
                       v
              Future protected X Layer application
```

The implementation computes commitment and provenance as part of RVC execution rather than as independent mandatory network services. The diagram expresses the trust/data relationship, not a claim that every box is separately deployed.

The parallel intelligence path is read-only:

```text
User question -> ProofLayer agent -> bounded read-only tools
              -> evidence / RVC / architecture / X Layer facts
              -> server-rendered grounded explanation
```

That path never enters the signer boundary. The provider may select tools, but its free-form prose is not returned as factual system state; the server renders the public explanation from successful tool records.

## Current implementation map

| Layer | Current repository implementation | Current status and boundary |
| --- | --- | --- |
| Evidence adapters | `services/evidence/ondo.py`, `paxos.py`, `evm.py`, `usdy_attestation.py` | Established USDY/PAXG path; mixed live, cached, and snapshot inputs |
| New live-evidence subsystem | `services/evidence/live/` | Partial parallel subsystem; not yet the primary FastAPI/agent/explorer/monitoring path |
| Normalization | `services/evidence/normalizer.py`, `services/rvc/models.py` | Shared `EvidenceRecord` model |
| Evidence commitment | `services/evidence_commitment.py` | Deterministic, order-independent `pl-evidence-v1` commitment with disclosed omissions |
| Provenance | `services/provenance/engine.py`, `models.py` | Dependency validation and curated trusted-root counting |
| Deterministic verification | `services/rvc/treasury_backing.py`, `gold_backing.py` | Authority for USDY/TreasuryBacking and PAXG/GoldBacking |
| Serialization | `services/rvc/certificate_serializer.py` | Canonical human and Solidity summaries and deterministic ID generation |
| Issuance control | `apps/api/main.py`, `services/blockchain/issuance_control.py`, `issuer.py` | Disabled by default; authenticated, audited, idempotent controlled-testnet boundary |
| Signer bridge | `scripts/issue-certificate.ts`, `hardhat.config.ts` | TypeScript/Hardhat transaction path; not exposed to AI |
| X Layer contracts | `ProofLayerCertificateRegistry.sol`, `ProofLayerPolicyGate.sol`, `ProofLayerDecisionLog.sol` | Canonical manifest declares X Layer Testnet deployment; live status requires RPC reads |
| Monitoring | `services/continuous_verification/` | Local/manual in parts; no production scheduler or durable workflow engine |
| Explorers and policy tooling | `services/certificate_explorer/`, `evidence_explorer/`, `policy_studio/` | Operational/read surfaces plus local off-chain policy evaluation; not authority |
| Protocol integration | `services/policy_integration/` | Read-only `ACCEPT`/`REJECT`/`REVIEW_REQUIRED` simulation, not a protected action |
| Backend | `apps/api/main.py` | FastAPI orchestration for evidence, RVC, agent, certificate, monitoring, policy, developer, and issuance APIs |
| Frontend/BFF | `apps/web/app/` | Next.js UI and same-origin routes; selected server paths also make direct read-only X Layer calls |
| AI/tooling | `services/agent/`, `services/mcp_server/`, `services/architecture/` | Replaceable model provider plus nine bounded read-only tools; no signer/write tool |

## Evidence, normalization, and commitment

Evidence authenticity is a property of each source interaction, not a marketing label:

- `LIVE`: fetched from the external source or chain for the current request.
- `CACHED`: previously fetched external data reused with retrieval metadata.
- `SNAPSHOT`: repository-held point-in-time source data.
- `FIXTURE`: purpose-built deterministic test/reference data.

The established USDY path composes repository evidence with an Ethereum mainnet read when available and uses the cached attestation input; it falls back conservatively when RPC data is unavailable. The established PAXG path is repository-snapshot based. The newer `services/evidence/live/` collector, adapters, and cache are useful target work but are not yet the universal application evidence path. In particular, repository presence does not make those adapters live in every request.

`EvidenceRecord` currently contains:

```text
source_id, source_type, root_source_id, asset, field, value, unit,
observed_at, retrieved_at, content_hash, dependency_parent_ids,
evidence_tier, simulation, metadata
```

Normalization prevents every RVC from having to understand every source-specific payload.

The `pl-evidence-v1` commitment includes the asset and claim plus each normalized record's asset, source/root/type, field/value/unit, observation and retrieval timestamps, content hash, evidence tier, and simulation flag. It intentionally avoids putting entire documents on-chain. Its present trust limitation is important: `dependency_parent_ids` and arbitrary `metadata` are not committed. A future commitment version must include every dependency or metadata value on which verification trust depends.

## Provenance

`services/provenance/engine.py` validates declared dependencies and counts curated trusted root-source domains. Multiple mirrors of one attestation should therefore count as one root, not several independent sources.

The engine reports unknown roots, missing parents, duplicate `(source_id, field)` evidence keys, self-parenting, and dependency cycles. Current limitations are:

- independence is a curated classification, not cryptographic proof of organizational independence;
- neither current RVC binds provenance `validation_ok` or validation errors into its verdict;
- a root count may include contextual evidence not directly consumed by every predicate; and
- source registries in the established and newer live subsystems are not yet consolidated.

## Deterministic RVCs

The implemented RVCs use three-valued results: `PASS`, `FAIL`, and `INDETERMINATE`.

USDY/TreasuryBacking (`default-treasury-policy` v1.0) evaluates:

- `asset_class == TOKENIZED_TREASURY`;
- underlying asset value covers outstanding token value;
- collateralization ratio is at least 1.00;
- treasury exposure meets the policy minimum (0.95 by default);
- attestation age is within the policy maximum (24 hours by default);
- issuer contract is verified; and
- on-chain supply exists.

If a required USDY field is absent, the verifier returns `INDETERMINATE` before evaluating the remaining predicates. Once every required field is present, any emitted false predicate produces `FAIL`; otherwise the result is `PASS`.

PAXG/GoldBacking (`default-gold-policy` v1.0) evaluates tokenized-gold asset class, LBMA Good Delivery reserve asset, the one-fine-troy-ounce relationship and allocated-gold coverage, backing ratio, reserve-attestation existence/freshness, and issuer-contract verification. An explicit contradiction produces `FAIL`; missing, malformed, future, or stale data produces `INDETERMINATE` unless another predicate is false.

Both current verifiers set certificate `observed_at` to RVC execution time and `valid_until` to one hour later. Source observations retain their own timestamps. RVC outputs also preserve predicate results, reason codes, evidence root, independent-root count, and the simulation flag.

## Certificate representation and issuance

The off-chain certificate model contains the human-readable asset/claim/policy versions, result, predicate results, reason codes, evidence root, independent-root count, RVC observation and expiry times, compiler version, and simulation flag.

The Solidity summary contains:

```text
certificateId, assetId, claimType, policyId, evidenceRoot,
observedAt, validUntil, independentRootCount, result
```

Asset, claim, and policy strings are whitespace-trimmed and Unicode NFC-normalized, remain case-sensitive, and are then Keccak-hashed to `bytes32`. `certificateId` is derived from the canonical Solidity summary fields. Predicate details and reason codes remain off-chain. The Registry stores the supplied summary but does not independently recompute its ID.

`POST /certificates/issue` is a controlled X Layer testnet boundary:

- issuance is disabled unless `PROOFLAYER_TESTNET_ISSUANCE_ENABLED` is explicitly true;
- the enabled route requires bearer operator authorization and an operator identity;
- a valid idempotency key and request identity are mandatory;
- an append-only local audit record is written before a signer process can start;
- duplicate work is coalesced and signer execution is serialized within one API process;
- the server reloads evidence and re-runs the deterministic RVC;
- only a current, non-simulated, unexpired `PASS` can proceed; and
- result, evidence root, timestamps, root count, predicates, and reasons are server-derived, so a caller cannot extend RVC validity or supply certificate truth.

Python passes validated certificate JSON over stdin to the TypeScript/Hardhat child process. Python does not sign, and the AI has no route or tool into this path. This is useful logical separation for controlled testnet development, but the child shares the development host and environment. It is not production KMS/HSM isolation, distributed idempotency, durable transaction reconciliation, multisig governance, or production IAM.

## X Layer state and enforcement

The canonical deployment manifest is `data/xlayer-testnet.json`. It identifies X Layer Testnet, chain ID `1952`, and the configured CertificateRegistry, PolicyGate, and DecisionLog deployments. Consumers must read addresses from that manifest/config rather than copying them into explanatory content. A manifest entry is not a fresh proof of RPC reachability, bytecode, wiring, block height, certificate usability, or events; those require read-only chain calls.

The CertificateRegistry stores a certificate summary, issuer, and revocation state. Current usability is equivalent to existence, stored `PASS`, not revoked, and `block.timestamp <= validUntil`. The owner authorizes issuers; the owner or original issuer may revoke. Its current ID/invariant and governance design is testnet-grade.

PolicyGate is a reference enforcement primitive. It checks Registry usability and equality with the asset, claim, and policy expectations supplied for an action. A successful `executeVerifiedAction` increments a counter and appends an allowed DecisionLog record. A rejection reverts atomically, so an ordinary denial record does not survive that transaction. The standalone DecisionLog also permits authorized writers to append unique allowed or denied records, which means writer provenance matters.

No lending, vault, mint, transfer, treasury, or settlement state transition is currently protected by the gate. The agent's `get_policygate_state` tool derives a conservative read-only `ALLOWED`/`BLOCKED` assessment from Registry fields and configured wiring; it does not call `validateAction`, execute a gate action, or submit a transaction. There is no current on-chain `WARN`; off-chain protocol simulation's `REVIEW_REQUIRED` is a separate concept.

## Application and deployment topology

The predominant read path is Browser -> Next.js -> same-origin Next API/BFF -> FastAPI -> Python services. Selected Next.js server components/routes also perform direct read-only X Layer RPC access, so the worktree is not exclusively a BFF-to-FastAPI topology.

FastAPI orchestrates evidence, deterministic verification, the AI agent, certificate reads, monitoring, developer status, policy operations, protocol simulation, and controlled issuance. Policy Studio, monitoring, and issuance audit storage are local JSONL in the current build. Certificate browsing starts with repository-known IDs and supports direct lookup, but it is not a complete chain-wide Registry index.

Health signals are intentionally distinct: frontend/BFF reachability, FastAPI health, model-provider readiness, deterministic verifier truth, and X Layer RPC/contract state. One signal cannot prove the others.

When issuance is explicitly enabled, the write topology is authenticated FastAPI request -> Python authorization/RVC/audit controls -> TypeScript/Hardhat signer -> X Layer Testnet Registry. The provider path is FastAPI agent -> replaceable external model provider -> local read-only tools and never joins the signer path.

## AI and read-only architecture knowledge

Provider choice is replaceable infrastructure, not part of verification authority. The canonical provider abstraction is named by `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY`; provider-specific compatibility variables may exist, but secret values must never enter prompts, responses, traces, client-side variables, or documentation.

The application agent instantiates `ProofLayerTools` directly and executes its tools in the FastAPI process. It does not start an MCP subprocess for each investigation. `services/mcp_server/server.py` is a separate stdio MCP facade over the same read-only class for external MCP clients.

The nine exposed tools are:

- `discover_assets`
- `get_system_architecture`
- `get_asset_metadata`
- `get_evidence`
- `analyze_provenance`
- `verify_claim`
- `get_certificate_state`
- `get_policygate_state`
- `get_decision_history`

`get_system_architecture(topic, audience)` returns the versioned `prooflayer-architecture-v1` catalog and supports bounded repository-grounded architecture answers. Its response mode is `ARCHITECTURE_EXPLANATION`. Supported topics cover overview, evidence, provenance, RVC, certificates, issuance, X Layer, enforcement, monitoring, application surfaces, AI, deployment, limitations, and mainnet. Audiences cover general, Web2, Web3, engineering, investor, X Layer judge, security reviewer, RWA issuer, and protocol integrator explanations.

Architecture context is static repository knowledge. When a question asks whether USDY passes now, whether a certificate is usable now, whether bytecode exists now, or what the latest decision was, the agent must call the relevant runtime read tool rather than treating the catalog as evidence.

## Current versus target architecture

| Current testnet MVP | Target state, not currently implemented |
| --- | --- |
| X Layer Testnet, chain ID 1952 | Audited and governed mainnet pilot |
| Manifest-declared Registry, PolicyGate, and DecisionLog | Hardened governance, upgrade/change controls, and deployment attestations |
| Deterministic USDY and PAXG RVCs | More assets, claims, and versioned policy governance |
| Mixed live, cached, snapshot, and fixture evidence | Broader authenticated live evidence with production availability controls |
| Curated provenance graph analysis | Cryptographically stronger provenance and uniform fail-closed malformed-graph semantics |
| `pl-evidence-v1` commitment | Versioned commitment of all trust-relevant dependency and metadata fields |
| Controlled single-host testnet issuance | Isolated KMS/HSM or governed relayer/multisig signing with production IAM |
| Process-local idempotency and JSONL audit | Durable transactional idempotency, reconciliation, reorg handling, and audit storage |
| Reference PolicyGate action | Integration-specific, atomically protected downstream X Layer action |
| Known-ID certificate browsing | Durable full-chain indexing and event ingestion |
| Local/manual monitoring in parts | Scheduled, durable production monitoring and incident response |

For a non-Web3 audience, the shortest accurate model is **DATA -> CHECK RULES -> SAVE RESULT -> ENFORCE RESULT**, with AI observing and explaining alongside it. For technical and diligence audiences, the implementation paths and limitations above are part of the explanation, not optional caveats.

## Canonical sources of truth

- Architecture catalog: `services/architecture/catalog.py`
- Evidence schema: `services/rvc/models.py`
- Evidence commitment: `services/evidence_commitment.py`
- Provenance behavior: `services/provenance/engine.py`
- RVC predicates: `services/rvc/treasury_backing.py`, `services/rvc/gold_backing.py`
- Certificate serialization: `services/rvc/certificate_serializer.py`
- Issuance controls: `services/blockchain/issuance_control.py`, `services/blockchain/issuer.py`
- Contract semantics: `contracts/*.sol`
- Network and deployment identifiers: `data/xlayer-testnet.json`, `services/xlayer/config.py`
- API routes: `apps/api/main.py`
- Application agent/tool behavior: `services/agent/verification_agent.py`, `services/mcp_server/tools.py`, `services/mcp_server/server.py`

When these sources disagree with prose, code and canonical runtime reads take precedence. Target architecture must never be narrated as current implementation.
