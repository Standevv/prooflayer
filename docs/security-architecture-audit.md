# ProofLayer Security & Architecture Audit

**Audit date:** 2026-08-10  
**Phase:** Production & Security Hardening — Phase 1 (audit only)  
**Scope:** Solidity contracts, deterministic verification, evidence adapters and provenance, certificate serialization/exploration, continuous verification, policy evaluation, FastAPI API, Next.js application and gateways, AI/MCP integration, deployment/configuration, tests, dependencies, reliability, and performance.  
**Method:** Static source review plus local build, test, typecheck, lint, dependency, and secret-hygiene checks. No deployment, transaction, live AI request, dependency installation, or source-code change was performed.

## EXECUTIVE SUMMARY

ProofLayer is a credible testnet MVP with unusually strong truthfulness conventions for a hackathon system: deterministic RVC outcomes are kept separate from model interpretation, `INDETERMINATE` is not silently promoted to `PASS`, live chain state is distinguished from fixtures in most detailed views, read-only tools do not expose a transaction primitive, and both Python and Solidity suites currently pass. The contracts are compact and understandable, certificate rejection is atomic, cached evidence is explicitly labeled, and chain/RPC failures generally fail closed.

It is **not production-ready**. The most serious issues are at trust boundaries rather than conventional memory-safety or injection boundaries:

1. The FastAPI and matching Next.js gateway surface has no authentication, authorization, rate limiting, request-size control, or cost budget. Anonymous callers can trigger local writes, repeated X Layer scans, and paid OpenAI work when AI is enabled.
2. `TreasuryBacking` does not filter evidence by asset and accepts future-dated attestations as fresh. This can produce a false `PASS` from mixed or temporally invalid evidence.
3. Provenance independence is counted from adapter-supplied `root_source_id` strings. It is useful metadata for curated adapters, but it is not cryptographic proof of independent sources.
4. `ProofLayerPolicyGate` checks caller-supplied expected asset/claim/policy values. It proves that the submitted certificate matches values the caller supplied; it does not by itself enforce a protocol-owned policy allowlist.
5. RVC evidence commitments omit material provenance and authenticity fields. A provenance change can leave the evidence root unchanged, while harmless list reordering can change it.
6. Registry, issuer, revoker, and decision-writer authority is centralized and lacks multisig, delay, pause, or two-step ownership transfer controls.
7. Decision-history reads use very large fixed block scans and tiny chunks. A normal certificate/detail request can create thousands of JSON-RPC calls and exceed gateway timeouts.
8. AI output validation checks a narrow set of contradictions and unsafe phrases, but does not prove that all narrative claims are grounded in tool output.

No **CRITICAL** finding was demonstrated under the current testnet/local MVP threat model. There are **8 HIGH**, **9 MEDIUM**, **3 LOW**, and **2 INFORMATIONAL** findings. Several HIGH items become critical to user trust if the service is presented as production verification infrastructure or if protected value is connected to the current gate without an integration-owned policy binding.

**Overall assessment:** suitable for a controlled, labeled hackathon demonstration after the P0 demo blockers are addressed; unsuitable for public production operation or value-bearing protocol enforcement without the P0/P1 program below.

## SYSTEM INVENTORY

### Components and responsibilities

| Layer | Primary implementation | Responsibility | Mutable state |
|---|---|---|---|
| Certificate registry | `contracts/ProofLayerCertificateRegistry.sol` | Store certificate summaries, issuer authorization, revocation, current usability | X Layer contract state |
| Enforcement demo | `contracts/ProofLayerPolicyGate.sol` | Reject unusable/mismatched certificates, increment demo action counter, record an allowed decision | X Layer contract state |
| Decision log | `contracts/ProofLayerDecisionLog.sol` | Store immutable-by-ID decision records from authorized writers | X Layer contract state |
| Certificate encoding | `services/rvc/certificate_serializer.py` | Canonicalize RVC output and derive Solidity-compatible identifiers | None |
| Treasury RVC | `services/rvc/treasury_backing.py` | Deterministically evaluate USDY/TreasuryBacking evidence | None |
| Gold RVC | `services/rvc/gold_backing.py` | Deterministically evaluate PAXG/GoldBacking evidence | None |
| Evidence adapters | `services/evidence/ondo.py`, `paxos.py`, `evm.py`, `normalizer.py` | Load issuer snapshots, normalize evidence, read Ethereum JSON-RPC | Local snapshots; external reads |
| Provenance | `services/provenance/engine.py` | Group normalized evidence into declared root sources and derive an evidence commitment | None |
| Chain/tool access | `services/mcp_server/tools.py`, `server.py` | Read evidence, verification, registry, PolicyGate, and DecisionLog state | None |
| AI verifier | `services/agent/verification_agent.py` | Use bounded read-only MCP tools and return a structured interpretation | External model call when enabled |
| Certificate explorer | `services/certificate_explorer/lookup.py` | Reconcile exported fixtures with current Registry/DecisionLog state | None |
| Evidence explorer | `services/evidence_explorer/service.py` | Present normalized evidence, provenance, and RVC results | None |
| Continuous verification | `services/continuous_verification/*` | Re-evaluate assets, compare snapshots, persist transitions | Local JSONL files |
| Policy Studio | `services/policy_studio/*` | Define versioned policies, evaluate current snapshots, persist history | Local JSONL files |
| API | `apps/api/main.py` | Expose monitoring, policy, AI, demo, protocol, certificate, and evidence operations | Indirect local writes and external reads |
| Web application | `apps/web/app`, `components`, `lib` | Dashboard, explorers, demo, monitoring, policy and developer UI | Browser state; server-side RPC/API reads |
| Next.js gateways | `apps/web/app/api/**/route.ts` | Validate limited inputs and proxy browser requests to FastAPI | Indirect backend effects |
| Deployment/scripts | `hardhat.config.ts`, `scripts/*.ts`, `scripts/*.py` | Testnet checks, deployment, demos, monitoring, development launch | Potential chain/local state when explicitly run |

### Data and control flow

```text
Issuer snapshots / Ethereum RPC / configured evidence
                         |
                         v
            Evidence adapters + normalizer
                         |
              +----------+----------+
              |                     |
              v                     v
       Provenance summary      Deterministic RVC
              |                     |
              +----------+----------+
                         v
              Certificate serialization
                         |
              authorized issuer transaction
                         v
       CertificateRegistry -> PolicyGate -> DecisionLog
                ^                ^              ^
                |                |              |
             read-only MCP / FastAPI / Next.js / browser
                         |
                  optional AI explanation
```

The intended authority ordering is: source evidence → deterministic RVC → serialized certificate → Registry usability → protocol-owned policy → action/decision. AI is explanatory and must never become an authority above deterministic RVC or on-chain state.

### External dependencies and services

- X Layer Testnet JSON-RPC, chain ID 1952, and explorer.
- Ethereum JSON-RPC for issuer/token evidence reads.
- Configured official issuer web resources and repository-cached snapshots.
- OpenAI API through `openai-agents` when explicitly configured and invoked.
- Node/Hardhat/ethers toolchain for contracts and scripts.
- Next.js/React frontend and FastAPI/Uvicorn backend.
- Local filesystem for exported fixtures, policy history, and monitoring history.

## THREAT MODEL

### Assets to protect

- Correctness of `PASS`, `FAIL`, and `INDETERMINATE` outcomes.
- Binding between an asset claim, policy, evidence commitment, certificate, and enforcement decision.
- Issuer, owner, deployer, and writer private keys.
- Integrity and availability of evidence/provenance inputs and cached snapshots.
- Integrity of Policy Studio and continuous-verification histories.
- Availability and cost budgets for RPC and AI services.
- Honest distinction among live state, fixture state, derived state, simulated protocol context, and unavailable state.
- User/integrator confidence that PolicyGate enforces the policy they intended.

