import Image from "next/image";

import { CertificateCard } from "@/components/certificate-card";
import { DecisionLogPanel } from "@/components/decision-log";
import { EvidencePanel } from "@/components/evidence-panel";
import { OnchainStatus } from "@/components/onchain-status";
import { PolicyGateFlow } from "@/components/policy-gate-flow";
import { ProofLayerDemo } from "@/components/prooflayer-demo";
import { RealWorldAssets } from "@/components/real-world-assets";
import { ResultSemantics } from "@/components/result-semantics";
import { Sidebar } from "@/components/sidebar";
import { SummaryStrip } from "@/components/summary-strip";
import { VerificationWorkspace } from "@/components/verification-workspace";
import { VerificationAgent } from "@/components/verification-agent";
import { getCertificateStatus } from "@/lib/certificate-status";
import { USDY_INDETERMINATE_CERTIFICATE, USDY_PASS_CERTIFICATE } from "@/lib/demo-data";
import { getOnchainDashboardData } from "@/lib/onchain";

export const dynamic = "force-dynamic";

const trustFlow = [
  { number: "01", label: "Evidence" },
  { number: "02", label: "Provenance" },
  { number: "03", label: "Verification" },
  { number: "04", label: "Certificate" },
  { number: "05", label: "PolicyGate" },
  { number: "06", label: "Decision" },
] as const;

