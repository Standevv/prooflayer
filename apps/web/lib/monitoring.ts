export type MonitoredAsset = "USDY" | "PAXG";
export type MonitoredClaim = "TreasuryBacking" | "GoldBacking";
export type VerificationResult = "PASS" | "FAIL" | "INDETERMINATE" | "UNAVAILABLE";
export type FreshnessState = "CURRENT" | "AGING" | "STALE" | "UNKNOWN" | "MIXED";
export type TransitionSeverity = "INFO" | "WARNING" | "CRITICAL";

export type MonitoringConfig = {
  asset: MonitoredAsset;
  claim: MonitoredClaim;
  enabled: boolean;
  check_interval_seconds: number;
  monitor_verification: boolean;
  monitor_evidence_freshness: boolean;
  monitor_certificate: boolean;
  monitor_policygate: boolean;
};

export type EvidenceFreshnessRecord = {
  source_id: string;
  source_type: string;
  observed_at: string | null;
  policy_max_age: string | null;
  freshness: FreshnessState;
  explanation: string;
  authenticity_labels: string[];
};

export type TrustSnapshot = {
  snapshot_id: string;
  asset: MonitoredAsset;
  claim: MonitoredClaim;
  checked_at: string;
  verification_result: VerificationResult;
  reason_codes: string[];
  evidence_root: string | null;
  independent_root_count: number | null;
  evidence_freshness: FreshnessState | null;
  evidence_freshness_records: EvidenceFreshnessRecord[];
  certificate_id: string | null;
  certificate_exists: boolean | null;
  certificate_usable: boolean | null;
  certificate_status: string;
  certificate_lifecycle_state: string;
  certificate_historical_result: string | null;
  certificate_valid_until: number | null;
  policygate_outcome: "ALLOW" | "BLOCK" | "NOT CHECKED" | "UNAVAILABLE";
  source_status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  authenticity_sources: string[];
  source_errors: string[];
  blockchain_write_performed: false;
};

export type TrustTransition = {
  transition_id: string;
  asset: MonitoredAsset;
  claim: MonitoredClaim;
  occurred_at: string;
  previous_snapshot_id: string;
  current_snapshot_id: string;
  category: string;
  previous_value: string | number | boolean | string[] | null;
  current_value: string | number | boolean | string[] | null;
  severity: TransitionSeverity;
  explanation: string;
};

export type MonitoringAssetSummary = {
  asset: MonitoredAsset;
  claim: MonitoredClaim;
  config: MonitoringConfig;
  current_snapshot: TrustSnapshot | null;
  snapshot_count: number;
  transition_count: number;
  href: string;
};

export type MonitoringOverview = {
  assets: MonitoringAssetSummary[];
  monitoring_mode: "LOCAL / MVP";
  production_scheduling_enabled: false;
  write_automation_enabled: false;
  blockchain_write_performed: false;
};

export type MonitoringAssetDetail = {
  asset: MonitoredAsset;
  claim: MonitoredClaim;
  config: MonitoringConfig;
  current_snapshot: TrustSnapshot | null;
  recent_snapshots: TrustSnapshot[];
  recent_transitions: TrustTransition[];
  monitoring_mode: "LOCAL / MVP";
  production_scheduling_enabled: false;
  automatic_certificate_actions: false;
  blockchain_write_performed: false;
};

export type MonitoringCheckResult = {
  current_snapshot: TrustSnapshot;
  previous_snapshot: TrustSnapshot | null;
  transitions: TrustTransition[];
  snapshot_persisted: boolean;
  transition_count_persisted: number;
  next_recommended_check: string;
  monitoring_mode: "LOCAL / MVP";
  production_scheduling_enabled: false;
  blockchain_write_performed: false;
};

export type MonitoringApiError = { available: false; error: string };

export function resultStyle(result: VerificationResult | "NOT CHECKED"): string {
  if (result === "PASS") return "border-[#36d17c]/30 bg-[#36d17c]/[0.08] text-[#5cdb94]";
  if (result === "FAIL") return "border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.08] text-[#ff8181]";
  if (result === "INDETERMINATE") return "border-[#e9b949]/30 bg-[#e9b949]/[0.08] text-[#e9c55f]";
  return "border-white/[0.1] bg-white/[0.035] text-[#9ca1ad]";
}

export function freshnessStyle(state: FreshnessState | null): string {
  if (state === "CURRENT") return "text-[#5cdb94]";
  if (state === "STALE") return "text-[#ff8181]";
  if (state === "AGING" || state === "MIXED") return "text-[#e9c55f]";
  return "text-[#9ca1ad]";
}

export function severityStyle(severity: TransitionSeverity): string {
  if (severity === "CRITICAL") return "border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.07] text-[#ff8181]";
  if (severity === "WARNING") return "border-[#e9b949]/30 bg-[#e9b949]/[0.07] text-[#e9c55f]";
  return "border-[#8f7df0]/30 bg-[#8f7df0]/[0.07] text-[#b6abf7]";
}

export function formatMonitoringTime(value: string | null): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(date) + " UTC";
}

export function displayValue(value: TrustTransition["current_value"]): string {
  if (value === null) return "Not available";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "None";
  return String(value);
}