### Adversaries and failure sources

- Anonymous internet client abusing public API/gateway endpoints.
- Malicious or compromised evidence provider, RPC provider, issuer website, or cached evidence file.
- Compromised registry owner, authorized issuer, DecisionLog owner/writer, deployer key, CI host, or application host.
- Integrator who incorrectly assumes the generic PolicyGate binds its own expected asset/claim/policy.
- Malicious tool content attempting prompt injection or misleading AI interpretation.
- Concurrent processes or crashes corrupting/truncating local append-only histories.
- Slow, unavailable, inconsistent, or metadata-poor RPC providers.
- Ordinary operator error, configuration drift, clock skew, and stale fixtures.

### Trust boundaries

| Boundary | Untrusted side | Trusted side | Required validation |
|---|---|---|---|
| Evidence ingestion | Web/RPC/file content | Normalized evidence | Authentic source identity, schema, asset binding, units, timestamp bounds, size limits |
| Provenance declarations | Adapter metadata | Independent-root count | Registered roots, authenticated identity, graph validation, collision prevention |
| RVC input | Evidence records and policy parameters | Verification result | Asset isolation, type/unit checks, duplicate handling, explicit clock semantics |
| Certificate issuance | Off-chain serializer/issuer | Registry | Issuer authorization plus on-chain field constraints and identifier binding |
| Protocol call | Caller-provided certificate and expectations | Protected action | Protocol-owned expected asset/claim/policy and action authorization |
| API | Anonymous HTTP client | RPC, filesystem, AI budget | Authentication, authorization, quotas, timeouts, body limits, safe errors |
| AI | Tool/source text and model output | User-facing explanation | Tool-content isolation, required calls, schema and full grounding validation |
| Local history | Multiple workers/processes/filesystem | Policy/monitoring decisions | Transactional storage, process-safe locking, corruption recovery, retention |

## TRUST ASSUMPTIONS

### Critical trust model

| Assumption | Current reality | Consequence if false | Production treatment required |
|---|---|---|---|
| Registry owner is honest and secure | Single address can authorize issuers and revoke any certificate | Complete certificate-control compromise | Multisig/timelock, monitored admin events, incident runbook, optional pause |
| Authorized issuer emits only valid certificates | Registry trusts submitted fields and arbitrary certificate ID | Malformed or false `PASS` can be usable | Constrained issuer role, on-chain ID recomputation or signed typed payload, field bounds, issuance monitoring |
| DecisionLog writers are honest | Any authorized writer can record arbitrary allowed/denied decisions | Spoofed audit trail | Gate-specific writer policy, origin/type binding, least privilege, monitoring |
| Configured evidence adapters correctly identify roots | Root identity is a normalized string in record metadata | Fake independent-source count | Root registry/signatures and verified dependency graph |
| Evidence root commits to all trust-relevant data | Current RVC hash covers a narrow field/value subset | Provenance/authenticity can change without commitment change | Versioned canonical commitment covering source and provenance fields |
| JSON-RPC is available and honest enough | RPC is operator-configured and responses are shape-checked, not independently reconciled | Stale/censored/incorrect state or outage | Multiple providers/quorum for critical reads, pin blocks, cache, bounded retries |
| Host filesystem is trusted and single-process | JSONL stores use process-local locks | Lost/interleaved/corrupt policy or monitoring history | Transactional database and migration/backup strategy |
| Server clock is correct | RVC/policy/certificate lifecycle use local wall clock plus chain timestamp | Freshness/expiry divergence | Injected UTC clock, NTP monitoring, explicit chain/off-chain semantics |
| UI authenticity labels are noticed | Detailed views label sources; overview can foreground historical fixture `PASS` | Judge/user mistakes fixture result for current result | Make source/status part of every result headline |
| AI is explanatory only | Design states this, but anonymous endpoint can call model and grounding is partial | Hallucinated assurance or cost abuse | Auth, quotas, required evidence/tool trace, claim-level grounding, prominent disclaimer |

## FINDINGS

### PL-SEC-001 — HIGH — API / Access Control

**Title:** Anonymous clients can trigger writes, expensive RPC scans, and paid AI work  
**Description:** FastAPI exposes all routes without authentication, authorization, rate limiting, per-user quotas, concurrency limits, or cost budgets. The Next.js route handlers mirror that surface without adding protection. `POST /monitoring/check`, `POST /policies`, and `POST /policies/{id}/evaluate` persist local state; `/agent/verify` may spend model budget; demo, protocol, certificate, and evidence operations may perform substantial RPC work.  
**Impact:** Anonymous disk growth, policy/history pollution, RPC/provider exhaustion, model-cost exhaustion, service denial, and disclosure of operational state.  
**Evidence/files:** `apps/api/main.py:83-313`; `apps/web/app/api/agent/verify/route.ts`; `apps/web/app/api/demo/run/route.ts`; `apps/web/app/api/monitoring/check/route.ts`; `apps/web/app/api/policies/route.ts`; `apps/web/app/api/policies/[policyId]/evaluate/route.ts`.  
**Exploit/failure scenario:** An attacker repeatedly calls policy evaluation and AI verification in parallel. Each call can read evidence, scan chain history, invoke a model, and append JSONL records until provider quotas, model budget, CPU, or disk are exhausted.  
**Recommended fix:** Put FastAPI behind authenticated service-to-service access; require user authentication and role checks at the web edge; add route-specific rate/concurrency limits, body limits, model token/cost budgets, idempotency keys, and global work queues; disable mutation/AI routes in public demo mode unless explicitly enabled.  
**Hackathon blocker:** **Yes** if the demo is internet-accessible with AI or mutable routes enabled.  
**Production blocker:** **Yes**.

### PL-VER-001 — HIGH — Verification Correctness

**Title:** TreasuryBacking can combine cross-asset evidence and accept future attestations as fresh  
**Description:** `evaluate_treasury_backing` creates a field map from every passed record without filtering `EvidenceRecord.asset` against `asset_id`. It computes `age = now - attestation_time` and only checks `age <= max_age`; a negative age from a future timestamp passes. Duplicate fields are silently last-wins, and several raw comparisons can throw on malformed types or mixed timezone awareness instead of producing a fail-closed result.  
**Impact:** A `PASS` may be produced for the wrong asset or from temporally impossible evidence. This undermines the core verification claim and any downstream certificate based on it.  
**Evidence/files:** `services/rvc/treasury_backing.py:47`, `:62`, `:107-165`; contrast with asset filtering and future-time handling in `services/rvc/gold_backing.py:265-301`, `:374-382`.  
**Exploit/failure scenario:** A caller supplies USDY identifiers with stronger evidence records labeled for another asset and a complete attestation timestamp one day in the future. The field map satisfies every predicate and the negative age is considered within the maximum age.  
**Recommended fix:** Filter strictly by normalized asset and claim; reject mixed assets and conflicting duplicate fields; parse typed values and units; require `0 <= age <= max_age`; normalize all timestamps to aware UTC; validate policy bounds; return deterministic `INDETERMINATE`/`FAIL` reason codes rather than throwing. Add regression and property tests.  
**Hackathon blocker:** **Yes** because it is directly demonstrable against the central verification story.  
**Production blocker:** **Yes**.

### PL-PROV-001 — HIGH — Provenance Integrity

