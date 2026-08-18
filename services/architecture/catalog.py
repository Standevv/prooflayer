"""Versioned, repository-grounded ProofLayer architecture knowledge.

This module is deliberately data-only and read-only.  It gives the AI and MCP
clients a bounded description of what the current repository implements, where
the implementation lives, and which capabilities remain target architecture.
Deployment identifiers come from the canonical X Layer manifest through
``services.xlayer.config`` rather than being duplicated here.
"""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from typing import Any

from services.evidence_commitment import EVIDENCE_COMMITMENT_VERSION
from services.blockchain.issuance_control import (
    AUDIT_PATH_ENV,
    CONTROL_SCOPE,
    ISSUANCE_ENABLED_ENV,
    OPERATOR_ID_ENV,
    OPERATOR_TOKEN_ENV,
)
from services.xlayer.config import (
    DECISION_LOG_ADDRESS,
    POLICY_GATE_ADDRESS,
    REGISTRY_ADDRESS,
    XLAYER_CHAIN_ID,
    XLAYER_NETWORK,
)


ARCHITECTURE_SCHEMA_VERSION = "prooflayer-architecture-v1"

SUPPORTED_TOPICS = frozenset(
    {
        "overview",
        "evidence",
        "provenance",
        "rvc",
        "certificates",
        "issuance",
        "xlayer",
        "enforcement",
        "monitoring",
        "application_surfaces",
        "ai",
        "deployment",
        "limitations",
        "mainnet",
    }
)

SUPPORTED_AUDIENCES = frozenset(
    {
        "general",
        "web2_engineer",
        "web3_developer",
        "engineer",
        "investor",
        "xlayer_judge",
        "security_reviewer",
        "rwa_issuer",
        "protocol_integrator",
    }
)

_TOPIC_ALIASES = {
    "architecture": "overview",
    "system": "overview",
    "verification": "rvc",
    "certificate": "certificates",
    "signer": "issuance",
    "policygate": "enforcement",
    "policy_gate": "enforcement",
    "frontend": "application_surfaces",
    "backend": "deployment",
    "provider": "ai",
    "target": "mainnet",
}

_AUDIENCE_ALIASES = {
    "web2": "web2_engineer",
    "web3": "web3_developer",
    "developer": "engineer",
    "judge": "xlayer_judge",
    "security": "security_reviewer",
    "issuer": "rwa_issuer",
    "integrator": "protocol_integrator",
    "protocol": "protocol_integrator",
}


class ArchitectureCatalogError(ValueError):
    """Raised when an architecture topic or audience is unsupported."""


def _component(
    name: str,
    status: str,
    purpose: str,
    implementation: list[str],
) -> dict[str, Any]:
    return {
        "name": name,
        "status": status,
        "purpose": purpose,
        "implementation": implementation,
    }


