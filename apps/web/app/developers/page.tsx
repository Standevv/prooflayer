import type { Metadata } from "next";
import Link from "next/link";

import { CopyCodeButton } from "@/components/copy-code-button";
import { DeveloperPlayground } from "@/components/developer-playground";
import { DeveloperStatus } from "@/components/developer-status";
import { Sidebar } from "@/components/sidebar";
import {
  API_ENDPOINTS,
  CURL_EXAMPLE,
  KNOWN_USDY_CERTIFICATE_ID,
  POLICY_CURL_EXAMPLE,
  PYTHON_EXAMPLE,
  QUICK_START_REQUEST,
  QUICK_START_RESPONSE,
  RESPONSE_SCHEMAS,
  SOLIDITY_EXAMPLE,
  TYPESCRIPT_EXAMPLE,
  XLAYER,
} from "@/lib/developers";

export const metadata: Metadata = {
  title: "Developer Platform",
  description: "Integrate ProofLayer read-only verification, evidence, certificates, and X Layer policy enforcement.",
};

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-brand">{children}</p>;
}

function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="max-w-3xl">
      <Kicker>{eyebrow}</Kicker>
      <h2 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-primary sm:text-[29px]">{title}</h2>
      <p className="mt-3 text-[12px] leading-6 text-secondary">{copy}</p>
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[7px] border border-edge bg-accent-soft">
      <div className="flex items-center justify-between gap-3 border-b border-edge px-3 py-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">{label}</span>
        <CopyCodeButton value={code} />
      </div>
      <pre tabIndex={0} className="max-h-[430px] overflow-auto p-3 text-[10px] leading-5 text-primary"><code>{code}</code></pre>
    </div>
  );
}

function AuthenticityBadges({ labels }: { labels: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span key={label} className="rounded-[4px] border border-edge bg-overlay-hover px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-secondary">{label}</span>
      ))}
    </div>
  );
}