**Title:** Independent evidence roots are self-asserted labels, not verified independence  
**Description:** The provenance engine groups records by normalized `root_source_id` and sets `independent_root_count` to the number of unique strings. It does not authenticate a root identity, ensure a `source_id` maps to only one root, validate that dependency parents exist, verify graph reachability, detect cycles, or prevent one adapter from minting multiple root labels.  
**Impact:** Policies that rely on a minimum number of independent roots can be satisfied by relabeling correlated or attacker-controlled evidence. The displayed provenance graph can overstate independence.  
**Evidence/files:** `services/evidence/normalizer.py:115-146`; `services/provenance/engine.py:33-43`, `:74-138`; `services/policy_studio/evaluator.py:232-237`.  
**Exploit/failure scenario:** A compromised adapter emits two otherwise related records with `root_source_id` values `auditor-a` and `auditor-b`. The engine reports two independent roots even if both records came from one response or one operator.  
**Recommended fix:** Maintain an allowlisted source/root registry with stable identities and authentication material; require signed manifests or pinned source commitments; enforce one source-to-root mapping; validate a directed acyclic dependency graph; define independence classes and correlation rules; expose `declared_root_count` separately until cryptographic verification exists.  
**Hackathon blocker:** **No**, provided the UI/docs clearly say “declared/curated roots” rather than cryptographically independent attestations.  
**Production blocker:** **Yes** for any policy using root count.

### PL-INT-001 — HIGH — Smart Contract Integration

**Title:** Generic PolicyGate does not bind a protocol-owned asset, claim, policy, or action  
**Description:** Both gate methods accept `expectedAssetId`, `expectedClaimType`, and `expectedPolicyId` from the same caller whose action is being evaluated. The contract proves equality with those caller-supplied values. `actionType` is likewise caller supplied and only logged. No protocol-owned allowlist or immutable configuration determines what should be accepted. The current contract increments a demo counter rather than executing or wrapping a real protocol action.  
**Impact:** An integrator that treats the generic gate as a complete authorization layer can accept any currently usable certificate whose own fields the caller repeats, even when it is unrelated to the intended market/action.  
**Evidence/files:** `contracts/ProofLayerPolicyGate.sol:40-55`, `:78-93`.  
**Exploit/failure scenario:** A lending adapter intends to require `USDY/TreasuryBacking/ConservativePolicy`, but forwards user arguments into the generic gate. The user submits another usable certificate and supplies that certificate’s own three identifiers; the equality checks pass.  
**Recommended fix:** Keep this contract explicitly labeled as a demo primitive, or create an integration adapter that stores immutable/governed expected asset, claim, policy, allowed actions, and optional actor/target/value constraints. The protected protocol must call that bound adapter atomically with its real state change. Add adversarial integration tests.  
**Hackathon blocker:** **No** if presented accurately as a demo/integration primitive; **yes** if claimed to generically secure arbitrary protocols as-is.  
**Production blocker:** **Yes**.

### PL-COMMIT-001 — HIGH — Evidence Commitment

**Title:** RVC evidence roots omit trust-relevant provenance and are order-dependent  
**Description:** The Treasury and Gold evidence hash functions commit primarily to narrow record content such as field/value. They omit material fields including asset, source type/identity, retrieval time, original content hash, root identity, dependency parents, evidence tier, simulation/authenticity flags, metadata, and commitment schema version. Input list order is not canonically sorted.  
**Impact:** An attacker or operator can change provenance/authenticity semantics without changing the evidence root. Conversely, equivalent evidence in a different order can produce a different certificate. Auditors cannot know exactly which trust assertions a root represents.  
**Evidence/files:** `services/rvc/treasury_backing.py:16-27`; `services/rvc/gold_backing.py:27-45`; normalized fields in `services/evidence/models.py` and `services/evidence/normalizer.py`.  
**Exploit/failure scenario:** A record’s declared root changes from an official issuer to an untrusted mirror while its field/value stays constant. The RVC evidence root remains unchanged and a certificate appears to commit to the same evidence set.  
**Recommended fix:** Define a domain-separated, versioned canonical evidence-manifest schema; include asset, claim, source/root identity, source type, content hash, observed/retrieved times, units, dependencies, authenticity/simulation flags, and policy-relevant metadata; sort deterministically; publish test vectors and migration rules.  
**Hackathon blocker:** **No**, if limitations are disclosed.  
**Production blocker:** **Yes**.

### PL-KEY-001 — HIGH — Key Management / Contract Administration

**Title:** Single-key administration has no delay, multisig, pause, or safe handover  
**Description:** Registry and DecisionLog use a single `owner`; ownership transfer is one-step; owner/issuer/writer roles are independent and can remain granted after ownership changes. The Registry owner can authorize issuers and revoke any certificate. A certificate’s original issuer can revoke it even after issuer authorization is removed. DecisionLog owner can authorize arbitrary writers, while an old owner remains a writer unless separately revoked.  
**Impact:** One compromised key can create trusted issuers/writers, revoke certificates, or spoof decision history. Operational handover can accidentally leave stale privileged roles. There is no circuit breaker or delayed recovery path.  
**Evidence/files:** `contracts/ProofLayerCertificateRegistry.sol:52-85`, `:133-144`; `contracts/ProofLayerDecisionLog.sol:34-70`.  
**Exploit/failure scenario:** Registry owner is phished, authorizes an attacker issuer, and that issuer registers a malformed usable PASS certificate. Even after ownership recovery, role cleanup may be incomplete.  
**Recommended fix:** Use multisig-controlled administration; two-step ownership acceptance; enumerate and document roles; explicitly revoke stale issuer/writer rights during transfer; consider timelock for grants, emergency pause for new issuance/use, monitored admin events, hardware-backed keys, rotation and incident procedures. Decide deliberately whether deauthorized issuers retain revocation power.  
**Hackathon blocker:** **No** for testnet.  
**Production blocker:** **Yes**.

### PL-PERF-001 — HIGH — RPC Performance / Availability

**Title:** Certificate and demo reads amplify into thousands of JSON-RPC calls  
**Description:** The Python decision-history helper scans up to 250,000 blocks in 100-block chunks: up to 2,500 `eth_getLogs` calls, grouped into 50 sequential HTTP batches. The frontend scans 100,000 blocks in 100-block chunks: 1,000 calls in 100 sequential concurrency rounds. Certificate, gate, and history queries repeat reads, have no result cache/indexer, and are invoked by dynamic pages and API operations.  
**Impact:** Normal user actions can hit 45–120 second gateway limits, exhaust RPC quotas, create self-inflicted denial of service, and make live demos appear broken. Anonymous access compounds the issue.  
**Evidence/files:** `services/mcp_server/tools.py:30`, `:523+`; `apps/web/lib/onchain.ts:68-102`, `:148-202`; `services/certificate_explorer/lookup.py:398`; `services/agent/demo_runner.py:382`; gateway timeouts under `apps/web/app/api/**/route.ts`.  
**Exploit/failure scenario:** Several users open certificate details or run the deterministic demo simultaneously. Each request performs thousands of log calls; RPC throttles; upstream calls time out; backend work may continue after the browser gateway aborts.  
**Recommended fix:** Start event scans at deployment block; use the largest provider-safe ranges; persist an indexed event cursor; query by indexed certificate topic; cache immutable records and recent chain state; coalesce duplicate reads; add deadlines/cancellation/retry budgets; avoid live chain reads during initial page rendering where possible.  
**Hackathon blocker:** **Yes** because it directly harms the core live demo.  
**Production blocker:** **Yes**.

### PL-AI-001 — HIGH — AI Grounding / Cost Control

