import { USDY_INDETERMINATE_CERTIFICATE } from "@/lib/demo-data";
import { getOnchainDashboardData } from "@/lib/onchain";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getOnchainDashboardData(
    USDY_INDETERMINATE_CERTIFICATE.solidity.certificateId,
  );

  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
