import type { Metadata } from "next";

import { CertificateDetailExplorer } from "@/components/certificate-detail-explorer";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Verification Certificate",
  description: "Inspect a ProofLayer verification certificate and its current X Layer state.",
};

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ certificateId: string }>;
}) {
  const { certificateId } = await params;
  return (
    <div className="min-h-screen bg-[#0b0c10]">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <CertificateDetailExplorer certificateId={certificateId} />
        </div>
      </main>
    </div>
  );
}
