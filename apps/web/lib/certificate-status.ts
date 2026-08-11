import type { OnchainDashboardData } from "@/lib/onchain";

export function getCertificateStatus(
  data: OnchainDashboardData,
  nowSeconds = Math.floor(Date.now() / 1_000),
): string {
  if (!data.connected || data.registered === null) return "Unavailable";
  if (!data.registered) return "Not registered";
  if (data.certificate?.revoked) return "Revoked";
  if (data.usable) return "Active";
  if (data.certificate !== null && data.certificate.validUntil < nowSeconds) {
    return "Expired";
  }
  return "Inactive";
}
