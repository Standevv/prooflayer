import { CopyValue } from "@/components/copy-value";
import { Icon, type IconName } from "@/components/icons";
import { PROOFLAYER_CONTRACTS, XLAYER_TESTNET } from "@/lib/contracts";
import type { OnchainDashboardData } from "@/lib/onchain";

function explorerAddress(address: string): string {
  return `${XLAYER_TESTNET.explorerUrl}/address/${address}`;
}

function StateValue({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-secondary">Unavailable</span>;
  return <span className={value ? "text-success" : "text-warning"}>{value ? "Yes" : "No"}</span>;
}

const stages: Array<{ name: string; description: string; icon: IconName }> = [
  { name: "Registry", description: "Certificate stored", icon: "certificate" },
  { name: "PolicyGate", description: "Policy evaluated", icon: "gate" },
  { name: "DecisionLog", description: "Action recorded", icon: "activity" },
];

function displayContractName(name: string): string {
  if (name === "policyGate") return "PolicyGate";
  if (name === "decisionLog") return "DecisionLog";
  return "Registry";
}

export function OnchainStatus({ data }: { data: OnchainDashboardData }) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-edge bg-surface" aria-labelledby="onchain-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge px-5 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary">Contract infrastructure</p>
          <h2 id="onchain-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-brand-bright">On-chain Enforcement</h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${data.connected ? "text-success" : "text-warning"}`}>
          <span className={`size-1.5 rounded-full ${data.connected ? "status-pulse bg-success-soft" : "bg-warning"}`} aria-hidden="true" />
          {data.connected ? "Live on X Layer" : "Network unavailable"}
        </span>
      </div>

      {data.error === null ? null : (
        <p className="border-b border-warning/20 bg-warning/[0.05] px-5 py-2.5 text-[11px] leading-4 text-warning sm:px-6">
          Live RPC reads unavailable: {data.error}
        </p>
      )}

      <dl className="grid grid-cols-2 border-b border-edge bg-overlay-active sm:grid-cols-5">
        <div className="border-b border-r border-edge px-4 py-3 sm:border-b-0 sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary">Network</dt>
          <dd className="mt-1 text-[11px] font-semibold text-accent">{XLAYER_TESTNET.name}</dd>
        </div>
        <div className="border-b border-edge px-4 py-3 sm:border-b-0 sm:border-r sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary">Chain ID</dt>
          <dd className="mt-1 font-mono text-[11px] font-semibold text-accent">{data.chainId ?? "--"}</dd>
        </div>
        <div className="border-r border-edge px-4 py-3 sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary">Latest block</dt>
          <dd className="mt-1 font-mono text-[11px] font-semibold text-accent">{data.latestBlock?.toLocaleString("en-GB") ?? "--"}</dd>
        </div>
        <div className="border-r border-edge px-4 py-3 sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary">Registered</dt>
          <dd className="mt-1 text-[11px] font-semibold"><StateValue value={data.registered} /></dd>
        </div>
        <div className="col-span-2 border-t border-edge px-4 py-3 sm:col-span-1 sm:border-t-0 sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary">Usable</dt>
          <dd className="mt-1 text-[11px] font-semibold"><StateValue value={data.usable} /></dd>
        </div>
      </dl>

      <div className="px-5 py-6 sm:px-6">
        <div className="grid gap-3 md:grid-cols-[1fr_28px_1fr_28px_1fr] md:items-center">
          {stages.map((stage, index) => (
            <div key={stage.name} className="contents">
              <div className="surface-transition rounded-[10px] border border-edge bg-elevated p-4 hover:-translate-y-0.5 hover:border-edge">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-9 place-items-center rounded-[8px] border border-success/20 bg-success-soft/[0.055] text-success">
                    <Icon name={stage.icon} className="size-4" />
                  </span>
                  <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.07em] text-success">
                    <span className="size-1 rounded-full bg-success-soft" aria-hidden="true" />
                    Live
                  </span>
                </div>
                <p className="mt-4 text-[13px] font-semibold text-accent">{stage.name}</p>
                <p className="mt-1 text-[10px] text-secondary">{stage.description}</p>
              </div>
              {index < stages.length - 1 ? (
                <div className="flex h-5 items-center justify-center text-success md:h-auto" aria-hidden="true">
                  <span className="rotate-90 md:rotate-0">&rarr;</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid border-t border-edge bg-overlay-active lg:grid-cols-3">
        {Object.entries(PROOFLAYER_CONTRACTS).map(([name, address]) => (
          <div key={name} className="min-w-0 border-b border-edge px-5 py-3 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary">{displayContractName(name)}</p>
            <CopyValue value={address} label={name} href={explorerAddress(address)} />
          </div>
        ))}
      </div>
    </section>
  );
}
