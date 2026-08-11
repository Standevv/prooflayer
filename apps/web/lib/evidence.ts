export type FreshnessState = "CURRENT" | "AGING" | "STALE" | "UNKNOWN";
export type FreshnessSummary = FreshnessState | "MIXED";
export type EvidenceAuthenticityLabel =
  | "ISSUER"
  | "ATTESTATION"
  | "ON-CHAIN"
  | "DEMO FIXTURE"
  | "DERIVED"
  | "LIVE READ"
  | "CACHED OFFICIAL EVIDENCE";
export type EvidenceVerificationResult = "PASS" | "FAIL" | "INDETERMINATE";

export type EvidenceRecordView = {
  record_id: string;
  source_id: string;
  source_type: string;
  root_source_id: string;
  dependency_parent_ids: string[];
  evidence_tier: string;
  asset: string;
  field: string;
  value: unknown;
  unit: string | null;
  observed_at: string | null;
  retrieved_at: string | null;
  content_hash: string | null;
  simulation: boolean;
  freshness: FreshnessState;
  freshness_reason: string;
  authenticity_labels: EvidenceAuthenticityLabel[];
};

export type PredicateView = {
  predicate: string;
  passed: boolean | null;
  expected: unknown;
  observed: unknown;
  reason_code: string | null;
};

export type GraphNode = {
  id: string;
  kind:
    | "ASSET"
    | "CLAIM"
    | "ROOT_SOURCE"
    | "DIRECT_OBSERVATION"
    | "DEPENDENT_SOURCE"
    | "ONCHAIN_SOURCE"
    | "ATTESTATION";
  label: string;
  subtitle: string;
  root_source_id: string | null;
  record_ids: string[];
  evidence_tiers: string[];
  freshness: FreshnessSummary;
  authenticity_labels: EvidenceAuthenticityLabel[];
};

export type GraphEdge = {
  source: string;
  target: string;
  relationship: "CLAIM" | "ROOT" | "OBSERVATION" | "DEPENDENCY";
};

export type EvidenceAssetSummary = {
  asset_slug: "usdy" | "paxg";
  asset: "USDY" | "PAXG";
  asset_class: string;
  claim: "TreasuryBacking" | "GoldBacking";
  evidence_record_count: number;
  observed_source_count: number;
  independent_root_count: number;
  independent_root_ids: string[];
  verification_result: EvidenceVerificationResult;
  reason_codes: string[];
  freshness_summary: FreshnessSummary;
  evidence_commitment: string;
  source_mode: string;
  authenticity_labels: EvidenceAuthenticityLabel[];
  href: string;
};

export type EvidenceExplorerIndex = {
  assets: EvidenceAssetSummary[];
  comparison_fields: string[];
  source_mode_note: string;
  evidence_tier_definitions_available: false;
  blockchain_write_performed: false;
};

export type EvidenceAssetDetail = {
  asset_slug: "usdy" | "paxg";
  asset: "USDY" | "PAXG";
  asset_class: string;
  claim: "TreasuryBacking" | "GoldBacking";
  source_mode: string;
  source_mode_note: string;
  freshness_summary: FreshnessSummary;
  evidence_records: EvidenceRecordView[];
  provenance: {
    observed_source_count: number;
    evidence_record_count: number;
    independent_root_count: number;
    independent_root_ids: string[];
    duplicated_or_dependent_source_count: number;
    duplicated_or_dependent_sources: string[];
    dependency_groups: Array<{
      root_source_id: string;
      source_ids: string[];
      observation_count: number;
    }>;
    graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  };
  verification: {
    result: EvidenceVerificationResult;
    reason_codes: string[];
    policy_id: string;
    policy_version: string;
    predicates: PredicateView[];
    observed_at: string;
    valid_until: string;
    simulation: boolean;
    authority: string;
    source: "DERIVED";
  };
  missing_requirements: string[];
  evidence_commitment: {
    value: string;
    independent_root_count: number;
    source: "DERIVED";
    description: string;
  };
  certificate_linkage: {
    status: "AVAILABLE" | "NO CERTIFICATE" | "UNAVAILABLE" | "NOT CHECKED";
    certificate_id: string | null;
    verification_result: string | null;
    current_usability: string | null;
    live_registered: boolean | null;
    certificate_evidence_root: string | null;
    evidence_commitment_matches: boolean | null;
    match_status: "EXACT MATCH" | "DOES NOT MATCH" | "UNAVAILABLE" | "NOT CHECKED";
    href: string | null;
    authenticity_labels: string[];
    note: string;
  };
  evidence_tier_definitions_available: false;
  warnings: string[];
  blockchain_write_performed: false;
};

export type EvidenceApiError = { available: false; error: string };

export function evidenceValue(value: unknown): string {
  if (value === null || value === undefined) return "Not available";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function evidenceResultStyle(result: EvidenceVerificationResult): string {
  if (result === "PASS") return "border-[#36d17c]/25 bg-[#36d17c]/[0.07] text-[#36d17c]";
  if (result === "FAIL") return "border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.07] text-[#ff8181]";
  return "border-[#e9b949]/25 bg-[#e9b949]/[0.07] text-[#e9b949]";
}

export function freshnessStyle(state: FreshnessSummary): string {
  if (state === "CURRENT") return "border-[#36d17c]/25 bg-[#36d17c]/[0.07] text-[#36d17c]";
  if (state === "STALE") return "border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.07] text-[#ff8181]";
  if (state === "AGING" || state === "MIXED") return "border-[#e9b949]/25 bg-[#e9b949]/[0.07] text-[#e9b949]";
  return "border-white/[0.1] bg-white/[0.035] text-[#9ca1ad]";
}