**Title:** AI narrative is only partially grounded and can be anonymously cost-amplified  
**Description:** The agent is bounded and read-only, but output validation mainly checks explicit verification-result contradictions, a small unsafe-phrase set, and invented bytes32 values. It does not require a particular authoritative tool call, attach citations to every material claim, or reject other unsupported narrative assertions. Tool results may eventually contain adversarial external text without a strong instruction/data isolation rule. The public API can invoke the agent without a user or budget.  
**Impact:** A response can sound authoritative while including unsupported details, and attackers can consume model and RPC budget. Prompt-injected evidence could influence narrative even though deterministic RVC remains authoritative.  
**Evidence/files:** `services/agent/verification_agent.py:187+`, `:377-396`; `services/mcp_server/server.py`; `apps/api/main.py:237-251`; `apps/web/app/api/agent/verify/route.ts`.  
**Exploit/failure scenario:** Malicious source text tells the model to assert reserve safety. The model preserves the correct structured result but adds an unsupported confidence claim that does not match the narrow forbidden phrase checks. Repeated anonymous calls consume budget.  
**Recommended fix:** Require a deterministic verification tool result for any verification answer; generate conclusions from structured fields rather than free narrative; attach claim-level tool/source citations; treat tool text as untrusted data; enforce output allowlists and semantic consistency; use auth, per-user quotas, token limits, caching, and a kill switch.  
**Hackathon blocker:** **No** if deterministic mode is the default and AI is labeled/limited; public paid access remains a blocker.  
**Production blocker:** **Yes**.

### PL-STORE-001 — MEDIUM — Persistence / Concurrency

**Title:** JSONL history stores are neither process-safe nor transactionally recoverable  
**Description:** Monitoring and Policy Studio use `threading.RLock`, which only coordinates threads in one process. Operations perform read/check/append sequences, read entire files, and append with `fsync`, but have no inter-process lock, atomic record transaction, checksum chain, index, rotation, or recovery for a truncated line. A malformed line can make the entire history unavailable.  
**Impact:** Multiple Uvicorn workers or watch processes can interleave writes, produce duplicate/inconsistent transitions, lose uniqueness guarantees, or make all history unreadable after a partial write. Files grow without bound and every operation becomes slower.  
**Evidence/files:** `services/continuous_verification/store.py:27-133`; `services/policy_studio/store.py:50-168`; `services/continuous_verification/engine.py:539-540`; `scripts/watch_verification.py`.  
**Exploit/failure scenario:** Two workers evaluate the same previous snapshot concurrently, both append transitions, and one process is killed mid-line. The next read fails validation on the partial line and the monitoring endpoint becomes unavailable.  
**Recommended fix:** Move production state to a transactional database with uniqueness constraints, migrations, retention, backups, and row-level/advisory locking. For local mode, use a process lock, atomic temp-file recovery/checkpoint, quarantine malformed tail records, file-size limits, and compaction.  
**Hackathon blocker:** **No** for a single-process local demo.  
**Production blocker:** **Yes**.

### PL-CONTRACT-001 — MEDIUM — Smart Contract Validation

**Title:** Registry and PolicyGate accept semantically weak fields and wiring  
**Description:** Registry rejects only zero certificate ID, invalid result enum, duplicates, and non-increasing validity. It permits zero asset/claim/policy/evidence roots, zero root count/observed time, future observations, and arbitrarily long validity. It does not recompute the certificate ID. PolicyGate constructor checks nonzero addresses but not deployed code, interface compatibility, ownership/chain, or writer authorization.  
**Impact:** An authorized/compromised issuer can register a semantically malformed but usable PASS certificate. Deployment mistakes are permanent because gate references are immutable.  
**Evidence/files:** `contracts/ProofLayerCertificateRegistry.sol:89-128`, `:156-160`; `contracts/ProofLayerPolicyGate.sol:31-36`; `scripts/deploy-prooflayer.ts` performs post-deployment wiring checks but cannot prevent a separately deployed bad gate.  
**Exploit/failure scenario:** An issuer submits a PASS with zero evidence root and a ten-year lifetime; the Registry reports it usable. Or a gate is deployed against a lookalike registry and cannot be repaired.  
**Recommended fix:** Define explicit field invariants, maximum validity, future-skew tolerance, nonzero requirements, and certificate-ID derivation/signature binding. Deployment factory/config registry should validate bytecode/interface and writer authorization; add two-phase activation or replaceable governed configuration if appropriate.  
**Hackathon blocker:** **No**, assuming the current deployment script assertions and trusted issuer.  
**Production blocker:** **Yes**.

### PL-LOG-001 — MEDIUM — Audit Log Integrity

**Title:** DecisionLog proves writer authorization, not decision provenance or correctness  
**Description:** Any authorized writer can store any unique decision ID, certificate ID, actor, action type, and boolean. The log does not bind records to a registered gate, Registry certificate existence, computed decision ID, or a specific chain policy. Zero fields are allowed. Owner starts as a writer and writer lifecycle is separate from ownership lifecycle.  
**Impact:** Consumers may interpret an authorized but arbitrary record as evidence that PolicyGate evaluated a certificate. A compromised writer can pollute the audit trail.  
**Evidence/files:** `contracts/ProofLayerDecisionLog.sol:34-98`.  
**Exploit/failure scenario:** Owner authorizes an integration writer that emits `allowed=true` for an unrelated certificate/action. Explorers display it as an authoritative ProofLayer decision unless they independently identify the writer and schema.  
**Recommended fix:** Define writer-specific schemas or gate registry; record/derive writer and domain in identity; validate required nonzero fields; expose writer provenance; restrict each log deployment to narrow integrations; index and monitor writer changes; never label arbitrary writer records as PolicyGate decisions.  
**Hackathon blocker:** **No** for the single known gate.  
**Production blocker:** **Yes** if third parties rely on the log as an authoritative audit trail.

### PL-TIME-001 — MEDIUM — Time Semantics

**Title:** Expiry and future-time semantics diverge across on-chain and off-chain components  
**Description:** Registry usability is inclusive at the exact boundary (`block.timestamp <= validUntil`). Monitoring marks a certificate expired when `valid_until <= checked_at`. Policy attestation age clamps future timestamps to zero, so a future record is “satisfied.” Treasury also accepts a future timestamp. Local wall time and chain time are not reconciled.  
**Impact:** At boundaries, the frontend/policy layer can disagree with the contract. Clock skew or future evidence can change decisions and make reproducibility/auditing ambiguous.  
**Evidence/files:** `contracts/ProofLayerCertificateRegistry.sol:156-160`; `services/continuous_verification/engine.py:86-96`; `services/policy_studio/evaluator.py:298-305`; `services/rvc/treasury_backing.py:138-148`.  
**Exploit/failure scenario:** At exactly `validUntil`, Registry allows an action while monitoring reports EXPIRED. A future attestation appears zero days old and satisfies an institutional policy.  
**Recommended fix:** Publish one time model; use aware UTC everywhere; explicitly choose inclusive/exclusive validity; reject beyond a small configured future skew; inject clocks in all evaluators; record evaluation time and reference block timestamp; add exact-boundary tests.  
**Hackathon blocker:** **No**, except the Treasury future-time part covered by PL-VER-001.  
**Production blocker:** **Yes**.

### PL-API-002 — MEDIUM — HTTP Boundary Hardening

