import type { AgentResponse, DemoRunnerResponse } from "@/lib/agent";
import type { CertificateExplorerRecord } from "@/lib/certificates";
import type { EvidenceAssetDetail, EvidenceExplorerIndex } from "@/lib/evidence";
import type { ProtocolDecision } from "@/lib/protocol";
import type { InstitutionalPolicy, PolicyDetail, PolicyEvaluation, PolicyStudioOverview } from "@/lib/policies";

export type DeveloperApiError = {
  available: false;
  error: string;
};

export type DeveloperComponentStatus = {
  status: "AVAILABLE" | "UNAVAILABLE" | "CONNECTED" | "UNCONFIGURED";
  detail: string;
  authenticity_labels: string[];
};

export type DeveloperContractReference = {
  name: "CertificateRegistry" | "PolicyGate" | "DecisionLog";
  purpose: string;
  address: string;
  network: "X Layer Testnet";
  chain_id: 1952;
};

export type DeveloperPlatformStatus = {
  api: DeveloperComponentStatus;
  xlayer: DeveloperComponentStatus;
  ai_agent: DeveloperComponentStatus;
  deterministic_verification: DeveloperComponentStatus;
  openapi: DeveloperComponentStatus;
  latest_block: number | null;
  network: "X Layer Testnet";
  chain_id: 1952;
  contracts: DeveloperContractReference[];
  openapi_path: "/openapi.json";
  api_status: "MVP / PRE-PRODUCTION";
  write_operations_exposed: false;
  blockchain_write_performed: false;
};

export type DeveloperApiPayload =
  | ProtocolDecision
  | EvidenceExplorerIndex
  | EvidenceAssetDetail
  | CertificateExplorerRecord
  | DemoRunnerResponse
  | AgentResponse
  | InstitutionalPolicy
  | PolicyDetail
  | PolicyEvaluation
  | PolicyStudioOverview
  | DeveloperApiError;

export const XLAYER = {
  name: "X Layer Testnet",
  chainId: 1952,
  explorer: "https://www.okx.com/web3/explorer/xlayer-test",
  contracts: {
    registry: "0xC24A1Aa861aA4ca5D15CEC055223EBACd0940935",
    policyGate: "0x8e07048285D5f54a3D1D2093b80F4Aa2ce75C645",
    decisionLog: "0x0476A86b75a5e92a09c228227A0573d90E1a2fA1",
  },
} as const;

export const KNOWN_USDY_CERTIFICATE_ID =
  "0xba3c44801fb90231df4c22a51f0fd392f6f9638cbb3f8d99f3ef6c867e86ee7f";

export const QUICK_START_REQUEST = {
  protocol_type: "lending",
  asset: "USDY",
  claim: "TreasuryBacking",
  action: "accept_as_collateral",
} as const;

export const QUICK_START_RESPONSE = {
  verification_result: "INDETERMINATE",
  reason_codes: ["MISSING_EVIDENCE"],
  certificate_status: "REGISTERED_UNUSABLE",
  certificate_state: "EXPIRED",
  policygate_outcome: "BLOCKED",
  final_protocol_recommendation: "REVIEW_REQUIRED",
  blockchain_write_performed: false,
} as const;

export type EndpointDoc = {
  method: "GET" | "POST";
  path: string;
  purpose: string;
  request: string;
  response: string;
  errors: string;
  authenticity: string[];
  responseExample: string;
};