_COMPONENTS: dict[str, dict[str, Any]] = {
    "evidence_sources": _component(
        "Evidence sources",
        "CURRENT / MIXED AUTHENTICITY",
        "Supply raw RWA facts; every observation must retain its actual live, cached, snapshot, or fixture authenticity metadata even though the established path does not use one universal enum.",
        ["services/evidence/", "services/evidence/live/", "data/snapshots/", "data/demo/"],
    ),
    "evidence_adapters": _component(
        "Evidence adapters",
        "CURRENT / NEW LIVE SUBSYSTEM PARTIAL",
        "Translate source-specific Ondo/USDY, Paxos/PAXG, attestation, and EVM data into ProofLayer inputs. The newer services/evidence/live subsystem is not yet the primary API/agent pipeline.",
        ["services/evidence/ondo.py", "services/evidence/paxos.py", "services/evidence/evm.py", "services/evidence/usdy_attestation.py"],
    ),
    "normalization": _component(
        "Evidence normalization",
        "CURRENT",
        "Convert heterogeneous source payloads into the shared EvidenceRecord schema consumed downstream.",
        ["services/rvc/models.py", "services/evidence/normalizer.py"],
    ),
    "commitment": _component(
        "Evidence commitment",
        "CURRENT / VERSIONED / LIMITED",
        "Create an order-independent deterministic fingerprint instead of putting full source documents on-chain.",
        ["services/evidence_commitment.py"],
    ),
    "provenance": _component(
        "Provenance engine",
        "CURRENT / CURATED ROOT TRUST",
        "Validate declared dependency graphs and count trusted root-source domains without counting mirrors as new roots.",
        ["services/provenance/engine.py", "services/provenance/models.py"],
    ),
    "rvc": _component(
        "Real-World Verification Circuits (RVCs)",
        "CURRENT / DETERMINISTIC AUTHORITY",
        "Evaluate normalized evidence with deterministic predicates and return PASS, FAIL, or INDETERMINATE.",
        ["services/rvc/treasury_backing.py", "services/rvc/gold_backing.py"],
    ),
    "authority": _component(
        "RVC authority boundary",
        "CURRENT / NON-NEGOTIABLE",
        "Keep the authority model AI investigates; RVC decides; PolicyGate enforces. No UI, operator, or model may upgrade a result.",
        ["services/agent/prompts.py", "services/agent/verification_agent.py", "apps/api/main.py"],
    ),
    "serialization": _component(
        "Certificate serialization",
        "CURRENT",
        "Derive canonical human and Solidity summaries plus a deterministic certificate ID from authoritative RVC fields. Certificate observed_at is the RVC execution time; source observations retain their own timestamps.",
        ["services/rvc/certificate_serializer.py", "services/rvc/models.py"],
    ),
    "issuance": _component(
        "Certificate issuance boundary",
        "CURRENT / CONTROLLED TESTNET",
        "Re-run RVC server-side, derive certificate truth, require testnet operator authorization and idempotency, audit the request, and serialize signer access.",
        ["apps/api/main.py", "services/blockchain/issuance_control.py", "services/blockchain/issuer.py"],
    ),
    "signer": _component(
        "TypeScript / Hardhat signer bridge",
        "CURRENT / CONTROLLED TESTNET",
        "Submit already-validated certificate summaries using existing TypeScript contract bindings; the AI has no key or write tool. This is logical code separation, not a separately isolated signer service.",
        ["scripts/issue-certificate.ts", "hardhat.config.ts"],
    ),
    "registry": _component(
        "X Layer CertificateRegistry",
        "DEPLOYED X LAYER TESTNET / LIVE STATE REQUIRES RPC READ",
        "Store certificate summaries, issuer identity, revocation, result, expiry, and current usability.",
        ["contracts/ProofLayerCertificateRegistry.sol", "data/xlayer-testnet.json"],
    ),
    "policygate": _component(
        "PolicyGate",
        "DEPLOYED TESTNET / REFERENCE ENFORCEMENT PRIMITIVE / LIVE STATE REQUIRES RPC READ",
        "Require a usable certificate matching caller-supplied asset, claim, and policy expectations before recording a verified action.",
        ["contracts/ProofLayerPolicyGate.sol"],
    ),
    "decisionlog": _component(
        "DecisionLog",
        "DEPLOYED TESTNET / AUTHORIZED APPENDS / LIVE STATE REQUIRES RPC READ",
        "PolicyGate records successful allowed actions and reverted denials do not persist. The contract also permits any authorized writer to append a unique allowed or denied record, so writer provenance matters.",
        ["contracts/ProofLayerDecisionLog.sol", "services/xlayer/events.py"],
    ),
    "xlayer": _component(
        "X Layer network layer",
        "CANONICAL MANIFEST: X LAYER TESTNET / LIVE STATE REQUIRES RPC READ",
        "Provide shared on-chain certificate and enforcement state on X Layer Testnet, chain ID 1952.",
        ["data/xlayer-testnet.json", "services/xlayer/config.py"],
    ),
    "monitoring": _component(
        "Continuous verification and monitoring",
        "CURRENT / LOCAL AND MANUAL IN PARTS",
        "Track time-sensitive verification snapshots and transitions without treating historical state as current truth.",
        ["services/continuous_verification/", "data/monitoring/"],
    ),
    "certificate_explorer": _component(
        "Certificate Explorer",
        "CURRENT / KNOWN IDS, NOT A FULL INDEX",
        "Inspect repository-known certificate fixtures enriched with current Registry and DecisionLog reads.",
        ["services/certificate_explorer/", "apps/web/app/certificates/"],
    ),
    "evidence_explorer": _component(
        "Evidence Explorer",
        "CURRENT",
        "Expose normalized evidence, authenticity labels, provenance, commitments, and deterministic verification details.",
        ["services/evidence_explorer/", "apps/web/app/evidence/"],
    ),
    "policy_studio": _component(
        "Policy Studio",
        "CURRENT / OFF-CHAIN LOCAL CONFIGURATION",
        "Configure and evaluate integration policy without changing authoritative RVC output or submitting PolicyGate transactions.",
        ["services/policy_studio/", "apps/web/app/policies/"],
    ),
    "operator_console": _component(
        "Operator Console",
        "CURRENT / OPERATIONS SURFACE",
        "Display backend, evidence, RVC, chain, certificate, enforcement, monitoring, and controlled issuance state; it is not an authority source.",
        ["apps/web/app/admin/", "apps/web/components/operator-console.tsx"],
    ),
    "developer_platform": _component(
        "Developer Platform",
        "CURRENT / READ-ONLY INTEGRATION SURFACES",
        "Expose APIs, OpenAPI schemas, manifest-backed contract information, and conservative integration simulations.",
        ["services/developer_platform/", "services/policy_integration/", "apps/web/app/developers/"],
    ),
    "frontend": _component(
        "Next.js frontend and BFF",
        "CURRENT",
        "Render operations and integration views and proxy same-origin requests to FastAPI; selected server components/routes also perform direct read-only X Layer reads. Frontend state is never verification authority.",
        ["apps/web/app/", "apps/web/app/api/"],
    ),
    "backend": _component(
        "FastAPI backend",
        "CURRENT",
        "Orchestrate evidence, deterministic verification, AI investigation, monitoring, policy, certificate reads, and the issuance boundary.",
        ["apps/api/main.py"],
    ),
    "tools": _component(
        "MCP and read-only tool layer",
        "CURRENT / READ-ONLY",
        "Give the AI bounded access to repository evidence, RVC output, architecture context, and X Layer reads without signing capability. The in-process agent calls ProofLayerTools directly; the standalone stdio MCP server exposes the same class.",
        ["services/mcp_server/tools.py", "services/mcp_server/server.py"],
    ),
    "ai": _component(
        "AI orchestration and provider layer",
        "CURRENT / REPLACEABLE INFRASTRUCTURE",
        "Select read-only tools and explain returned facts. Provider choice does not participate in verification authority.",
        ["services/agent/verification_agent.py", "services/agent/prompts.py"],
    ),
}