**Title:** HTTP surfaces lack production boundary controls and consistent cancellation  
**Description:** There is no explicit production CORS allowlist, request-body ceiling, trusted-host policy, security-header policy, or standardized sanitized error envelope. FastAPI exposes OpenAPI/Swagger/Redoc by default. Several responses surface truncated underlying provider errors. Most Next gateways have abort timers, but OpenAPI proxies do not; gateway abort does not guarantee cancellation of synchronous backend work.  
**Impact:** Increased attack surface, information disclosure, oversized-body memory pressure, cross-origin/configuration mistakes, hung work, and inconsistent client behavior. Absence of CORS is not an authorization mechanism because server-to-server and same-origin proxy calls remain possible.  
**Evidence/files:** `apps/api/main.py`; `services/continuous_verification/engine.py:68`, `:402-481`; `services/certificate_explorer/lookup.py:67`; `apps/web/app/api/openapi/route.ts`; `apps/web/app/openapi.json/route.ts`; `apps/web/next.config.ts`.  
**Exploit/failure scenario:** A caller sends a very large JSON body to a POST gateway or repeatedly opens an unbounded OpenAPI/upstream response. Internal provider messages are then rendered in monitoring UI.  
**Recommended fix:** Enforce body/header/time limits at reverse proxy and app; authenticated CORS/CSRF design; trusted hosts; CSP, HSTS, Referrer-Policy, Permissions-Policy and frame controls; disable/restrict docs in production; map internal exceptions to opaque IDs; propagate deadlines and cancellation; cap upstream response sizes.  
**Hackathon blocker:** **No** behind a controlled tunnel, but body/rate limits are required for a public demo.  
**Production blocker:** **Yes**.

### PL-UI-001 — MEDIUM — Frontend Truthfulness

**Title:** Overview framing can make historical fixture PASS look current  
**Description:** Detailed components repeatedly label demo fixtures and separate current Registry usability. However, the main page imports the historical USDY PASS fixture, asset exploration uses “Current state,” and prominent summary/result areas can foreground `PASS` before the user reads the smaller fixture explanation. The current deterministic USDY evidence evaluation is `INDETERMINATE`, so “fixture PASS” and “current verification” are materially different facts.  
**Impact:** Judges, integrators, or investors may conclude that ProofLayer currently verified USDY as PASS when the screen is showing an exported historical/demo fixture plus separate live state. This is a product-integrity risk even when the underlying data is not fabricated.  
**Evidence/files:** `apps/web/app/page.tsx:16-163`; `apps/web/components/prooflayer-demo.tsx:102-221`; `apps/web/components/asset-explorer.tsx:91`; clearer counterexamples in `apps/web/app/developers/page.tsx:203` and `apps/web/components/asset-detail.tsx:433-449`.  
**Exploit/failure scenario:** A screenshot captures “Verification PASS” without the lower fixture disclaimer and is shared as proof of a current verification.  
**Recommended fix:** Put `HISTORICAL DEMO FIXTURE — PASS` in the same visual unit and hierarchy as every PASS value; reserve “current” for a freshly evaluated timestamped result; show current RVC, certificate usability, and historical certificate result as three separate fields; include “as of” and authenticity in screenshots.  
**Hackathon blocker:** **Yes** for credibility if the overview is the judging entry point.  
**Production blocker:** **Yes**.

### PL-CFG-001 — MEDIUM — Configuration / Deployment Drift

**Title:** Network addresses and protocol constants are duplicated across layers  
**Description:** Deployed contract addresses, chain information, certificate IDs, result/lifecycle enums, and lookback constants appear in Python tools, frontend libraries, live scripts, fixtures, and documentation. There is no single versioned deployment manifest consumed by all layers.  
**Impact:** A redeployment or chain change can leave one surface reading a different contract, create false “not found” results, or cause the UI and backend to disagree. Drift is especially dangerous when fixture/live labels depend on exact address and certificate matching.  
**Evidence/files:** `services/mcp_server/tools.py`; `apps/web/lib/contracts.ts`; `apps/web/lib/onchain.ts`; `scripts/demo-prooflayer-xlayer.ts`; `docs/xlayer-testnet-deployment.md`; certificate fixture files.  
**Exploit/failure scenario:** Registry is redeployed and only the frontend address is updated. AI/backend reports the old registry while UI direct reads show the new registry. Both surfaces appear individually valid.  
**Recommended fix:** Generate a chain-scoped, checksummed deployment manifest from deployment output; include chain ID, deployment block, bytecode hash, addresses, ABI/version, and known writer wiring; import or generate typed constants for Python and TypeScript; validate at startup and CI.  
**Hackathon blocker:** **No** while current deployment is frozen.  
**Production blocker:** **Yes**.

### PL-MON-001 — MEDIUM — Monitoring Semantics / Storage Growth

**Title:** Every monitoring check creates a distinct snapshot and repeated work is not deduplicated  
**Description:** `checked_at` is included in the snapshot hash, so two identical observations at different times necessarily have different snapshot IDs and are appended. The check performs previous-read, external evaluation, transition computation, and append without a transaction. API callers can trigger checks more frequently than the local watch script’s 60-second minimum.  
**Impact:** Unbounded history growth, redundant external reads, noisy transitions under concurrent execution, and increasingly expensive O(n) history operations.  
**Evidence/files:** `services/continuous_verification/engine.py:378-511`, `:539-547`; `services/continuous_verification/store.py:103-133`; `scripts/watch_verification.py`; `apps/api/main.py:101-123`.  
**Exploit/failure scenario:** A client loops monitoring checks. Every unchanged observation is unique due only to time and is persisted, filling disk and slowing future reads.  
**Recommended fix:** Separate observation identity from check/run identity; deduplicate or compact unchanged state; enforce server-side schedules and minimum intervals; use idempotency keys; transact previous/current/transition writes; establish retention and metrics.  
**Hackathon blocker:** **No** in controlled use.  
**Production blocker:** **Yes**.

### PL-DEP-001 — MEDIUM — Dependency Security

**Title:** Root development dependency graph contains one high and one moderate advisory  
**Description:** `npm audit` reports a HIGH advisory in transitive `serialize-javascript`, a MODERATE advisory affecting direct development dependency `mocha`, and LOW advisories including `diff`, `elliptic`, and Hardhat-related transitive packages. The frontend audit is clean. No Python vulnerability database scan was possible because `pip-audit` is not installed; `pip check` only verifies dependency consistency.  
**Impact:** The reported HIGH issue can execute attacker-controlled behavior when vulnerable serialization paths process crafted objects, but the affected graph is development/test tooling rather than the deployed frontend runtime. Supply-chain and CI exposure remain. Python CVE status is unknown, not clean.  
**Evidence/files:** root `package-lock.json`, `package.json`; `apps/web/package-lock.json`, `apps/web/package.json`; `requirements-agent.txt`; local `npm audit --json`, `npm --prefix apps/web audit --json`, and `python -m pip check` results on the audit date.  
**Exploit/failure scenario:** CI/test infrastructure processes attacker-controlled test data through the vulnerable dependency, or a future dependency change promotes it into runtime use. A Python package advisory goes unnoticed because no vulnerability scan runs.  
**Recommended fix:** Update the root dependency graph to patched versions after compatibility testing; add lockfile dependency scanning and SBOM generation in CI; run `pip-audit` or an equivalent scanner in a controlled CI image; pin hashes for Python installs; document dev-only versus runtime exposure.  
**Hackathon blocker:** **No** for a controlled local build.  
**Production blocker:** **Yes** until runtime and CI supply-chain policies are established.

### PL-SER-001 — LOW — Certificate Serialization