const quickRequest = JSON.stringify(QUICK_START_REQUEST, null, 2);
const quickResponse = JSON.stringify(QUICK_START_RESPONSE, null, 2);

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <header className="command-header relative overflow-hidden rounded-[9px] border border-edge px-5 py-8 sm:px-7 sm:py-10">
            <div className="relative z-10 max-w-4xl">
              <Kicker>Developer infrastructure · X Layer Testnet</Kicker>
              <h1 className="mt-4 max-w-3xl text-[36px] font-semibold leading-[0.98] tracking-[-0.055em] text-accent sm:text-[51px]">ProofLayer Developers</h1>
              <p className="mt-4 max-w-2xl text-[14px] leading-6 text-primary sm:text-[15px]">Verification, provenance and policy infrastructure for tokenized real-world assets.</p>
              <p className="mt-3 max-w-2xl text-[11px] leading-5 text-secondary">Query deterministic verification results, inspect evidence provenance, verify certificates and integrate ProofLayer policy decisions into external applications.</p>
              <p className="mt-2 max-w-2xl text-[10px] leading-5 text-secondary">Read-only, testnet-only, and pre-production. Real repository evidence, exported fixtures, and live contract reads remain explicitly distinguished.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <a href="#api-reference" className="surface-transition rounded-[7px] border border-brand/35 bg-brand/[0.11] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-ink hover:border-brand/60">Explore API →</a>
                <a href="#contracts" className="surface-transition rounded-[7px] border border-edge bg-overlay-hover px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary hover:border-edge">View on-chain contracts</a>
                <a href="#playground" className="surface-transition rounded-[7px] border border-edge bg-overlay-hover px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary hover:border-edge">Open playground</a>
              </div>
            </div>
          </header>

          <div className="mt-4"><DeveloperStatus /></div>

          <section id="quick-start" className="mt-4 scroll-mt-5 rounded-[9px] border border-edge bg-surface p-5 sm:p-6">
            <SectionTitle eyebrow="01 · Quick start" title="Check whether a protocol should rely on an asset claim" copy="POST the exact ProtocolCheckRequest shape to the Python API. The evaluator runs the existing deterministic verifier, inspects certificate state, and simulates the conservative PolicyGate decision without submitting a transaction." />
            <div className="mt-5 grid min-w-0 gap-3 xl:grid-cols-2">
              <CodeBlock label="POST /protocol/check · request" code={quickRequest} />
              <CodeBlock label="Selected response fields · current read-only result" code={quickResponse} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[7px] border border-edge bg-surface p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">Python API</p><p className="mt-2 font-mono text-[10px] text-primary">http://127.0.0.1:8010</p></div>
              <div className="rounded-[7px] border border-edge bg-surface p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">Browser gateway</p><p className="mt-2 font-mono text-[10px] text-primary">/api/protocol/check</p></div>
              <div className="rounded-[7px] border border-edge bg-surface p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">Writes</p><p className="mt-2 text-[10px] font-semibold text-success">NONE · SIMULATION ONLY</p></div>
            </div>
            <p className="mt-4 text-[10px] leading-5 text-secondary">The selected response is a truthful example observed from the repository’s USDY flow during development; current result fields can change with evidence freshness and live chain state. Execute the playground for the current response.</p>
            <p className="mt-1 text-[10px] leading-5 text-secondary">The protocol context is simulated. The underlying verification, fixture, and certificate reads are genuine according to each response’s authenticity labels. ProofLayer evaluates whether available evidence satisfies a specified verification policy; it does not guarantee that an asset is safe.</p>
          </section>

          <div className="mt-4"><DeveloperPlayground /></div>

          <section id="api-reference" className="mt-4 scroll-mt-5 rounded-[9px] border border-edge bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <SectionTitle eyebrow="02 · API reference" title="Existing read-only endpoints" copy="These routes are implemented by the local FastAPI service. Browser clients should use the corresponding same-origin /api gateways where available; server integrations can call the Python API directly." />
              <Link href="/openapi.json" target="_blank" className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-bright hover:text-accent">Open /openapi.json ↗</Link>
            </div>
            <div className="mt-5 overflow-hidden rounded-[7px] border border-edge">
              {API_ENDPOINTS.map((endpoint, index) => (
                <details key={`${endpoint.method}-${endpoint.path}`} className="group bg-surface open:bg-surface" open={index === 1}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 border-b border-edge px-3 py-3">
                    <span className={`w-10 shrink-0 font-mono text-[9px] font-semibold ${endpoint.method === "GET" ? "text-success" : "text-accent"}`}>{endpoint.method}</span>
                    <code className="min-w-0 flex-1 break-all text-[10px] text-primary">{endpoint.path}</code>
                    <span className="text-[10px] text-secondary group-open:rotate-45">+</span>
                  </summary>
                  <div className="grid gap-4 border-b border-edge px-3 py-4 text-[10px] leading-5 sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="font-semibold uppercase tracking-[0.08em] text-secondary">Purpose</p><p className="mt-1 text-secondary">{endpoint.purpose}</p></div>
                    <div><p className="font-semibold uppercase tracking-[0.08em] text-secondary">Request / response</p><p className="mt-1 text-secondary">{endpoint.request}<br />→ {endpoint.response}</p></div>
                    <div><p className="font-semibold uppercase tracking-[0.08em] text-secondary">Errors</p><p className="mt-1 text-secondary">{endpoint.errors}</p></div>
                    <div><p className="mb-2 font-semibold uppercase tracking-[0.08em] text-secondary">Data origin</p><AuthenticityBadges labels={endpoint.authenticity} /><p className="mt-2 text-secondary">Authentication: none (local MVP)<br />Network writes: none</p></div>
                    <div className="min-w-0 sm:col-span-2 lg:col-span-4"><div className="mb-2 flex items-center justify-between gap-2"><p className="font-semibold uppercase tracking-[0.08em] text-secondary">Representative response · selected fields</p><CopyCodeButton value={endpoint.responseExample} /></div><pre tabIndex={0} className="max-h-48 overflow-auto rounded-[6px] border border-edge bg-accent-soft p-3 text-[9px] leading-4 text-secondary"><code>{endpoint.responseExample}</code></pre></div>
                  </div>
                </details>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[7px] border border-edge bg-surface p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">Authentication</p><p className="mt-2 text-[10px] leading-5 text-secondary">No authentication layer is implemented in the local MVP. Do not expose this pre-production API directly to an untrusted network.</p></div>
              <div className="rounded-[7px] border border-edge bg-surface p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">Errors</p><p className="mt-2 text-[10px] leading-5 text-secondary">Gateway errors use <code>{`{ available: false, error: string }`}</code>. FastAPI validation errors use HTTP 422. Unavailable live reads remain explicit.</p></div>
              <div className="rounded-[7px] border border-edge bg-surface p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">Rate limits</p><p className="mt-2 text-[10px] leading-5 text-secondary">No application rate limiter is implemented. RPC/provider limits can still apply. Production integrations must add authentication, quotas, and monitoring.</p></div>
            </div>
          </section>

          <section className="mt-4 rounded-[9px] border border-edge bg-surface p-5 sm:p-6">
            <SectionTitle eyebrow="03 · Response contracts" title="Schemas that preserve provenance and uncertainty" copy="The public structures below are derived from the current Pydantic and TypeScript models. They distinguish unavailable state from a negative verification result and carry source labels where mixed data origins are possible." />
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {RESPONSE_SCHEMAS.map((schema) => (
                <div key={schema.name} className="rounded-[7px] border border-edge bg-surface p-4">
                  <p className="font-mono text-[11px] font-semibold text-brand-ink">{schema.name}</p>
                  <p className="mt-2 break-words text-[10px] leading-5 text-secondary">{schema.fields}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-[7px] border border-brand/15 bg-brand/[0.035] p-4 text-[10px] leading-5 text-secondary">
              <span className="font-semibold text-accent">Authenticity model.</span> LIVE ON-CHAIN means a successful current RPC read; FIXTURE means exported repository data; CACHED OFFICIAL EVIDENCE identifies repository snapshots from official sources; DERIVED and DETERMINISTIC RVC identify reproducible computation. UNAVAILABLE is never silently converted into PASS or ALLOW.
            </div>
          </section>

          <section className="mt-4 rounded-[9px] border border-edge bg-surface p-5 sm:p-6">
            <SectionTitle eyebrow="04 · Native HTTP examples" title="Use the client you already have" copy="No ProofLayer SDK is claimed in the current MVP. These examples use native browser, Python standard-library, and cURL HTTP clients against implemented read-only evaluation surfaces." />
            <div className="mt-5 grid min-w-0 gap-3 xl:grid-cols-2">
              <CodeBlock label="TypeScript · same-origin gateway" code={TYPESCRIPT_EXAMPLE} />
              <CodeBlock label="Python · local FastAPI" code={PYTHON_EXAMPLE} />
              <CodeBlock label="cURL · local FastAPI" code={CURL_EXAMPLE} />
              <CodeBlock label="cURL · institutional policy evaluation" code={POLICY_CURL_EXAMPLE} />
            </div>
          </section>

          <section id="contracts" className="mt-4 scroll-mt-5 rounded-[9px] border border-edge bg-surface p-5 sm:p-6">
            <SectionTitle eyebrow="05 · On-chain integration" title="Read certificate state before protected execution" copy="ProofLayer separates off-chain evidence evaluation from on-chain enforcement. The deployed X Layer testnet contracts expose certificate state and PolicyGate validation; the current developer surface does not submit transactions." />
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              {["External Protocol", "Certificate ID", "PolicyGate", "CertificateRegistry", "ALLOW / BLOCK", "DecisionLog"].map((step, index) => (
                <div key={step} className="relative rounded-[7px] border border-edge bg-surface px-3 py-4">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-accent">0{index + 1}</p>
                  <p className="mt-2 text-[10px] font-semibold text-primary">{step}</p>
                  {index < 5 ? <span aria-hidden="true" className="absolute -right-1.5 top-1/2 z-10 hidden text-[10px] text-tertiary lg:block">→</span> : null}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[9px] leading-4 text-secondary">DecisionLog records successful authorized policy decisions. A blocked, reverted action creates no successful decision record.</p>

            <div className="mt-5 overflow-hidden rounded-[7px] border border-edge">
              {[
                ["CertificateRegistry", "Stores verification certificates and exposes current usability.", XLAYER.contracts.registry],
                ["PolicyGate", "Validates asset, claim, policy, and certificate usability before an action.", XLAYER.contracts.policyGate],
                ["DecisionLog", "Records successful authorized decisions; rejected reverted actions do not persist.", XLAYER.contracts.decisionLog],
              ].map(([name, purpose, address]) => (
                <div key={name} className="grid gap-2 border-b border-edge bg-surface px-3 py-3 last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)] lg:grid-cols-[160px_minmax(0,1fr)_390px] lg:items-center">
                  <p className="text-[10px] font-semibold text-primary">{name}</p>
                  <p className="text-[9px] leading-4 text-secondary">{purpose}</p>
                  <div className="flex min-w-0 items-center gap-2"><code className="min-w-0 flex-1 truncate text-[9px] text-secondary">{address}</code><CopyCodeButton value={address} /></div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] text-secondary">
              <span>{XLAYER.name} · Chain {XLAYER.chainId} · Native gas token OKB</span>
              <a href={XLAYER.explorer} target="_blank" rel="noreferrer" className="font-semibold uppercase tracking-[0.08em] text-brand-bright hover:text-accent">Open explorer ↗</a>
            </div>

            <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <CodeBlock label="Solidity · exact deployed PolicyGate view interface" code={SOLIDITY_EXAMPLE} />
              <div className="space-y-3">
                <div className="rounded-[7px] border border-edge bg-surface p-4"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-brand">Interface source</p><p className="mt-2 text-[10px] leading-5 text-secondary">The signature is copied from <code>ProofLayerPolicyGate.validateAction</code>: four <code>bytes32</code> identifiers, <code>external view</code>, returning <code>bool</code>. No SDK or contract method is invented.</p></div>
                <div className="rounded-[7px] border border-warning/18 bg-warning/[0.035] p-4"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-warning">Revert behavior</p><p className="mt-2 text-[10px] leading-5 text-secondary">A blocked validation can revert with <code>CertificateNotUsable</code> or another exact mismatch error. Providers may omit decodable custom-error metadata; callers must still treat the failed call as rejection and must not infer success.</p></div>
                <div className="rounded-[7px] border border-fail/18 bg-fail/[0.025] p-4"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-fail">Deployment status</p><p className="mt-2 text-[10px] leading-5 text-secondary">Testnet only. The contracts are not presented here as audited production infrastructure. Integrators must independently review interfaces, bytecode, ownership, and operational controls.</p></div>
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-[9px] border border-edge bg-surface p-5 sm:p-6">
            <SectionTitle eyebrow="06 · Grounded examples" title="Trace data back to its source" copy="ProofLayer presents repository evidence, deterministic commitments, fixtures, and live state as distinct layers. A historical PASS fixture is not the same as a currently usable certificate." />
            <div className="mt-5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-secondary">How ProofLayer works</p>
              <div className="mt-2 grid gap-px overflow-hidden rounded-[7px] border border-edge bg-overlay-hover sm:grid-cols-3 xl:grid-cols-9">
                {["Evidence Sources", "Normalization", "Provenance Engine", "RVC Policy Engine", "Verification Result", "Certificate", "CertificateRegistry", "PolicyGate", "External Protocol"].map((step, index) => <div key={step} className="relative bg-surface px-2.5 py-3"><p className="text-[8px] text-accent">{String(index + 1).padStart(2, "0")}</p><p className="mt-1 text-[9px] font-semibold leading-4 text-primary">{step}</p></div>)}
              </div>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <div className="rounded-[7px] border border-edge bg-surface p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-brand">USDY evidence path</p>
                <p className="mt-3 text-[12px] font-semibold text-primary">Official snapshots → normalized records → independent roots → deterministic evidence commitment</p>
                <p className="mt-2 text-[10px] leading-5 text-secondary">GET <code>/evidence/usdy</code> returns the actual normalized records present in this repository, their dependency groups, RVC predicates, current freshness, commitment, and certificate linkage. ProofLayer counts independent provenance roots rather than simply counting observations. It does not claim the contextual Treasury photograph is evidence.</p>
                <div className="mt-3"><AuthenticityBadges labels={["CACHED OFFICIAL EVIDENCE", "DERIVED", "DETERMINISTIC RVC"]} /></div>
              </div>
              <div className="rounded-[7px] border border-edge bg-surface p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-brand">Known certificate fixture</p>
                <p className="mt-3 break-all font-mono text-[10px] leading-5 text-primary">{KNOWN_USDY_CERTIFICATE_ID}</p>
                <p className="mt-2 text-[10px] leading-5 text-secondary">This exported USDY certificate records a historical PASS, while its current X Layer state can be EXPIRED and unusable. The explorer reports both layers and never converts historical PASS into current eligibility.</p>
                <div className="mt-3 flex items-center gap-2"><CopyCodeButton value={KNOWN_USDY_CERTIFICATE_ID} /><AuthenticityBadges labels={["FIXTURE", "LIVE ON-CHAIN"]} /></div>
              </div>
            </div>
          </section>

          <section className="mt-4 rounded-[9px] border border-edge bg-surface p-5 sm:p-6">
            <SectionTitle eyebrow="07 · Current MVP scope" title="Integrate with explicit boundaries" copy="The developer platform documents what exists today and keeps planned capabilities separate from working interfaces." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Supported assets", "USDY / TreasuryBacking and PAXG / GoldBacking. Solar and grain remain contextual example classes without verification fixtures."],
                ["Environment", "X Layer Testnet, chain 1952. No mainnet deployment or production availability commitment."],
                ["Operations", "HTTP reads, deterministic simulations, and contract view calls only. No wallet connection or write endpoint."],
                ["Planned, not shipped", "SDKs — planned. Versioned public API, authentication, rate limiting, webhooks, and production SLAs are not implemented."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-[7px] border border-edge bg-surface p-4"><p className="text-[10px] font-semibold text-primary">{title}</p><p className="mt-2 text-[9px] leading-5 text-secondary">{body}</p></div>
              ))}
            </div>
          </section>

          <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-secondary sm:flex-row sm:justify-between">
            <p>ProofLayer Developer Platform · MVP / Pre-production</p>
            <p>No wallet · No transaction · No fabricated proof data</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
