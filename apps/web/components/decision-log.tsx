import { CopyValue } from "@/components/copy-value";
import { XLAYER_TESTNET } from "@/lib/contracts";
import type { OnchainDashboardData } from "@/lib/onchain";

function formatUnixTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

export function DecisionLogPanel({ data }: { data: OnchainDashboardData }) {
  return (
    <section id="decisions" className="overflow-hidden rounded-[10px] border border-edge bg-surface" aria-labelledby="decisions-heading">
      <div className="flex items-end justify-between gap-3 border-b border-edge px-5 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary">Immutable audit trail</p>
          <h2 id="decisions-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-brand-bright">Decision Activity</h2>
        </div>
        <span className="font-mono text-[10px] text-secondary">{data.decisionCount ?? "--"} total</span>
      </div>

      {data.decision === null && !data.decisionLookupComplete ? (
        <div className="px-5 py-6 sm:px-6">
          <p className="text-[12px] font-semibold text-accent">Historical decision lookup deferred</p>
          <p className="mt-1 text-[10px] leading-4 text-secondary">Use the verification workflow&apos;s PolicyGate stage to request the bounded DecisionLog event lookup.</p>
        </div>
      ) : data.decision === null ? (
        <div className="px-5 py-6 sm:px-6">
          <p className="text-[12px] font-semibold text-accent">No matching successful decision found</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="bg-overlay-active text-[9px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                <tr>
                  <th className="border-b border-edge px-5 py-3 sm:px-6">Decision ID</th>
                  <th className="border-b border-edge px-5 py-3">Actor</th>
                  <th className="border-b border-edge px-5 py-3">Action</th>
                  <th className="border-b border-edge px-5 py-3">Result</th>
                  <th className="border-b border-edge px-5 py-3 sm:px-6">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                <tr className="surface-transition text-[11px] text-accent hover:bg-overlay-hover">
                  <td className="px-5 py-4 sm:px-6"><CopyValue value={data.decision.decisionId} label="Decision ID" /></td>
                  <td className="px-5 py-4"><CopyValue value={data.decision.actor} label="Decision actor" /></td>
                  <td className="px-5 py-4"><CopyValue value={data.decision.actionType} label="Action type" /></td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${data.decision.allowed ? "border-success/25 bg-success-soft/[0.07] text-success" : "border-fail/25 bg-fail/[0.07] text-fail"}`}>
                      {data.decision.allowed ? "ALLOWED" : "DENIED"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-secondary sm:px-6">
                    <time dateTime={new Date(data.decision.timestamp * 1_000).toISOString()}>{formatUnixTime(data.decision.timestamp)} UTC</time>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 border-t border-edge bg-overlay-active px-5 py-3 sm:grid-cols-2 sm:px-6">
            <div className="min-w-0">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary">Certificate ID</p>
              <CopyValue value={data.decision.certificateId} label="Decision certificate ID" />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary">Transaction</p>
              <CopyValue value={data.decision.transactionHash} label="Decision transaction" href={`${XLAYER_TESTNET.explorerUrl}/tx/${data.decision.transactionHash}`} />
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1 border-t border-edge px-5 py-3 text-[10px] leading-4 text-secondary sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Rejected PolicyGate calls revert and therefore do not create successful DecisionLog entries.</p>
        <p className="shrink-0">Executed actions: <strong className="font-mono text-accent">{data.executedActionCount ?? "--"}</strong></p>
      </div>
    </section>
  );
}