**Title:** Home-grown Keccak and implicit naive-datetime handling increase maintenance risk  
**Description:** The serializer implements Keccak internally and treats naive datetimes as UTC. It has deterministic tests and Solidity-compatible output, but cryptographic primitives and ambiguous time interpretation are high-cost code to maintain. Certificate identity intentionally covers the on-chain summary, not compiler version, claim/policy version strings, reason codes, or full provenance manifest.  
**Impact:** A subtle future implementation or maintenance bug could create IDs incompatible with standard Ethereum tooling; upstream local-time data may be silently interpreted as UTC; semantic compiler changes can share the same on-chain summary identity.  
**Evidence/files:** `services/rvc/certificate_serializer.py`; serializer tests under `tests/test_certificate_serializer.py`.  
**Exploit/failure scenario:** A new platform/runtime exposes a corner-case mismatch in the internal Keccak code, producing a certificate ID different from ethers. Or an operator supplies local naive time and gets an unintended validity period.  
**Recommended fix:** Use a well-maintained Ethereum encoding/Keccak library already in the approved dependency set; require timezone-aware input; preserve cross-language golden vectors; add a separate versioned off-chain manifest commitment for compiler/policy/reasons.  
**Hackathon blocker:** **No**.  
**Production blocker:** **No** by itself.

### PL-TEST-001 — LOW — Test Coverage

**Title:** Passing suites omit several adversarial, invariant, concurrency, and end-to-end classes  
**Description:** Current tests are broad for deterministic happy/error paths, but there is no systematic property/fuzz testing, contract invariant suite, cross-process JSONL concurrency/crash test, admin-compromise/role-handover suite, full Python→certificate→X Layer→frontend end-to-end test, or frontend browser error-state suite. Treasury lacks mixed-asset and future-attestation regressions. Root provenance lacks spoof/cycle/collision tests. The root `npm test` script intentionally fails instead of aggregating project checks.  
**Impact:** Boundary bugs and regressions can survive while all current tests pass; contributors may run the wrong default command and assume no test suite exists.  
**Evidence/files:** `tests/*.py`; `test/*.ts`; `contracts/*.t.sol`; root `package.json`.  
**Exploit/failure scenario:** A future refactor changes exact expiry semantics or permits conflicting roots; unit tests remain green because only known fixtures are exercised.  
**Recommended fix:** Add the missing regression tests first, then property tests for RVC/canonicalization, Solidity invariants and admin scenarios, process/crash tests, API abuse tests, and browser E2E across unavailable/slow/malformed upstream states. Make one CI command run all suites.  
**Hackathon blocker:** **No**, after the two central correctness regressions are added.  
**Production blocker:** **Yes** as part of release criteria.

### PL-OPS-001 — LOW — Observability / Error Recovery

**Title:** Production health, telemetry, recovery, and UI error boundaries are incomplete  
**Description:** The system has useful status pages and explicit unavailable states, but no structured request/audit IDs, metrics for RPC/model latency and cost, queue depth, history growth, admin events, or source freshness SLOs. Unexpected server errors rely largely on framework defaults; no application-level Next.js `error.tsx` was found. Tests emit Starlette/httpx and `datetime.utcnow()` deprecation warnings.  
**Impact:** Operators may not distinguish provider outage, data drift, model failure, corrupt storage, or abuse quickly. Unexpected render errors can fall back to generic framework behavior. Deprecations may become breakages on upgrade.  
**Evidence/files:** `apps/api/main.py`; `apps/web/app` (no global `error.tsx`); current Python test warnings; monitoring/status services.  
**Exploit/failure scenario:** RPC latency rises gradually and certificate requests time out, but no per-stage latency or RPC-call-count metric identifies the log scan. A malformed JSONL tail produces generic 500 responses without a recovery signal.  
**Recommended fix:** Add structured logs with redaction/request IDs, OpenTelemetry/metrics, stage-level RPC call and latency budgets, source freshness alerts, admin-event monitors, backup/recovery drills, explicit UI error boundaries, and remove deprecations.  
**Hackathon blocker:** **No**.  
**Production blocker:** **No** alone, but required for sustainable operation.

### PL-SEC-002 — INFORMATIONAL — Secret Hygiene

**Title:** Repository secret handling is currently appropriate for the reviewed files  
**Description:** `.env` is ignored and was not read during this audit. `.env.example` contains placeholders. Hardhat reads the deployer key from the environment. A source scan excluding `.env`, generated data, dependencies, artifacts, and cache found no private-key PEM or OpenAI-style secret; the sole `DEPLOYER_PRIVATE_KEY=` match was an explicit `0xYOUR_TESTNET_DEPLOYER_PRIVATE_KEY` documentation placeholder.  
**Impact:** Positive control; it reduces accidental key disclosure but does not prove git history, CI logs, local machines, or external secret stores are clean.  
**Evidence/files:** `.gitignore`; `.env.example`; `hardhat.config.ts`; `docs/xlayer-testnet-deployment.md`.  
**Exploit/failure scenario:** Not applicable to current tracked/source content. A future contributor may still paste a key into logs or commit history.  
**Recommended fix:** Add pre-commit/CI secret scanning, protected branch rules, short-lived CI credentials where possible, dedicated testnet keys, and documented rotation. Scan repository history before public release.  
**Hackathon blocker:** **No**.  
**Production blocker:** **No**, assuming external key controls are added.

### PL-RES-001 — INFORMATIONAL — Resilience / Fail-Closed Behavior

**Title:** Most unavailable-source paths preserve uncertainty rather than fabricate trust  
**Description:** EVM RPC clients validate chain and response shapes, evidence/monitoring services record unavailable sources, AI is not used to override deterministic results, and Registry usability requires PASS/not-revoked/not-expired. Cached evidence is labeled and detailed certificate views withhold inferred live state on mismatch or outage.  
**Impact:** Positive safety property. Availability can be poor, but failures generally become `UNAVAILABLE`/`INDETERMINATE` rather than `PASS`/`ALLOW`. Exceptions remain around Treasury future dates, policy future-time clamping, and overview framing described above.  
**Evidence/files:** `services/evidence/evm.py`; `services/continuous_verification/engine.py`; `services/agent/verification_agent.py`; `services/certificate_explorer/lookup.py`; `contracts/ProofLayerCertificateRegistry.sol:156-160`.  
**Exploit/failure scenario:** An X Layer outage causes current Registry/PolicyGate fields to be unavailable while deterministic RVC information is preserved separately; the system does not synthesize live approval.  
**Recommended fix:** Preserve this invariant in tests and architecture decision records; add chaos tests for every dependency and prevent fallback data from occupying a live/current field.  
**Hackathon blocker:** **No**.  
**Production blocker:** **No**.

## API SURFACE CLASSIFICATION

Recommended production classification applies equally to direct FastAPI endpoints and the corresponding Next.js gateway routes.

| Endpoint group | Current behavior | Recommended exposure |
|---|---|---|
| `GET /health` | Reveals service/model availability | Public but sanitized, cached, rate-limited; separate deep health internally |
| `GET /developer/status` | Reveals RPC, contract and backend status | Private/internal or authenticated developer tenant |
| `GET /monitoring`, `/monitoring/{asset}` | Returns operational history and source errors | Authenticated; summary may be public after redaction/cache |
| `POST /monitoring/check` | Performs external work and writes history | Operator/service role only; scheduled/idempotent |
| `GET /policies*`, evaluation history | Reads local institutional policy/history | Tenant-authenticated and authorized |
| `POST /policies` | Writes local policy versions | Policy-admin role, CSRF/idempotency/audit log |
| `POST /policies/{id}/evaluate` | Performs work and writes evaluation history | Authenticated analyst/service role with quota |
| `POST /agent/verify` | Paid model plus tool/RPC work | Authenticated, strict quota/budget; disabled by default |
| `POST /demo/run` | Expensive deterministic/RPC workflow | Public only in isolated hackathon mode with rate/concurrency limits; otherwise authenticated |
| `POST /protocol/check` | Verification and integration simulation | Authenticated/rate-limited; clearly simulation-only |
| `GET /certificates*` | Fixture plus live registry/log reads | Public read-only only with caching, bounded scan and redacted errors |
| `GET /evidence*` | Evidence/provenance details and possible live reads | Public only for explicitly publishable evidence; authenticated for private sources |
| `/openapi.json`, `/docs`, `/redoc` | Full schema/docs | Publish a curated public schema or require developer auth; disable framework docs internally as appropriate |