export const API_ENDPOINTS: EndpointDoc[] = [
  {
    method: "GET",
    path: "/health",
    purpose: "Report API, deterministic runner, and optional AI configuration.",
    request: "No body",
    response: "Health object; write_capabilities is always false.",
    errors: "Connection failure if the local API is not running.",
    authenticity: ["DERIVED"],
    responseExample: JSON.stringify({ status: "ok", agent_configured: false, deterministic_demo_available: true, write_capabilities: false }, null, 2),
  },
  {
    method: "POST",
    path: "/protocol/check",
    purpose: "Simulate a conservative protocol acceptance policy from verification and live certificate state.",
    request: "ProtocolCheckRequest",
    response: "ProtocolDecision",
    errors: "400 unsupported combination; 422 schema validation; RPC reads can be marked unavailable.",
    authenticity: ["DETERMINISTIC RVC", "LIVE ON-CHAIN", "POLICY CHECK"],
    responseExample: JSON.stringify(QUICK_START_RESPONSE, null, 2),
  },
  {
    method: "GET",
    path: "/policies",
    purpose: "List demo policy presets and the latest locally saved institutional policy versions.",
    request: "No body",
    response: "PolicyStudioOverview",
    errors: "500 if local append-only policy history is malformed.",
    authenticity: ["CUSTOM POLICY", "DERIVED"],
    responseExample: JSON.stringify({ presets: [{ policy: { policy_id: "demo-conservative-lending", policy_version: 1, source: "DEMO POLICY PRESET" } }], saved_policies: [], blockchain_write_performed: false }, null, 2),
  },
  {
    method: "POST",
    path: "/policies",
    purpose: "Validate and save a typed institutional policy or a new material version.",
    request: "InstitutionalPolicyDraft",
    response: "InstitutionalPolicy with policy_version and off-chain policy_commitment",
    errors: "400 unsafe or inconsistent policy; 422 schema validation; 500 malformed local history.",
    authenticity: ["CUSTOM POLICY", "DERIVED"],
    responseExample: JSON.stringify({ policy_id: "institutional-treasury-standard", policy_version: 1, policy_commitment: "0x…", blockchain_write_performed: false }, null, 2),
  },
  {
    method: "GET",
    path: "/policies/{policy_id}",
    purpose: "Inspect one exact policy, its evaluations, and factual decision transitions.",
    request: "Path policy_id: lowercase URL-safe policy identifier",
    response: "PolicyDetail",
    errors: "404 unknown policy; 500 malformed local history.",
    authenticity: ["CUSTOM POLICY", "DERIVED"],
    responseExample: JSON.stringify({ policy: { policy_id: "demo-conservative-lending", policy_version: 1 }, evaluations: [], decision_transitions: [], blockchain_write_performed: false }, null, 2),
  },
  {
    method: "POST",
    path: "/policies/{policy_id}/evaluate",
    purpose: "Evaluate current authoritative ProofLayer state against one exact policy version.",
    request: "PolicyEvaluationRequest: asset + compatible claim",
    response: "PolicyEvaluation",
    errors: "400 incompatible asset/claim or disabled policy; 422 schema validation; RPC fields can be unavailable.",
    authenticity: ["DETERMINISTIC RVC", "CUSTOM POLICY", "LIVE ON-CHAIN", "CACHED OFFICIAL EVIDENCE", "DERIVED"],
    responseExample: JSON.stringify({ policy_id: "demo-conservative-lending", policy_version: 1, asset: "USDY", verification_result: "INDETERMINATE", final_decision: "REVIEW_REQUIRED", blockchain_write_performed: false }, null, 2),
  },
  {
    method: "GET",
    path: "/evidence",
    purpose: "List supported USDY and PAXG evidence summaries.",
    request: "No body",
    response: "EvidenceExplorerIndex",
    errors: "Connection failure if the local API is not running.",
    authenticity: ["CACHED OFFICIAL EVIDENCE", "DERIVED"],
    responseExample: JSON.stringify({ assets: [{ asset: "USDY", claim: "TreasuryBacking", verification_result: "INDETERMINATE" }], blockchain_write_performed: false }, null, 2),
  },
  {
    method: "GET",
    path: "/evidence/{asset}",
    purpose: "Inspect normalized evidence, provenance, RVC predicates, and certificate linkage for USDY or PAXG.",
    request: "Path asset: usdy | paxg",
    response: "EvidenceAssetDetail",
    errors: "400 unsupported asset; live linkage can be marked unavailable.",
    authenticity: ["CACHED OFFICIAL EVIDENCE", "DETERMINISTIC RVC", "LIVE READ"],
    responseExample: JSON.stringify({ asset: "USDY", claim: "TreasuryBacking", evidence_records: "[…]", provenance: { independent_root_count: 1, dependency_groups: "[…]" }, verification: { result: "INDETERMINATE" }, blockchain_write_performed: false }, null, 2),
  },
  {
    method: "GET",
    path: "/certificates",
    purpose: "List only genuine exported certificate fixtures enriched with current read-only chain state.",
    request: "No body",
    response: "CertificateExplorerRecord[]",
    errors: "Live fields are marked unavailable if RPC reads fail.",
    authenticity: ["DEMO FIXTURE", "LIVE ON-CHAIN", "DERIVED"],
    responseExample: JSON.stringify([{ certificate_id: KNOWN_USDY_CERTIFICATE_ID, found: true, usability: { state: "EXPIRED", usable: false } }], null, 2),
  },
  {
    method: "GET",
    path: "/certificates/{certificate_id}",
    purpose: "Inspect one bytes32 certificate ID, usability, decisions, and PolicyGate outcome.",
    request: "Path certificate_id: 0x + 64 hex characters",
    response: "CertificateExplorerRecord",
    errors: "400 malformed or unsupported certificate ID; live reads may be unavailable.",
    authenticity: ["DEMO FIXTURE", "LIVE ON-CHAIN", "DERIVED"],
    responseExample: JSON.stringify({ certificate_id: KNOWN_USDY_CERTIFICATE_ID, core: { result: "PASS" }, usability: { state: "EXPIRED", usable: false }, blockchain_write_performed: false }, null, 2),
  },
  {
    method: "POST",
    path: "/demo/run",
    purpose: "Run a predefined deterministic workflow without an OpenAI request or transaction.",
    request: "DemoRunnerRequest",
    response: "DemoRunnerResponse",
    errors: "400 unsupported scenario; 422 invalid body; RPC steps can be marked unavailable.",
    authenticity: ["DETERMINISTIC RVC", "REAL TOOL CALL", "DEMO FIXTURE", "LIVE ON-CHAIN"],
    responseExample: JSON.stringify({ mode: "deterministic_demo", scenario: "usdy_treasury_verification", verification_result: "INDETERMINATE", trace: "[…]" }, null, 2),
  },
  {
    method: "POST",
    path: "/agent/verify",
    purpose: "Run an optional natural-language investigation over read-only ProofLayer tools.",
    request: "AgentRequest: exactly one of query or message (3–2,000 characters)",
    response: "AgentResponse",
    errors: "503 agent unconfigured; 502 provider execution failure; 422 invalid body.",
    authenticity: ["OPTIONAL AI", "READ-ONLY TOOLS"],
    responseExample: JSON.stringify({ available: false, error: "ProofLayer AI Verification Agent is not configured." }, null, 2),
  },
  {
    method: "GET",
    path: "/developer/status",
    purpose: "Report developer surface availability and fixed X Layer testnet integration metadata.",
    request: "No body",
    response: "DeveloperPlatformStatus",
    errors: "X Layer is marked unavailable rather than inferred when its read fails.",
    authenticity: ["LIVE READ", "DERIVED"],
    responseExample: JSON.stringify({ api: { status: "AVAILABLE" }, xlayer: { status: "CONNECTED" }, ai_agent: { status: "UNCONFIGURED" }, deterministic_verification: { status: "AVAILABLE" }, chain_id: 1952, write_operations_exposed: false }, null, 2),
  },
];

