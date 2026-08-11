import { CopyValue } from "@/components/copy-value";
import { Icon, type IconName } from "@/components/icons";
import { PROOFLAYER_CONTRACTS, XLAYER_TESTNET } from "@/lib/contracts";
import type { OnchainDashboardData } from "@/lib/onchain";

function explorerAddress(address: string): string {
  return `${XLAYER_TESTNET.explorerUrl}/address/${address}`;
}

function StateValue({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-[#858a97]">Unavailable</span>;
  return <span className={value ? "text-[#36d17c]" : "text-[#e9b949]"}>{value ? "Yes" : "No"}</span>;
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
    <section className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111319]" aria-labelledby="onchain-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Contract infrastructure</p>
          <h2 id="onchain-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#f5f4f8]">On-chain Enforcement</h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${data.connected ? "text-[#36d17c]" : "text-[#e9b949]"}`}>
          <span className={`size-1.5 rounded-full ${data.connected ? "status-pulse bg-[#36d17c]" : "bg-[#e9b949]"}`} aria-hidden="true" />
          {data.connected ? "Live on X Layer" : "Network unavailable"}
        </span>
      </div>

      {data.error === null ? null : (
        <p className="border-b border-[#e9b949]/20 bg-[#e9b949]/[0.05] px-5 py-2.5 text-[11px] leading-4 text-[#d7b35c] sm:px-6">
          Live RPC reads unavailable: {data.error}
        </p>
      )}

      <dl className="grid grid-cols-2 border-b border-white/[0.08] bg-black/[0.06] sm:grid-cols-5">
        <div className="border-b border-r border-white/[0.07] px-4 py-3 sm:border-b-0 sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#747987]">Network</dt>
          <dd className="mt-1 text-[11px] font-semibold text-[#d4d7df]">{XLAYER_TESTNET.name}</dd>
        </div>
        <div className="border-b border-white/[0.07] px-4 py-3 sm:border-b-0 sm:border-r sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#747987]">Chain ID</dt>
          <dd className="mt-1 font-mono text-[11px] font-semibold text-[#d4d7df]">{data.chainId ?? "--"}</dd>
        </div>
        <div className="border-r border-white/[0.07] px-4 py-3 sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#747987]">Latest block</dt>
          <dd className="mt-1 font-mono text-[11px] font-semibold text-[#d4d7df]">{data.latestBlock?.toLocaleString("en-GB") ?? "--"}</dd>
        </div>
        <div className="border-r border-white/[0.07] px-4 py-3 sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#747987]">Registered</dt>
          <dd className="mt-1 text-[11px] font-semibold"><StateValue value={data.registered} /></dd>
        </div>
        <div className="col-span-2 border-t border-white/[0.07] px-4 py-3 sm:col-span-1 sm:border-t-0 sm:px-5">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#747987]">Usable</dt>
          <dd className="mt-1 text-[11px] font-semibold"><StateValue value={data.usable} /></dd>
        </div>
      </dl>

      <div className="px-5 py-6 sm:px-6">
        <div className="grid gap-3 md:grid-cols-[1fr_28px_1fr_28px_1fr] md:items-center">
          {stages.map((stage, index) => (
            <div key={stage.name} className="contents">
              <div className="surface-transition rounded-[10px] border border-white/[0.08] bg-[#171a22] p-4 hover:-translate-y-0.5 hover:border-white/[0.14]">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-9 place-items-center rounded-[8px] border border-[#36d17c]/20 bg-[#36d17c]/[0.055] text-[#36d17c]">
                    <Icon name={stage.icon} className="size-4" />
                  </span>
                  <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.07em] text-[#36d17c]">
                    <span className="size-1 rounded-full bg-[#36d17c]" aria-hidden="true" />
                    Live
                  </span>
                </div>
                <p className="mt-4 text-[13px] font-semibold text-[#f0f0f4]">{stage.name}</p>
                <p className="mt-1 text-[10px] text-[#858a97]">{stage.description}</p>
              </div>
              {index < stages.length - 1 ? (
                <div className="flex h-5 items-center justify-center text-[#3d4a42] md:h-auto" aria-hidden="true">
                  <span className="rotate-90 md:rotate-0">&rarr;</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid border-t border-white/[0.08] bg-black/[0.08] lg:grid-cols-3">
        {Object.entries(PROOFLAYER_CONTRACTS).map(([name, address]) => (
          <div key={name} className="min-w-0 border-b border-white/[0.07] px-5 py-3 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#747987]">{displayContractName(name)}</p>
            <CopyValue value={address} label={name} href={explorerAddress(address)} />
          </div>
        ))}
      </div>
    </section>
  );
}