## SMART CONTRACT AUDIT SUMMARY

### Positive properties

- Unauthorized issuers and writers are rejected.
- Certificate IDs and decision IDs cannot be inserted twice.
- Registry usability requires exactly PASS, not revoked, and not expired by its defined inclusive boundary.
- PolicyGate checks certificate usability before field equality and reverts atomically, so its counter/log do not persist on rejection.
- Gate references are immutable and decision IDs include gate, chain, execution number, certificate, actor, and action.
- DecisionLog writes and certificate revocations emit events.

### Required production changes

- Bind enforcement to protocol-owned expectations and the real protected state transition.
- Harden admin roles and deployment/wiring assurance.
- Define certificate field/ID invariants and validity limits.
- Establish DecisionLog provenance semantics per writer/integration.
- Add pause/recovery/governance design only after documenting precisely what can pause and who can recover.
- Add property/invariant, admin lifecycle, boundary-time, malformed-input, and malicious-wiring tests.

## VERIFICATION CORRECTNESS MATRIX

| Property | TreasuryBacking | GoldBacking | Assessment |
|---|---|---|---|
| Asset filtering | Missing | Present | Treasury HIGH issue |
| Future timestamp handling | Negative age passes | Returns indeterminate predicate | Treasury HIGH issue |
| Malformed timestamp handling | May throw | Deterministic indeterminate handling | Treasury needs parity |
| Numeric coercion/validation | Raw comparisons | Decimal-oriented guarded conversion | Treasury needs typed validation |
| Duplicate evidence handling | Last record wins | Last record wins | Both need conflict detection |
| Missing evidence | Early INDETERMINATE | Predicate-level semantics | Treasury can hide known contradictions |
| Explicit contradiction precedence | PASS only if all evaluated predicates pass | FAIL precedence is explicit | Gold stronger |
| Evidence root completeness | Incomplete/order-dependent | Incomplete/order-dependent | Shared HIGH issue |
| Clock injection | Partial/default wall time | Default wall time | Reproducibility improvement needed |
| Units/domain validation | Limited | Limited | Production blocker for value claims |

## RELIABILITY REVIEW

| Failure | Current response | Assessment / required action |
|---|---|---|
| X Layer RPC unavailable | Live fields become unavailable; deterministic result generally retained | Correct fail-closed direction; add bounded retries, provider failover and cancellation |
| Ethereum evidence RPC unavailable | Adapter/evaluation can become unavailable/indeterminate | Honest, but expensive calls need deadlines and cached last-known state with age |
| OpenAI unavailable | Agent request fails; deterministic paths remain available | Good separation; UI/API should return stable error code and retry guidance |
| Cached evidence missing/malformed | Direct route may 500; monitoring records unavailable | Fail closed, but add explicit typed source error and recovery guidance |
| Corrupt JSONL | Entire affected history read can fail | Add transactional store and tail recovery/quarantine |
| Certificate not found | Explorer separates fixture from live not-found | Good; preserve no-inference behavior |
| Backend unavailable | Next gateways return service errors | Good baseline; centralize error contract and UI boundary |
| Gateway timeout | Browser receives timeout, backend sync work may continue | Propagate deadlines/cancellation and bound backend stages |
| Malformed certificate ID/unsupported asset | Boundary validation rejects common invalid values | Good; add consistent schemas and property tests |
| Filesystem permission/disk full | Writes fail with service error | Fail closed; add readiness checks, alerting, retention and recovery |
| Concurrent workers | Process-local locks do not coordinate | Production blocker for JSONL stores |
| RPC returns undecodable revert metadata | Live demo helper now treats any thrown static call as rejection and confirms unchanged state | Appropriate provider-agnostic rejection proof |

## DEPENDENCY AUDIT

| Command | Result |
|---|---|
| `npm audit --json` | 14 advisories: 0 critical, 1 high, 1 moderate, 12 low; root graph is development tooling |
| `npm --prefix apps/web audit --omit=dev --json` | 0 advisories |
| `npm --prefix apps/web audit --json` | 0 advisories |
| `python -m pip check` | No broken requirements found |
| Python vulnerability audit | Not run: `pip-audit` is not installed and this phase prohibited installing dependencies |

Pinned Python application packages include `openai-agents==0.19.4`, `mcp==1.29.0`, `fastapi==0.141.1`, and `uvicorn==0.52.1`. Pinning improves reproducibility, but production builds should also pin hashes, produce an SBOM, scan the resolved environment, and define an update policy.

## TEST AND BUILD RESULTS

| Command | Result | Exact count / notes |
|---|---|---|
| `python -m unittest discover -s tests -v` | PASS | **255 tests**, 0 failures, 0 errors; Starlette/httpx and `datetime.utcnow()` deprecation warnings |
| `npx hardhat build` | PASS | No contracts needed recompilation |
| `npx hardhat test` | PASS | **24 tests**, 0 failures: Registry 11, DecisionLog 3, PolicyGate 10 |
| `npx tsc --noEmit` | PASS | Root TypeScript typecheck |
| `npm --prefix apps/web run build` | PASS | Next.js 16.3.0 production build |
| `npm --prefix apps/web run lint` | PASS | ESLint |
| `npm --prefix apps/web run typecheck` | PASS | Frontend TypeScript |

Python test distribution: agent tools 17; certificate explorer 14; certificate serializer 10; continuous verification 27; demo runner 13; developer platform 21; evidence explorer 20; evidence normalizer 9; EVM evidence 15; Gold RVC 14; Ondo adapter 16; Paxos adapter 18; policy integration 16; Policy Studio 32; provenance 9; Treasury RVC 4. Total: **255**.

The counts above are the current automated baseline, not a security certification. Notably absent are Treasury mixed-asset/future-time regressions, fuzz/property tests, cross-process persistence tests, contract invariants/admin-compromise cases, systematic frontend E2E/error-state tests, and a full Python-to-chain-to-browser release test.

## PERFORMANCE AUDIT

Estimates below count HTTP requests/batches where the implementation makes that visible; the number of individual JSON-RPC methods can be much larger.

| Flow | Approximate work | Bottleneck | User impact | Priority |
|---|---|---|---|---|
| Python `get_decision_history` | Up to 2,500 `eth_getLogs` calls in ~50 sequential HTTP batches | 250k lookback / 100-block chunks | Tens of seconds, quota exhaustion | P0 |
| Frontend latest-decision lookup | Up to 1,000 log calls in 100 sequential rounds | 100k lookback / 100-block chunks | Slow SSR/page reads and provider throttling | P0 |
| Full certificate lookup | Roughly 4 certificate reads + 2 status + ~53 history + 8 gate reads ≈ **67 HTTP rounds** in worst normal path | Repeated state plus history scan | 90s timeout risk | P0 |
| Deterministic USDY demo | Local evidence/RVC plus certificate/gate/history, roughly **65 HTTP rounds** | History scan and duplicate certificate reads | 45s gateway deadline is marginal | P0 |
| Policy/monitor/protocol current-state read | Roughly **12 RPC HTTP reads** before source fetches | Repeated registry and gate state | Moderate latency multiplied by public calls | P1 |
| Homepage | Two certificate states in parallel; roughly 9 RPC methods each | `force-dynamic`, no explicit provider timeout/cache | Every page request depends on RPC | P1 |
| JSONL overview/append | O(n) full-file reads; snapshot always new | No index/retention/dedup | Latency and disk grow continuously | P1 |
| Cached evidence + pure RVC/provenance | Local file reads and deterministic compute | Snapshot size | Fast path; preserve it | — |
| Static/fixture-only pages | Static data and assets | None material | Fast and demo-resilient | — |