_TOPIC_COMPONENTS = {
    "overview": tuple(_COMPONENTS),
    "evidence": ("evidence_sources", "evidence_adapters", "normalization", "commitment", "evidence_explorer"),
    "provenance": ("normalization", "commitment", "provenance", "rvc"),
    "rvc": ("normalization", "provenance", "rvc", "authority"),
    "certificates": ("rvc", "serialization", "registry", "certificate_explorer", "monitoring"),
    "issuance": ("authority", "serialization", "issuance", "signer", "registry"),
    "xlayer": ("registry", "policygate", "decisionlog", "xlayer"),
    "enforcement": ("registry", "policygate", "decisionlog", "developer_platform"),
    "monitoring": ("rvc", "registry", "monitoring", "certificate_explorer", "operator_console"),
    "application_surfaces": ("evidence_explorer", "policy_studio", "operator_console", "developer_platform", "frontend", "backend"),
    "ai": ("authority", "tools", "ai", "backend"),
    "deployment": ("frontend", "backend", "issuance", "signer", "xlayer", "ai"),
    "limitations": (
        "evidence_sources",
        "commitment",
        "provenance",
        "issuance",
        "signer",
        "registry",
        "policygate",
        "decisionlog",
        "monitoring",
        "certificate_explorer",
    ),
    "mainnet": ("provenance", "rvc", "issuance", "signer", "registry", "policygate", "decisionlog", "monitoring"),
}

_SUMMARIES = {
    "overview": "ProofLayer turns heterogeneous RWA evidence into deterministic verification results, canonical certificates, and reusable X Layer enforcement state while keeping AI on a parallel read-only explanation path.",
    "evidence": "Source-specific adapters label and normalize mixed-authenticity evidence before the deterministic pipeline consumes it.",
    "provenance": "Provenance tracks declared dependencies and curated trust-root domains so duplicated reporting is not mistaken for independent support.",
    "rvc": "RVCs are deterministic verification programs for USDY/TreasuryBacking and PAXG/GoldBacking; they, not the model, own PASS, FAIL, and INDETERMINATE.",
    "certificates": "A certificate is a time-bounded serialized record of an RVC result; historical result and present on-chain usability are separate facts.",
    "issuance": "The controlled testnet issuance bridge derives authoritative fields from a fresh server-side RVC and separates Python verification from TypeScript signing.",
    "xlayer": "The canonical manifest declares the current Registry, PolicyGate, and DecisionLog deployment on X Layer Testnet, not mainnet; live state still requires a read-only RPC check.",
    "enforcement": "PolicyGate is currently a reference enforcement primitive; it validates certificate eligibility and records successful actions but does not yet protect a real downstream protocol action.",
    "monitoring": "Verification is time-sensitive: current RVC result, historical certificate result, and current certificate usability must always be displayed separately.",
    "application_surfaces": "Next.js, FastAPI, explorers, policy tooling, monitoring, developer APIs, and the operator console expose or orchestrate state but never replace RVC authority.",
    "ai": "The AI is a replaceable, provider-agnostic orchestration and explanation layer with bounded read-only tools and no signer access.",
    "deployment": "Runtime traffic flows Browser -> Next.js/BFF -> FastAPI -> Python services, with separate bounded paths to the model provider and TypeScript/Hardhat testnet signer.",
    "limitations": "The build is a credible testnet MVP, but provenance trust, commitments, signing, governance, indexing, storage, monitoring, and downstream enforcement still have disclosed production gaps.",
    "mainnet": "Mainnet is target architecture, not current state; it requires production key custody, governance, provenance, persistence, indexing, monitoring, and a real protected integration.",
}