export const RESPONSE_SCHEMAS = [
  {
    name: "InstitutionalPolicy / PolicyEvaluation",
    fields: "policy_id, policy_version, policy_commitment, typed requirements; evaluation_id, asset, claim, trust_snapshot_id, authoritative verification_result, final_decision, rule_results, blocking_reasons, review_reasons, source_authenticity, blockchain_write_performed",
  },
  {
    name: "ProtocolDecision",
    fields: "protocol_type, asset, claim, intended_action, verification_status, verification_result, certificate_exists, certificate_usable, certificate_status, certificate_state, policygate_outcome, final_protocol_recommendation, blocking_reasons, evidence_root_count, reason_codes, authenticity_sources, explanation, trace, policy_config, chain_id, blockchain_write_performed",
  },
  {
    name: "CertificateExplorerRecord",
    fields: "certificate_id, found, live_certificate_found, local_fixture_found, fixture_matches_live, core, field_sources, labels, offchain_verification, registry, usability, decisions, enforcement, timeline, authenticity_sources, warnings, blockchain_write_performed",
  },
  {
    name: "EvidenceExplorerIndex / EvidenceAssetDetail",
    fields: "asset summaries; evidence_records, provenance dependency graph, verification predicates, missing_requirements, evidence_commitment, certificate_linkage, authenticity labels, warnings, blockchain_write_performed",
  },
  {
    name: "DemoRunnerResponse",
    fields: "mode, scenario, asset, claim, verification_result, certificate_status, policygate_outcome, reason_codes, evidence_root_count, trace, summary",
  },
  {
    name: "AgentResponse",
    fields: "answer, asset, claim, verification_result, certificate_status, policygate_outcome, evidence_root_count, reason_codes, tools_used, trace",
  },
] as const;

export const TYPESCRIPT_EXAMPLE = `const response = await fetch("/api/protocol/check", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    protocol_type: "lending",
    asset: "USDY",
    claim: "TreasuryBacking",
    action: "accept_as_collateral",
  }),
});

if (!response.ok) throw new Error(\`ProofLayer returned \${response.status}\`);
const decision = await response.json();
console.log(decision.final_protocol_recommendation);`;

export const PYTHON_EXAMPLE = `import json
from urllib.request import Request, urlopen

payload = json.dumps({
    "protocol_type": "lending",
    "asset": "USDY",
    "claim": "TreasuryBacking",
    "action": "accept_as_collateral",
}).encode()

request = Request(
    "http://127.0.0.1:8010/protocol/check",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urlopen(request) as response:
    print(json.load(response)["final_protocol_recommendation"])`;

export const CURL_EXAMPLE = `curl --request POST http://127.0.0.1:8010/protocol/check \\
  --header "Content-Type: application/json" \\
  --data '{"protocol_type":"lending","asset":"USDY","claim":"TreasuryBacking","action":"accept_as_collateral"}'`;

export const POLICY_CURL_EXAMPLE = `curl --request POST http://127.0.0.1:8010/policies/demo-conservative-lending/evaluate \\
  --header "Content-Type: application/json" \\
  --data '{"asset":"USDY","claim":"TreasuryBacking"}'`;

export const SOLIDITY_EXAMPLE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProofLayerPolicyGate {
    function validateAction(
        bytes32 certificateId,
        bytes32 expectedAssetId,
        bytes32 expectedClaimType,
        bytes32 expectedPolicyId
    ) external view returns (bool);
}

contract ProofLayerConsumer {
    IProofLayerPolicyGate public immutable policyGate;

    constructor(address policyGateAddress) {
        policyGate = IProofLayerPolicyGate(policyGateAddress);
    }

    function canProceed(
        bytes32 certificateId,
        bytes32 assetId,
        bytes32 claimType,
        bytes32 policyId
    ) external view returns (bool) {
        return policyGate.validateAction(
            certificateId,
            assetId,
            claimType,
            policyId
        );
    }
}`;