Performance risks affect security because anonymous endpoints can multiply the expensive paths. Optimize by measurement: add per-request RPC method count, per-stage latency, cache hit ratio, provider error/throttle rate, model cost/tokens, JSONL/database size, and queue concurrency.

## P0 / P1 / P2 / P3 FIX PLAN

### P0 — before the next public hackathon demo

1. Fix Treasury asset filtering, future timestamps, duplicate/conflicting fields, typed/unit validation, and fail-closed exceptions; add regression tests.
2. Put every prominent PASS behind an equally prominent `HISTORICAL DEMO FIXTURE` label and separately show current RVC/usability.
3. Replace broad decision-history scans with deployment-block/topic-bounded queries and caching/indexing; ensure the live demo fits a measured deadline with margin.
4. Disable or protect public mutation and AI endpoints; add minimal edge authentication/rate/concurrency/body limits for any public deployment.
5. Document PolicyGate as a demo primitive and show that a real integration must bind protocol-owned asset/claim/policy/action values.
6. Label root count as curated/declared independence until root identity is authenticated.
7. Add a single release-check command or CI workflow that executes all 255 Python tests, 24 contract tests, builds, typechecks, lint, and dependency scans.

### P1 — before any production pilot or value-bearing integration

1. Implement authentication, tenant/role authorization, quotas, idempotency, CSRF/CORS design, body/deadline limits, and safe error contracts end to end.
2. Move monitoring/policy history to transactional storage with constraints, locking, recovery, retention, backups, and migrations.
3. Design and implement a versioned canonical evidence manifest/commitment with authenticated root identities and a validated provenance graph.
4. Deploy an integration-specific gate/adapter with protocol-owned policy bindings and atomic protected action execution.
5. Move contract administration to multisig/timelock, implement safe ownership handover/role cleanup, and publish key rotation/incident procedures.
6. Add certificate field/ID invariants, validity limits, wiring/bytecode checks, and adversarial Solidity tests; commission independent contract review.
7. Create one versioned deployment manifest consumed by Python, TypeScript, scripts, and CI.
8. Enforce AI grounding, tool-call requirements, source citations, prompt-injection controls, quotas, and a kill switch.
9. Resolve dependency advisories and add Node/Python/SBOM/secret/license scanning in CI.

### P2 — production reliability and scale

1. Add event indexer/cursor, immutable/current caches, RPC provider redundancy/quorum where justified, and reorg handling.
2. Add full observability: structured/redacted logs, traces, per-stage metrics, SLOs, cost alerts, admin-event alerts, and dashboards.
3. Add chaos/recovery testing for RPC, evidence sources, AI, filesystem/database, partial responses, reorgs, clock skew, and corrupt data.
4. Add property-based RVC/provenance/canonicalization tests, Solidity invariants/fuzzing, API abuse tests, and full browser E2E.
5. Establish data classification, retention, privacy, evidence publication/entitlement, and incident disclosure policies.

### P3 — maturity and governance

1. Formalize certificate/provenance specifications and publish cross-language vectors.
2. Add independent audits, reproducible builds, signed releases/deployments, and monitored bytecode verification.
3. Define governance for source registries, compiler/policy upgrades, revocations, disputes, and emergency actions.
4. Benchmark at target scale and establish provider/model capacity plans.

## TOP 10 FIXES

1. Correct Treasury cross-asset and future-attestation acceptance.
2. Authenticate and rate-limit all costly or mutating endpoints; disable anonymous AI.
3. Bind real integrations to protocol-owned expected asset/claim/policy/action values.
4. Replace broad log scans with deployment-bounded indexed/cached event access.
5. Redefine evidence commitments as versioned canonical manifests covering provenance.
6. Authenticate root identities and validate provenance dependencies before counting independence.
7. Move owner/issuer/writer control to safe multisig/timelock/role-handover operations.
8. Replace JSONL production history with transactional, bounded, recoverable persistence.
9. Make fixture/current/live authenticity impossible to miss in every result headline.
10. Enforce claim-level AI grounding and end-to-end cost/tool budgets.

## HACKATHON BLOCKERS

- PL-VER-001: central Treasury verification can be made to PASS with cross-asset/future evidence.
- PL-PERF-001: live certificate/demo RPC fan-out can exceed demo timeouts and provider quotas.
- PL-UI-001: overview framing can be read as a current PASS when it is a historical fixture.
- PL-SEC-001: if publicly hosted, anonymous costly/mutable routes can disrupt the demo or spend model budget.
- PL-INT-001 becomes a blocker only if the project claims that the generic current gate is a complete arbitrary-protocol authorization layer.

## PRODUCTION BLOCKERS

- All eight HIGH findings.
- Transactional persistence and process-safe concurrency (PL-STORE-001).
- Contract field/wiring constraints and DecisionLog provenance (PL-CONTRACT-001, PL-LOG-001).
- Unified time semantics (PL-TIME-001).
- HTTP boundary hardening and truthful result hierarchy (PL-API-002, PL-UI-001).
- Unified deployment configuration (PL-CFG-001).
- Monitoring retention/dedup/scheduling (PL-MON-001).
- Dependency/SBOM/vulnerability policy and the missing adversarial release test program (PL-DEP-001, PL-TEST-001).

## FINAL SCORECARD

Scores reflect the audited repository on 2026-08-10, not future fixes or intended architecture.

| Category | Score (0–10) | Rationale |
|---|---:|---|
| Smart contract security | **6** | Compact fail-closed core, but centralized roles, weak semantic field constraints, and generic caller-bound expectations |
| Verification correctness | **5** | Gold path is defensive; Treasury cross-asset/future-time issues directly threaten correctness |
| Evidence/provenance integrity | **3** | Useful normalization and labels, but root independence is asserted and commitments omit provenance |
| API/application security | **3** | Validation exists, but no auth, authorization, rate/cost/body controls, or production edge policy |
| AI safety/grounding | **5** | Read-only bounded tools and deterministic authority are good; narrative grounding and public cost controls are incomplete |
| Reliability/data integrity | **4** | Fail-closed outage semantics are good; JSONL concurrency/recovery and time divergence are weak |
| Performance/scalability | **3** | Local deterministic paths are fast; normal live reads can fan out into thousands of RPC calls |
| Frontend truthfulness/robustness | **6** | Strong detailed authenticity labels; overview hierarchy and systematic error-boundary/E2E coverage need work |
| Test/release maturity | **6** | 279 automated Python+contract tests and clean builds; important adversarial/invariant/E2E classes are absent |
| Operations/governance | **3** | Testnet deployment checks exist; production key, observability, incident, governance, and recovery controls do not |
| Investor/integrator diligence readiness | **5** | Architecture is explainable and demonstrable, but trust and production limitations must be disclosed precisely |

**SECURITY SCORE: 4/10**  
**PRODUCTION READINESS SCORE: 2/10**  
**HACKATHON READINESS SCORE: 7/10**

The MVP can make a strong hackathon case after the P0 corrections because it already demonstrates deterministic outcomes, explicit uncertainty, provenance modeling, live certificate enforcement, and read-only integration tooling. Production use must wait until correctness boundaries, authenticated provenance, protocol-owned enforcement policy, access control, persistence, key governance, and RPC scale are materially redesigned and independently tested.
