export type AuthenticitySource =
  | "LIVE ON-CHAIN"
  | "DEMO FIXTURE"
  | "DERIVED"
  | "DERIVED FROM KNOWN PROJECT CONFIG"
  | "UNAVAILABLE";

export type VerificationResult = "PASS" | "FAIL" | "INDETERMINATE" | "UNKNOWN";
export type UsabilityState =
  | "USABLE"
  | "EXPIRED"
  | "REVOKED"
  | "NON-PASS"
  | "NOT REGISTERED"
  | "LIVE READ UNAVAILABLE"
  | "UNUSABLE";

export type CertificateCore = {
  certificate_id: string;
  asset_id: string | null;
  claim_type: string | null;
  policy_id: string | null;
  evidence_root: string | null;
  observed_at: number | null;
  valid_until: number | null;
  independent_root_count: number | null;
  result_code: number | null;
  result: VerificationResult | null;
  issuer: string | null;
  revoked: boolean | null;
};

export type CertificateExplorerRecord = {
  certificate_id: string;
  found: boolean;
  live_certificate_found: boolean | null;
  local_fixture_found: boolean;
  fixture_matches_live: boolean | null;
  core: CertificateCore;
  field_sources: Record<keyof CertificateCore, AuthenticitySource>;
  labels: {
    asset: string | null;
    claim: string | null;
    policy: string | null;
    source: "DERIVED FROM KNOWN PROJECT CONFIG";
  };
  offchain_verification: {
    claim_version: string;
    policy_version: string;
    reason_codes: string[];
    compiler_version: string;
    simulation: boolean;
    source: "DEMO FIXTURE";
  } | null;
  registry: {
    read_status: "AVAILABLE" | "UNAVAILABLE";
    network: "X Layer Testnet";
    chain_id: 1952;
    registry_address: string;
    certificate_exists: boolean | null;
    current_usable: boolean | null;
    issuer: string | null;
    revoked: boolean | null;
    latest_block: number | null;
    error: string | null;
    source: AuthenticitySource;
  };
  usability: {
    state: UsabilityState;
    usable: boolean | null;
    reason: string;
    source: AuthenticitySource;
  };
  decisions: {
    read_status: "AVAILABLE" | "UNAVAILABLE" | "NOT CHECKED";
    records: Array<{
      decision_id: string;
      certificate_id: string;
      actor: string;
      action_type: string;
      allowed: boolean;
      timestamp: number;
      block_number: number;
      transaction_hash: string | null;
      source: "LIVE ON-CHAIN";
    }>;
    matching_count: number;
    total_decision_count: number | null;
    query_from_block: number | null;
    query_to_block: number | null;
    history_complete_since_deployment: boolean | null;
    note: string;
    source: AuthenticitySource;
  };
  enforcement: {
    read_status: "AVAILABLE" | "UNAVAILABLE" | "NOT CHECKED";
    policygate_address: string;
    certificate_usable: boolean | null;
    outcome: "ALLOW" | "BLOCK" | "NOT CHECKED" | "UNAVAILABLE";
    reason: string;
    source: AuthenticitySource;
    action_executed: false;
  };
  timeline: {
    observed_at: number | null;
    registered_network: string | null;
    registration_timestamp: null;
    valid_until: number | null;
    validity_state: "ACTIVE" | "EXPIRED" | "UNAVAILABLE";
    current_state: UsabilityState;
  };
  authenticity_sources: string[];
  warnings: string[];
  blockchain_write_performed: false;
};

export type CertificateApiError = {
  available: false;
  error: string;
};

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function isCertificateId(value: string): boolean {
  return BYTES32_PATTERN.test(value.trim());
}

export function formatCertificateTime(value: number | null): string {
  if (value === null) return "Unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value * 1_000));
}

export function sourceTone(source: AuthenticitySource): "live" | "fixture" | "derived" | "unavailable" {
  if (source === "LIVE ON-CHAIN") return "live";
  if (source === "DEMO FIXTURE") return "fixture";
  if (source === "UNAVAILABLE") return "unavailable";
  return "derived";
}