_LIMITATIONS = {
    "evidence": [
        "Evidence coverage is mixed live/cached/snapshot/fixture and must remain explicitly labeled.",
        "The primary agent/API path uses USDY snapshot plus optional live Ethereum composition and snapshot-only PAXG; the newer live-evidence collector is not fully wired into it.",
        f"{EVIDENCE_COMMITMENT_VERSION} commits many normalized fields but not dependency_parent_ids or arbitrary metadata.",
    ],
    "provenance": [
        "Trusted root identities are curated classifications, not cryptographic proof that organizations or feeds are independent.",
        "The active provenance root registry is not yet consolidated with other repository source registries.",
        "Graph validation reports malformed dependencies, but neither current RVC binds validation_ok or validation errors into its verdict.",
        "Root counts can include contextual evidence not directly consumed by every predicate.",
    ],
    "certificates": [
        "Only a Solidity summary is stored on-chain; predicates, reason codes, compiler version, and fuller provenance remain off-chain.",
        "The Registry does not recompute certificateId from supplied fields and its governance/invariants remain testnet-grade.",
        "The Certificate Explorer covers repository-known IDs, not a complete chain-wide Registry index.",
    ],
    "issuance": [
        "Controls are explicitly development/testnet controls: process-local coordination, a configured operator token, JSONL audit, and an environment-backed Hardhat child process on the same host.",
        "Production requires isolated signing with KMS/HSM or governed relaying/multisig, durable idempotency and reconciliation, and production IAM.",
    ],
    "xlayer": [
        "The canonical deployment is X Layer Testnet, not X Layer mainnet.",
        "Manifest addresses and chain metadata are repository configuration, not by themselves a fresh RPC/bytecode attestation.",
        "Deployment attestation, source verification, governance, and operational monitoring require production hardening.",
    ],
    "enforcement": [
        "PolicyGate callers supply expected asset, claim, policy, and action context.",
        "The current gate records a verified action counter/log but does not atomically execute a lending, minting, transfer, or settlement action.",
        "Reverted denials do not create ordinary DecisionLog records; history reads are bounded and provider-dependent.",
        "The read-only agent PolicyGate tool derives eligibility from Registry fields and configured wiring; it does not eth_call validateAction.",
        "There is no current on-chain WARN behavior; off-chain protocol simulation uses separate ACCEPT/REJECT/REVIEW_REQUIRED semantics.",
    ],
    "monitoring": [
        "Monitoring and policy storage are local JSONL in parts and are not scheduled, durable production infrastructure.",
        "Historical event retrieval is bounded and can be incomplete or unavailable under RPC range/provider limits.",
    ],
    "application_surfaces": [
        "Frontend/BFF health, backend health, provider readiness, RVC truth, and chain state are distinct signals.",
        "Developer protocol enforcement is currently read-only/simulated, not a protected downstream action.",
    ],
    "ai": [
        "The model cannot create authoritative verification facts, issue certificates, bypass PolicyGate, or submit transactions.",
        "Provider availability is operational state only and says nothing about RVC or certificate truth.",
    ],
    "deployment": [
        "The current signing bridge is appropriate only for controlled testnet development.",
        "Local storage, public RPC dependence, and provider/runtime timeouts need production replacements or hardening.",
    ],
    "mainnet": [
        "No current component should be described as a production mainnet deployment.",
        "A mainnet pilot needs audited contracts, hardened governance, durable indexing/storage, production monitoring, and independently controlled signing.",
    ],
}

_GENERAL_LIMITATIONS = [
    "Current enforcement is a reference X Layer testnet primitive, not a completed downstream protocol integration.",
    "Current evidence and operations include local, cached, snapshot, fixture, and testnet elements; target architecture must never be narrated as already implemented.",
]

_AUDIENCE_GUIDANCE = {
    "general": "Use the simple sequence DATA -> CHECK RULES -> SAVE RESULT -> ENFORCE RESULT, then explain that AI only observes and explains.",
    "web2_engineer": "Map adapters to ingestion, EvidenceRecord to a normalized domain model, RVC to deterministic validation, Registry to shared state, and PolicyGate to authorization middleware.",
    "web3_developer": "Emphasize deterministic serialization, bytes32 identifiers, Registry usability, view validation, revert semantics, DecisionLog events, and chain ID 1952.",
    "engineer": "Name concrete Python services, Next.js BFF routes, TypeScript signer bridge, Solidity contracts, and the trust boundaries between them.",
    "investor": "Focus on reusable verification infrastructure and shared trust state while clearly separating the working testnet MVP from the production/mainnet target.",
    "xlayer_judge": "Explain why shared Registry and PolicyGate state can make X Layer RWA applications safer and easier to integrate; disclose that the downstream protected application is still target work.",
    "security_reviewer": "Lead with authority separation, fail-closed semantics, issuance controls, signer isolation limits, evidence/provenance limitations, and testnet governance risk.",
    "rwa_issuer": "Explain source onboarding, normalized evidence, freshness, provenance, deterministic predicates, certificate lifetime, revocation, and what disclosures remain off-chain.",
    "protocol_integrator": "Explain read-only RVC/API consumption and Registry/PolicyGate checks today, then distinguish the future integration-specific atomic protected action.",
}

_TARGET_STATE = [
    "broader authenticated live evidence coverage",
    "cryptographically stronger provenance and fail-closed malformed-graph semantics",
    "versioned commitments covering all trust-relevant dependency and metadata fields",
    "integration-specific PolicyGate bindings and a real atomic downstream X Layer action",
    "KMS/HSM or governed relayer/multisig signing with production IAM",
    "durable transactional storage, reconciliation, indexing, and reorg handling",
    "production monitoring, governance hardening, audits, and a mainnet pilot",
]

