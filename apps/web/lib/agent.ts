export type AgentTraceStep = {
  tool: string;
  arguments: {
    asset: string | null;
    claim: string | null;
    certificate_id: string | null;
    policy: string | null;
    topic: string | null;
    audience: string | null;
  };
  status: "completed" | "error";
  summary: string;
};

export type AuthoritativeResult = {
  asset: string;
  claim: string;
  verification_result: "PASS" | "FAIL" | "INDETERMINATE" | null;
  certificate_status:
    | "REGISTERED_USABLE"
    | "REGISTERED_UNUSABLE"
    | "NOT_REGISTERED"
    | "UNAVAILABLE"
    | null;
  policygate_outcome: "ALLOWED" | "BLOCKED" | "UNAVAILABLE" | null;
  evidence_root_count: number | null;
  reason_codes: string[];
};

export type InvestigationMode =
  | "SINGLE_VERIFICATION"
  | "COMPARISON"
  | "CERTIFICATE_EXPLANATION"
  | "CAPABILITY_DISCOVERY"
  | "ARCHITECTURE_EXPLANATION";

export type AgentResponse = {
  answer: string;
  mode: InvestigationMode;
  asset: string | null;
  claim: string | null;
  verification_result: "PASS" | "FAIL" | "INDETERMINATE" | null;
  certificate_status:
    | "REGISTERED_USABLE"
    | "REGISTERED_UNUSABLE"
    | "NOT_REGISTERED"
    | "UNAVAILABLE"
    | null;
  policygate_outcome: "ALLOWED" | "BLOCKED" | "UNAVAILABLE" | null;
  evidence_root_count: number | null;
  reason_codes: string[];
  authoritative_results: AuthoritativeResult[];
  tools_used: string[];
  trace: AgentTraceStep[];
};

export type AgentErrorResponse = {
  available?: boolean;
  error?: string;
};

export type DemoScenario =
  | "usdy_treasury_verification"
  | "paxg_gold_verification"
  | "usdy_certificate_eligibility"
  | "provenance_inspection";

export type DemoTraceStep = {
  step: number;
  tool: string;
  arguments: {
    asset: string | null;
    claim: string | null;
    certificate_id: string | null;
    policy: string | null;
  };
  status: "completed" | "unavailable";
  result_summary: string;
  duration_ms: number;
  authenticity_labels: Array<
    "REAL TOOL CALL" | "DETERMINISTIC RVC" | "LIVE ON-CHAIN" | "DEMO FIXTURE"
  >;
};

export type DemoRunnerResponse = {
  mode: "deterministic_demo";
  scenario: DemoScenario;
  asset: string;
  claim: string;
  verification_result: "PASS" | "FAIL" | "INDETERMINATE" | null;
  certificate_status:
    | "REGISTERED_USABLE"
    | "REGISTERED_UNUSABLE"
    | "NOT_REGISTERED"
    | "UNAVAILABLE"
    | null;
  policygate_outcome: "ALLOWED" | "BLOCKED" | "UNAVAILABLE" | "NOT_CHECKED" | null;
  reason_codes: string[];
  evidence_root_count: number | null;
  trace: DemoTraceStep[];
  summary: string;
};

export type IssuanceReadiness = {
  ready: boolean;
  static_ready: boolean;
  chain_matches: boolean;
  registry_has_code: boolean;
  signer_key_present: boolean;
  rpc_reachable: boolean;
  note: string;
  enabled: boolean;
  operator_auth_configured: boolean;
  control_scope: string;
};

export type CertificateIssuanceResponse = {
  success?: boolean;
  certificate_id?: string | null;
  transaction_hash?: string | null;
  block_number?: number | null;
  read_back?: { matches?: boolean } | null;
  error?: string | null;
  error_code?: string | null;
  request_id?: string | null;
  operator_id?: string | null;
  idempotent_replay?: boolean;
  authoritative_observed_at?: string | null;
  authoritative_valid_until?: string | null;
  audit_status?: string | null;
};

export type OrchestrationHealth = {
  status: "ok";
  backend_status: "ONLINE" | "OFFLINE";
  agent_configured: boolean;
  ai_provider?: string;
  model: string;
  write_capabilities: boolean;
  issuance_readiness?: IssuanceReadiness;
};

export type ProviderHealth = {
  provider_status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  provider_error: string | null;
  model: string;
  ai_provider: string;
};

export type AgentHealthState = {
  apiStatus: "checking" | "online" | "offline";
  agentConfigured: boolean;
  providerStatus: "checking" | "online" | "offline" | "unknown";
  providerError: string | null;
};
