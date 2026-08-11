export type ProtocolType = "lending" | "rwa_vault" | "treasury_management";
export type SupportedProtocolAsset = "USDY" | "PAXG";
export type SupportedProtocolClaim = "TreasuryBacking" | "GoldBacking";
export type ProtocolAction =
  | "accept_as_collateral"
  | "admit_to_vault"
  | "approve_for_treasury_allocation";

export type ProtocolPreset = {
  label: string;
  action: ProtocolAction;
  actionLabel: string;
  primaryConcern: string;
};

export const PROTOCOL_PRESETS: Record<ProtocolType, ProtocolPreset> = {
  lending: {
    label: "Lending Protocol",
    action: "accept_as_collateral",
    actionLabel: "Accept asset as collateral",
    primaryConcern: "Requires a currently usable certificate for the backing claim.",
  },
  rwa_vault: {
    label: "RWA Vault",
    action: "admit_to_vault",
    actionLabel: "Admit asset into vault",
    primaryConcern: "Requires policy satisfaction and usable certificate state.",
  },
  treasury_management: {
    label: "Treasury Management",
    action: "approve_for_treasury_allocation",
    actionLabel: "Approve asset for treasury allocation",
    primaryConcern: "Requires a backing claim that is currently verifiable and enforceable.",
  },
};

export const ASSET_CLAIMS: Record<SupportedProtocolAsset, SupportedProtocolClaim> = {
  USDY: "TreasuryBacking",
  PAXG: "GoldBacking",
};

export type ProtocolTraceStep = {
  step: number;
  tool: string;
  status: "completed" | "unavailable";
  outcome: string;
  duration_ms: number;
  authenticity_labels: Array<
    "PROOFLAYER TOOL" | "DETERMINISTIC RVC" | "LIVE ON-CHAIN" | "POLICY CHECK"
  >;
};

export type ProtocolDecision = {
  protocol_type: ProtocolType;
  protocol_label: string;
  asset: SupportedProtocolAsset;
  claim: SupportedProtocolClaim;
  intended_action: ProtocolAction;
  action_label: string;
  verification_status: "COMPLETED" | "UNAVAILABLE";
  verification_result: "PASS" | "FAIL" | "INDETERMINATE" | null;
  certificate_exists: boolean | null;
  certificate_usable: boolean | null;
  certificate_status:
    | "REGISTERED_USABLE"
    | "REGISTERED_UNUSABLE"
    | "NOT_REGISTERED"
    | "UNAVAILABLE"
    | "NOT_CHECKED";
  certificate_state:
    | "USABLE"
    | "EXPIRED"
    | "REVOKED"
    | "REGISTERED_UNUSABLE"
    | "NO_CERTIFICATE"
    | "NO_CERTIFICATE_FIXTURE"
    | "LIVE_READ_UNAVAILABLE"
    | "NOT_CHECKED";
  policygate_outcome: "ALLOWED" | "BLOCKED" | "UNAVAILABLE" | "NOT_CHECKED";
  final_protocol_recommendation: "ACCEPT" | "REJECT" | "REVIEW_REQUIRED";
  blocking_reasons: string[];
  evidence_root_count: number | null;
  reason_codes: string[];
  authenticity_sources: string[];
  explanation: string[];
  trace: ProtocolTraceStep[];
  policy_config: {
    require_pass_result: boolean;
    require_usable_certificate: boolean;
    require_policygate_allow: boolean;
  };
  state_scope: "CURRENT PROOFLAYER STATE";
  simulation_scope: "PROTOCOL SIMULATION";
  chain_id: 1952;
  policygate_address: "0x8e07048285D5f54a3D1D2093b80F4Aa2ce75C645";
  blockchain_write_performed: false;
};

export type ProtocolErrorResponse = {
  available?: boolean;
  error?: string;
};