_TOPIC_DETAILS: dict[str, Any] = {
    "overview": {
        "truth_hierarchy": [
            "CURRENT RVC RESULT comes only from a current deterministic verifier run",
            "HISTORICAL CERTIFICATE RESULT records what an earlier RVC concluded",
            "CURRENT CERTIFICATE USABILITY comes from Registry existence, PASS result, revocation, and expiry state",
        ],
        "off_chain_on_chain_boundary": (
            "Raw/normalized evidence, predicates, reasons, provenance detail, AI output, "
            "and local monitoring remain off-chain; the Registry stores the canonical "
            "certificate summary and PolicyGate/DecisionLog store enforcement state."
        ),
    },
    "evidence": {
        "authenticity_modes": {
            "LIVE": "fetched from the source or chain for the current request",
            "CACHED": "previously fetched external data reused with its retrieval metadata",
            "SNAPSHOT": "repository-held point-in-time source data",
            "FIXTURE": "purpose-built deterministic test/reference input",
        },
        "normalized_record_fields": [
            "asset",
            "field",
            "value",
            "unit",
            "source_id",
            "source_type",
            "root_source_id",
            "dependency_parent_ids",
            "observed_at",
            "retrieved_at",
            "content_hash",
            "evidence_tier",
            "simulation",
            "metadata",
        ],
        "commitment_fields": [
            "asset and claim",
            "record asset/source/root/source type",
            "field/value/unit",
            "observed_at and retrieved_at",
            "content_hash and evidence_tier",
            "simulation",
        ],
        "commitment_omissions": ["dependency_parent_ids", "arbitrary metadata"],
    },
    "provenance": {
        "graph_validation": [
            "unknown trusted roots",
            "missing dependency parents",
            "duplicate (source_id, field) evidence keys",
            "self-parenting",
            "dependency cycles",
        ],
        "independence_semantics": (
            "Independent roots are counted by curated root-source classification; "
            "multiple mirrors of one root do not become multiple independent roots."
        ),
        "rvc_boundary": (
            "The engine reports malformed provenance, but neither current RVC binds "
            "graph validation_ok or validation errors into its verdict."
        ),
    },
    "rvc": {
        "supported_verifiers": {
            "USDY/TreasuryBacking": {
                "policy": "default-treasury-policy v1.0",
                "predicates": [
                    "asset_class == TOKENIZED_TREASURY",
                    "underlying_asset_value >= outstanding_token_value",
                    "collateralization_ratio >= 1.00",
                    "treasury_exposure >= policy.minimum (default 0.95)",
                    "attestation.age <= policy.max_age (default 24 hours)",
                    "issuer_contract == VERIFIED",
                    "onchain_supply exists",
                ],
                "semantics": "if any required field is absent, the verifier returns INDETERMINATE before evaluating the other predicates; once required fields are present, any emitted false predicate => FAIL, otherwise PASS",
            },
            "PAXG/GoldBacking": {
                "policy": "default-gold-policy v1.0",
                "predicates": [
                    "asset_class == TOKENIZED_GOLD",
                    "reserve_asset == LBMA_GOOD_DELIVERY_GOLD",
                    "one fine troy ounce per token and allocated_gold_oz >= circulating_token_supply",
                    "backing_ratio >= 1.00",
                    "reserve_attestation exists",
                    "reserve_attestation.age <= policy.max_age (default 31 days)",
                    "issuer_contract_verified == True",
                ],
                "semantics": "explicit contradiction => FAIL; missing, malformed, future, or stale data => INDETERMINATE unless another predicate is false; otherwise PASS",
            },
        },
        "certificate_window": "Both current verifiers issue an authoritative one-hour validity window from RVC execution time.",
    },
    "certificates": {
        "human_fields": [
            "asset",
            "claim type/version",
            "policy ID/version",
            "result",
            "evidence root",
            "RVC observed_at",
            "valid_until",
            "independent root count",
            "reason codes",
            "compiler version",
            "simulation flag",
        ],
        "solidity_fields": [
            "certificateId",
            "assetId",
            "claimType",
            "policyId",
            "evidenceRoot",
            "observedAt",
            "validUntil",
            "independentRootCount",
            "result",
        ],
        "identifier_semantics": (
            "Asset, claim, and policy strings are whitespace-trimmed and Unicode "
            "NFC-normalized, remain case-sensitive, then are Keccak-hashed to "
            "bytes32; certificateId is the Keccak-256 of canonical JSON for all other "
            "Solidity summary fields. The Registry does not recompute it."
        ),
        "time_semantics": (
            "Certificate observedAt is RVC execution time, not an attestation/report "
            "observation timestamp; source records retain their own observed_at values."
        ),
    },
    "issuance": {
        "configuration_names_only": [
            ISSUANCE_ENABLED_ENV,
            OPERATOR_TOKEN_ENV,
            OPERATOR_ID_ENV,
            AUDIT_PATH_ENV,
        ],
        "control_scope": CONTROL_SCOPE,
        "request_boundary": [
            "literal testnet enable flag, disabled by default",
            "authenticated operator identity",
            "mandatory idempotency key and request identity",
            "append-only local audit record",
            "process-local duplicate coalescing and global signer serialization",
        ],
        "authoritative_derivation": [
            "server reloads evidence and re-runs the deterministic RVC",
            "only current non-simulated unexpired PASS may continue",
            "caller cannot provide certificate result, evidence root, timestamps, roots, predicates, or reason codes",
            "RVC observed_at and valid_until are preserved without extension",
        ],
        "signing_boundary": (
            "Python passes validated JSON by stdin to a TypeScript/Hardhat child process. "
            "Python does not sign, and the AI has no access to this path. The child still "
            "shares the development host/environment, so this is not KMS/HSM isolation."
        ),
    },
    "xlayer": {
        "registry_usability": "exists AND result == PASS AND not revoked AND block.timestamp <= validUntil",
        "registry_roles": "owner authorizes issuers; owner or original issuer may revoke",
        "policygate_binding": "checks Registry usability plus equality of assetId, claimType, and policyId supplied for the action",
        "decision_identity": "gate/chain/sequence/certificate/actor/action-bound ID for PolicyGate-originated actions",
    },
    "enforcement": {
        "current_contract_behavior": [
            "validate certificate existence and Registry usability",
            "match caller-supplied asset, claim, and policy expectations",
            "on success increment executedActionCount and append an allowed DecisionLog record",
            "on rejection revert atomically, leaving no ordinary denial record",
        ],
        "read_tool_behavior": (
            "The agent's current PolicyGate tool derives a read-only ALLOWED/BLOCKED "
            "assessment from Registry fields and wiring; it does not call validateAction "
            "or execute a protected transaction."
        ),
        "integration_status": (
            "No lending, vault, mint, transfer, treasury, or settlement state transition "
            "is currently protected by the reference gate."
        ),
    },
    "monitoring": {
        "three_separate_truths": [
            "CURRENT RVC RESULT",
            "HISTORICAL CERTIFICATE RESULT",
            "CURRENT CERTIFICATE USABILITY",
        ],
        "time_transition_example": (
            "A certificate can retain historical PASS while expiring or becoming revoked, "
            "and a new RVC run can independently return FAIL or INDETERMINATE."
        ),
    },
    "application_surfaces": {
        "health_boundaries": [
            "frontend/BFF reachability",
            "FastAPI health",
            "model-provider readiness",
            "deterministic verifier truth",
            "X Layer RPC/contract state",
        ],
        "storage": "Policy Studio, monitoring, and issuance audit use local JSONL in the current build.",
        "indexing": "Certificate browsing begins from repository-known IDs; arbitrary direct lookup is supported, but no full Registry index exists.",
    },
    "ai": {
        "provider_configuration_names_only": [
            "AI_PROVIDER",
            "AI_BASE_URL",
            "AI_MODEL",
            "AI_API_KEY",
        ],
        "runtime_tooling": (
            "The application agent invokes ProofLayerTools in-process; an external stdio "
            "MCP facade exposes the same read-only class. Architecture, evidence, RVC, "
            "Registry, PolicyGate, and DecisionLog operations never expose signing."
        ),
        "provider_role": "replaceable text/tool orchestration infrastructure, never verification authority",
    },
    "deployment": {
        "read_paths": [
            "Browser -> Next.js server/components or same-origin BFF",
            "Next.js BFF -> FastAPI",
            "FastAPI -> Python evidence/RVC/read-only tool services",
            "selected Next.js server paths -> read-only X Layer RPC",
        ],
        "write_path_when_explicitly_enabled": "authenticated FastAPI issuance -> Python control/audit -> TypeScript/Hardhat signer -> X Layer Registry",
        "ai_path": "FastAPI agent -> replaceable external provider -> bounded local read-only tools; never signer",
    },
    "limitations": {
        "production_blockers": list(_TARGET_STATE),
    },
    "mainnet": {
        "required_changes": list(_TARGET_STATE),
        "current_network": "X Layer Testnet only",
    },
}