export default async function DashboardPage() {
  const [onchain, indeterminateOnchain] = await Promise.all([
    getOnchainDashboardData(USDY_PASS_CERTIFICATE.solidity.certificateId, {
      includeDecision: false,
    }),
    getOnchainDashboardData(USDY_INDETERMINATE_CERTIFICATE.solidity.certificateId, {
      includeDecision: false,
    }),
  ]);
  const certificateStatus = getCertificateStatus(onchain);
  const indeterminateCertificateStatus = getCertificateStatus(indeterminateOnchain);

  return (
    <div id="overview" className="min-h-screen">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1320px] px-4 py-4 sm:px-6 lg:px-7 lg:py-6">
          <section className="command-header relative overflow-hidden rounded-[10px] border border-white/[0.1] px-5 py-6 sm:px-7 sm:py-8 lg:px-8 lg:py-9">
            <div className="command-header-image absolute inset-y-0 right-0 hidden w-[52%] sm:block lg:w-[48%]" aria-hidden="true">
              <Image
                src="/assets/us-treasury.webp"
                alt=""
                fill
                priority
                sizes="(max-width: 1023px) 52vw, 48vw"
                className="object-cover object-[52%_center]"
              />
            </div>

            <div className="relative z-10 grid gap-8 md:grid-cols-[minmax(0,1fr)_290px] md:items-stretch lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8f84dd]">
                  ProofLayer / RWA Verification Infrastructure
                </p>
                <h1 className="mt-4 max-w-[650px] text-[28px] font-semibold leading-[1.05] tracking-[-0.045em] text-[#f7f7fa] sm:text-[32px] lg:text-[40px]">
                  Trust infrastructure for tokenized assets
                </h1>
                <p className="mt-4 max-w-[620px] text-[13px] leading-6 text-[#b1b5bf] sm:text-[14px]">
                  Verify real-world asset claims, issue tamper-resistant certificates, and enforce policy on-chain.
                </p>

                <div className="mt-7 max-w-[620px] overflow-x-auto pb-1" aria-label="Verification architecture">
                  <ol className="grid min-w-[300px] grid-cols-[auto_minmax(16px,1fr)_auto_minmax(16px,1fr)_auto_minmax(16px,1fr)_auto] items-center">
                    {trustFlow.map((step, index) => (
                      <li key={step.number} className="contents">
                        <span className={`flex flex-col gap-1 text-[9px] font-bold uppercase tracking-[0.1em] ${index === 1 ? "text-[#c4bbff] drop-shadow-[0_0_10px_rgba(143,125,240,0.34)]" : index < 1 ? "text-[#67de98]" : "text-[#8b909d]"}`}>
                          <span className={`font-mono text-[9px] tracking-normal ${index === 1 ? "text-[#8f7df0]" : index < 1 ? "text-[#36d17c]" : "text-[#626774]"}`}>
                            {step.number}
                          </span>
                          {step.label}
                        </span>
                        {index < trustFlow.length - 1 ? (
                          <span className={`mx-2 h-px sm:mx-3 lg:mx-4 ${index === 0 ? "bg-[linear-gradient(90deg,rgba(54,209,124,0.5),rgba(143,125,240,0.55))]" : "bg-white/[0.12]"}`} aria-hidden="true" />
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <aside className="border-t border-white/[0.1] bg-black/[0.08] pt-5 md:border-l md:border-t-0 md:pl-5 md:pt-1 lg:pl-6" aria-label="System status">
                <div className="flex items-center justify-between gap-3 pb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#a5aea8]">System status</p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#626e67]">Read only</p>
                </div>
                <dl className="grid grid-cols-2 border-l border-t border-white/[0.1] bg-[#0b0c10]/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="border-b border-r border-white/[0.09] p-3">
                    <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Network</dt>
                    <dd className="mt-1.5 text-[11px] font-semibold text-[#d5dbd7]">X Layer Testnet</dd>
                  </div>
                  <div className="border-b border-r border-white/[0.09] p-3">
                    <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Status</dt>
                    <dd className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold ${onchain.connected ? "text-[#36d17c]" : "text-[#e9b949]"}`}>
                      <span className={`size-1.5 rounded-full ${onchain.connected ? "status-pulse bg-[#36d17c]" : "bg-[#e9b949]"}`} aria-hidden="true" />
                      {onchain.connected ? "Connected" : "Unavailable"}
                    </dd>
                  </div>
                  <div className="border-b border-r border-white/[0.09] p-3">
                    <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Chain</dt>
                    <dd className="mt-1.5 font-mono text-[11px] font-semibold text-[#d5dbd7]">{onchain.chainId ?? 1952}</dd>
                  </div>
                  <div className="border-b border-r border-white/[0.09] p-3">
                    <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Latest block</dt>
                    <dd className="mt-1.5 font-mono text-[11px] font-semibold text-[#d5dbd7]">{onchain.latestBlock?.toLocaleString("en-GB") ?? "--"}</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>

          <div className="mt-3 space-y-3">
            <SummaryStrip
              certificate={USDY_PASS_CERTIFICATE}
              onchain={onchain}
              certificateStatus={certificateStatus}
            />

            <ProofLayerDemo
              pass={{
                certificate: USDY_PASS_CERTIFICATE,
                onchain,
                certificateStatus,
              }}
              indeterminate={{
                certificate: USDY_INDETERMINATE_CERTIFICATE,
                onchain: indeterminateOnchain,
                certificateStatus: indeterminateCertificateStatus,
              }}
            />
          </div>

          <div className="mt-4 space-y-4">
            <section id="verify" className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111319]" aria-labelledby="verification-console-heading">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:px-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Primary workspace</p>
                  <h2 id="verification-console-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#f5f4f8]">Verification Console</h2>
                </div>
                <p className="text-[11px] text-[#818693]">Fixture-aware context / live X Layer status</p>
              </div>
              <VerificationWorkspace
                result={<ResultSemantics certificate={USDY_PASS_CERTIFICATE} certificateStatus={certificateStatus} />}
              />
              <VerificationAgent />
            </section>

            <RealWorldAssets />
            <EvidencePanel certificate={USDY_PASS_CERTIFICATE} />
            <CertificateCard certificate={USDY_PASS_CERTIFICATE} onchain={onchain} certificateStatus={certificateStatus} />
            <OnchainStatus data={onchain} />
            <PolicyGateFlow />
            <DecisionLogPanel data={onchain} />
          </div>

          <footer className="mt-5 flex flex-col gap-1 border-t border-white/[0.08] py-4 text-[10px] leading-4 text-[#747987] sm:flex-row sm:justify-between">
            <p>Demo evidence fixture + live read-only contract state. No wallet connection required.</p>
            <p>ProofLayer MVP / X Layer Testnet</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
