export type PolicyAsset = "USDY" | "PAXG";
export type PolicyClaim = "TreasuryBacking" | "GoldBacking";
export type PolicyDecision = "ACCEPT" | "REJECT" | "REVIEW_REQUIRED";
export type RuleStatus = "SATISFIED" | "NOT_SATISFIED" | "UNAVAILABLE" | "NOT_APPLICABLE";

export const POLICY_REASON_CODES = [
  "MISSING_EVIDENCE",
  "STALE_ATTESTATION",
  "UNDERCOLLATERALIZED",
  "INVALID_EVIDENCE",
  "INVALID_GOLD_TOKEN_RELATIONSHIP",
  "INSUFFICIENT_ALLOCATED_GOLD",
  "LOW_BACKING_RATIO",
  "INVALID_ATTESTATION_TIMESTAMP",
  "UNVERIFIED_ISSUER_CONTRACT",
] as const;

export type InstitutionalPolicyDraft = {
  policy_id?: string | null;
  name: string;
  description: string;
  supported_asset: PolicyAsset | null;
  supported_claim: PolicyClaim;
  required_verification_results: ["PASS"];
  minimum_independent_roots: number | null;
  require_certificate: boolean;
  require_certificate_usable: boolean;
  require_not_revoked: boolean;
  require_policygate_allow: boolean;
  maximum_attestation_age_days: number | null;
  blocking_reason_codes: string[];
  enabled: boolean;
};

export type InstitutionalPolicy = InstitutionalPolicyDraft & {
  policy_id: string;
  policy_version: number;
  policy_commitment: string;
  source: "DEMO POLICY PRESET" | "SAVED POLICY";
  created_at: string;
  updated_at: string;
  mvp_status: "MVP / PRE-PRODUCTION";
  blockchain_write_performed: false;
};

export type PolicyRuleResult = {
  rule: string;
  required: unknown;
  observed: unknown;
  status: RuleStatus;
  explanation: string;
};

export type PolicyEvaluation = {
  evaluation_id: string;
  policy_id: string;
  policy_version: number;
  policy_commitment: string;
  asset: PolicyAsset;
  claim: PolicyClaim;
  evaluated_at: string;
  trust_snapshot_id: string;
  verification_result: "PASS" | "FAIL" | "INDETERMINATE" | "UNAVAILABLE";
  final_decision: PolicyDecision;
  rule_results: PolicyRuleResult[];
  blocking_reasons: string[];
  review_reasons: string[];
  explanation: string;
  source_authenticity: string[];
  evaluation_mode: "CURRENT READ-ONLY STATE";
  blockchain_write_performed: false;
  openai_call_performed: false;
};

export type PolicyDecisionTransition = {
  previous_evaluation_id: string;
  current_evaluation_id: string;
  occurred_at: string;
  previous_decision: PolicyDecision;
  current_decision: PolicyDecision;
};

export type PolicySummary = {
  policy: InstitutionalPolicy;
  last_evaluation: PolicyEvaluation | null;
  evaluation_count: number;
  href: string;
};

export type PolicyStudioOverview = {
  presets: PolicySummary[];
  saved_policies: PolicySummary[];
  supported_reason_codes: string[];
  api_status: "MVP / PRE-PRODUCTION";
  automatic_re_evaluation_enabled: false;
  blockchain_write_performed: false;
};

export type PolicyDetail = {
  policy: InstitutionalPolicy;
  evaluations: PolicyEvaluation[];
  decision_transitions: PolicyDecisionTransition[];
  compatible_assets: PolicyAsset[];
  automatic_re_evaluation_enabled: false;
  blockchain_write_performed: false;
};

export type PolicyApiError = { available: false; error: string };

export function policyDecisionStyle(decision: PolicyDecision | "NOT EVALUATED"): string {
  if (decision === "ACCEPT") return "border-[#36d17c]/30 bg-[#36d17c]/[0.08] text-[#62dc97]";
  if (decision === "REJECT") return "border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.08] text-[#ff8585]";
  if (decision === "REVIEW_REQUIRED") return "border-[#e9b949]/30 bg-[#e9b949]/[0.08] text-[#e9c45d]";
  return "border-white/[0.1] bg-white/[0.035] text-[#969ca7]";
}

export function ruleStatusStyle(status: RuleStatus): string {
  if (status === "SATISFIED") return "text-[#62dc97]";
  if (status === "NOT_SATISFIED") return "text-[#ff8585]";
  if (status === "UNAVAILABLE") return "text-[#e9c45d]";
  return "text-[#777d89]";
}

export function policyTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
}

export function policyValue(value: unknown): string {
  if (value === null || value === undefined) return "Not available";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replaceAll("_", " ");
}