def _normalize_topic(topic: str) -> str:
    normalized = str(topic or "overview").strip().lower().replace("-", "_").replace(" ", "_")
    normalized = _TOPIC_ALIASES.get(normalized, normalized)
    if normalized not in SUPPORTED_TOPICS:
        raise ArchitectureCatalogError(
            f"unsupported architecture topic {topic!r}; supported topics are "
            + ", ".join(sorted(SUPPORTED_TOPICS))
        )
    return normalized


def _normalize_audience(audience: str) -> str:
    normalized = str(audience or "engineer").strip().lower().replace("-", "_").replace(" ", "_")
    normalized = _AUDIENCE_ALIASES.get(normalized, normalized)
    if normalized not in SUPPORTED_AUDIENCES:
        raise ArchitectureCatalogError(
            f"unsupported architecture audience {audience!r}; supported audiences are "
            + ", ".join(sorted(SUPPORTED_AUDIENCES))
        )
    return normalized


def get_architecture_context(
    topic: str = "overview",
    audience: str = "engineer",
) -> dict[str, Any]:
    """Return bounded current/target architecture context without I/O or writes."""

    resolved_topic = _normalize_topic(topic)
    resolved_audience = _normalize_audience(audience)
    selected_components = [
        deepcopy(_COMPONENTS[name]) for name in _TOPIC_COMPONENTS[resolved_topic]
    ]
    limitations = list(_GENERAL_LIMITATIONS)
    if resolved_topic == "limitations":
        for values in _LIMITATIONS.values():
            for value in values:
                if value not in limitations:
                    limitations.append(value)
    else:
        limitations.extend(_LIMITATIONS.get(resolved_topic, []))

    return {
        "schema_version": ARCHITECTURE_SCHEMA_VERSION,
        "topic": resolved_topic,
        "audience": resolved_audience,
        "summary": _SUMMARIES[resolved_topic],
        "authority_model": {
            "ai": "INVESTIGATES AND EXPLAINS",
            "rvc": "DECIDES PASS / FAIL / INDETERMINATE",
            "policygate": "ENFORCES CERTIFICATE ELIGIBILITY",
            "forbidden_ai_actions": [
                "determine or override PASS/FAIL",
                "issue or sign certificates",
                "bypass PolicyGate",
                "submit blockchain transactions",
            ],
        },
        "current_scope": {
            "network": XLAYER_NETWORK,
            "chain_id": XLAYER_CHAIN_ID,
            "canonical_manifest_deployment": {
                "certificate_registry": REGISTRY_ADDRESS,
                "policy_gate": POLICY_GATE_ADDRESS,
                "decision_log": DECISION_LOG_ADDRESS,
            },
            "deterministic_claims": [
                {"asset": "USDY", "claim": "TreasuryBacking"},
                {"asset": "PAXG", "claim": "GoldBacking"},
            ],
            "issuance": "disabled by default; authenticated controlled-testnet path when explicitly enabled",
            "enforcement": "reference PolicyGate primitive; no real downstream protected application yet",
            "runtime_attestation_note": "Use live read-only chain tools to prove current bytecode, wiring, block, usability, or event state; this architecture catalog reports manifest/repository truth.",
        },
        "verification_pipeline": [
            "external RWA sources",
            "source-specific evidence adapters",
            "normalized EvidenceRecord values",
            f"{EVIDENCE_COMMITMENT_VERSION} evidence commitment",
            "provenance graph and curated root analysis",
            "deterministic RVC",
            "PASS / FAIL / INDETERMINATE",
            "branch: only authoritative, non-simulated, unexpired PASS may continue to issuance; FAIL and INDETERMINATE stop",
            "canonical certificate serialization",
            "authorized testnet issuance boundary",
            "TypeScript / Hardhat signer bridge",
            "X Layer CertificateRegistry",
            "PolicyGate reference enforcement",
            "DecisionLog successful decisions",
            "future integration-specific downstream X Layer action",
        ],
        "parallel_ai_path": [
            "user question",
            "ProofLayer AI orchestration",
            "bounded read-only architecture / evidence / RVC / chain tools",
            "repository and runtime facts",
            "grounded explanation",
        ],
        "runtime_topology": [
            "Browser -> Next.js -> same-origin Next API/BFF -> FastAPI -> Python verification services",
            "FastAPI -> controlled TypeScript/Hardhat issuance bridge -> X Layer Testnet contracts",
            "FastAPI AI agent -> replaceable external model provider (not verification authority)",
        ],
        "components": selected_components,
        "implementation_facts": deepcopy(_TOPIC_DETAILS[resolved_topic]),
        "limitations": limitations,
        "target_state_not_current": list(_TARGET_STATE),
        "audience_guidance": _AUDIENCE_GUIDANCE[resolved_audience],
        "truth_rules": [
            "Never describe cached, snapshot, or fixture evidence as live.",
            "Keep CURRENT RVC RESULT, HISTORICAL CERTIFICATE RESULT, and CURRENT CERTIFICATE USABILITY separate.",
            "Never describe target architecture as implemented current state.",
            "Use the canonical deployment manifest for network identifiers and addresses.",
            "Do not treat manifest configuration as a fresh live bytecode or provider-readiness check.",
        ],
        "read_only": True,
    }


