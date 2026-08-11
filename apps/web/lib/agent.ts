export type AgentTraceStep = {
  tool: string;
  arguments: {
    asset: string | null;
    claim: string | null;
    certificate_id: string | null;
    policy: string | null;
  };
  status: "completed" | "error";
  summary: string;
};

export type AgentResponse = {
  answer: string;
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

export type OrchestrationHealth = {
  status: "ok";
  agent_configured: boolean;
  deterministic_demo_available: boolean;
  model: string;
  write_capabilities: false;
};
