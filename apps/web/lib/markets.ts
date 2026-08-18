const API_BASE = "/api/markets";

export type SupportedMarketAsset = "USDY" | "PAXG";
export type MarketAction = "swap" | "withdraw";
export type MarketRecommendation = "ACCESSIBLE" | "BLOCKED" | "UNAVAILABLE";

export type MarketTraceStep = {
  step: number;
  tool: string;
  status: "completed" | "unavailable";
  outcome: string;
  duration_ms: number;
  authenticity_labels: string[];
};

export type MarketEligibilityResult = {
  asset: SupportedMarketAsset;
  action: MarketAction;
  verification_status: "COMPLETED" | "UNAVAILABLE";
  verification_result: string | null;
  certificate_exists: boolean | null;
  certificate_usable: boolean | null;
  certificate_status: string;
  certificate_state: string;
  policygate_outcome: string;
  recommendation: MarketRecommendation;
  blocking_reasons: string[];
  reason_codes: string[];
  authenticity_sources: string[];
  explanation: string[];
  trace: MarketTraceStep[];
  state_scope: string;
  chain_id: number;
  blockchain_write_performed: boolean;
};

export async function fetchMarketEligibility(
  asset: SupportedMarketAsset,
  action: MarketAction = "swap",
): Promise<MarketEligibilityResult> {
  const response = await fetch(`${API_BASE}/eligibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset, action }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Market eligibility check failed (${response.status})`);
  }
  return response.json() as Promise<MarketEligibilityResult>;
}