def _infer_audience(lowered: str) -> str:
    if "web2" in lowered or "new to web3" in lowered:
        return "web2_engineer"
    if "web3" in lowered or "solidity" in lowered:
        return "web3_developer"
    if "investor" in lowered or "venture" in lowered:
        return "investor"
    if "x layer judge" in lowered or "xlayer judge" in lowered or "judge" in lowered:
        return "xlayer_judge"
    if "security reviewer" in lowered or "security audit" in lowered or "threat model" in lowered or "security controls" in lowered:
        return "security_reviewer"
    if "rwa issuer" in lowered or "issuer" in lowered:
        return "rwa_issuer"
    if "protocol integrator" in lowered or "lending protocol" in lowered:
        return "protocol_integrator"
    if "engineer" in lowered or "developer" in lowered:
        return "engineer"
    return "general"


def architecture_request_for_query(query: str) -> dict[str, str] | None:
    """Classify general architecture questions without stealing asset-state queries."""

    lowered = " ".join(str(query or "").lower().split())
    if not lowered:
        return None

    explicit_architecture = any(
        phrase in lowered
        for phrase in (
            "architecture",
            "system design",
            "data flow",
            "deployment flow",
            "deployment architecture",
            "high-level design",
            "implementation design",
            "deployment flow",
        )
    )
    asset_specific = any(asset in lowered for asset in ("usdy", "paxg", "0x"))
    current_state_question = any(
        phrase in lowered
        for phrase in (
            "current result",
            "right now",
            "currently blocked",
            "currently allowed",
            "current certificate",
            "investigate",
            "verify usdy",
            "verify paxg",
        )
    )
    if asset_specific and current_state_question and not explicit_architecture:
        return None

    topic: str | None = None
    if explicit_architecture:
        topic = "overview"
    if any(phrase in lowered for phrase in ("deployment flow", "runtime topology", "deployment topology")):
        topic = "deployment"
    elif any(phrase in lowered for phrase in ("what is prooflayer", "what does prooflayer do", "what is proof layer", "what problem does prooflayer solve", "what is the point of prooflayer", "why are only usdy", "why only usdy", "why are only paxg", "why only paxg", "why are usdy and paxg the only")):
        topic = "overview"
    elif any(phrase in lowered for phrase in ("how does prooflayer get its data", "where does prooflayer get its data", "where does prooflayer's data", "how does prooflayer collect evidence", "prooflayer data sources")):
        topic = "evidence"
    elif any(phrase in lowered for phrase in ("what happens after prooflayer collects evidence", "after prooflayer collects evidence", "evidence adapter", "evidence normalization", "fields are in evidencerecord", "fields in evidencerecord", "evidencerecord schema")):
        topic = "evidence"
    elif any(phrase in lowered for phrase in ("what is provenance", "how does provenance connect", "provenance engine", "independent roots", "evidence commitment")):
        topic = "provenance"
    elif any(phrase in lowered for phrase in ("what is an rvc", "what is a rvc", "what are rvcs", "what is rvc", "how does the rvc layer work", "how does rvc work", "rvc predicates", "predicates do the current rvcs", "real-world verification circuit")):
        topic = "rvc"
    elif any(phrase in lowered for phrase in ("why doesn't ai decide", "why does not ai decide", "can ai issue", "can the ai issue", "does ai have access to the signer", "ai cannot issue", "why is the signer outside the ai", "where does ai sit", "ai provider layer", "model provider", "ai provider environment", "canonical ai provider", "mcp read-only tool", "mcp tool layer", "read-only tool layer")):
        topic = "ai"
    elif any(phrase in lowered for phrase in ("why is the signer in typescript", "why is the signer implemented outside the ai", "python backend communicate with x layer", "signer bridge", "issuance boundary")):
        topic = "issuance"
    elif any(phrase in lowered for phrase in ("what is a certificate", "what is the certificate", "what is stored on-chain", "what is stored onchain", "what stays off-chain", "what stays offchain", "certificate serialization")):
        topic = "certificates"
    elif any(phrase in lowered for phrase in ("what is decisionlog", "what is decision log", "what does certificateregistry do", "what does certificate registry do", "what does decisionlog do", "what does decision log do")):
        topic = "xlayer"
    elif any(phrase in lowered for phrase in ("what is policygate", "what is policy gate", "how does policygate work", "how does policy gate work", "how does policygate use", "how does policy gate use", "what does policygate do", "what does policy gate do", "lending protocol integrate", "protocol integrate prooflayer", "downstream application")):
        topic = "enforcement"
    elif any(phrase in lowered for phrase in ("why does prooflayer matter", "why is prooflayer relevant", "what value does prooflayer", "value of prooflayer", "prooflayer bring to x layer", "prooflayer benefit x layer")):
        topic = "xlayer"
    elif any(phrase in lowered for phrase in ("when a certificate expires", "certificate expire", "rvc result and certificate usability", "difference between rvc", "continuous verification")):
        topic = "monitoring"
    elif any(phrase in lowered for phrase in ("where is x layer used", "where is xlayer used", "x layer network", "xlayer network")):
        topic = "xlayer"
    elif any(phrase in lowered for phrase in ("need to change for mainnet", "for mainnet", "mainnet pilot", "target architecture", "what is the roadmap", "what is the prooflayer roadmap", "prooflayer roadmap")):
        topic = "mainnet"
    elif any(phrase in lowered for phrase in ("architectural limitations", "architecture limitations", "current limitations", "production gaps", "testnet-only vs production", "testnet only vs production", "what security controls exist", "what security controls does prooflayer")):
        topic = "limitations"
    elif any(phrase in lowered for phrase in ("frontend / bff", "fastapi backend", "fastapi expose", "fastapi route", "operator console", "developer platform", "policy studio", "evidence explorer", "certificate explorer")):
        topic = "application_surfaces"

    if topic is None:
        return None
    return {"topic": topic, "audience": _infer_audience(lowered)}


def architecture_payload_contains_only_public_data(payload: Mapping[str, Any]) -> bool:
    """Document that public config names are present without credential values."""

    rendered = repr(dict(payload))
    lowered = rendered.lower()
    forbidden_fragments = (
        "private_key=",
        "private key value",
        "operator_token=",
        "bearer ",
        "deployer_private_key=",
        "sk-",
        "nvapi-",
    )
    return not any(marker in lowered for marker in forbidden_fragments)


__all__ = [
    "ARCHITECTURE_SCHEMA_VERSION",
    "ArchitectureCatalogError",
    "SUPPORTED_AUDIENCES",
    "SUPPORTED_TOPICS",
    "architecture_payload_contains_only_public_data",
    "architecture_request_for_query",
    "get_architecture_context",
]
