"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Icon, type IconName } from "@/components/icons";
import { ProofLayerWordmark } from "@/components/prooflayer-wordmark";
import { ThemeSwitcher } from "@/components/theme-switcher";

const navigationGroups: Array<{
  label: string;
  items: Array<{ label: string; href: string; icon: IconName }>;
}> = [
  {
    label: "Primary",
    items: [
      { label: "Overview", href: "/", icon: "overview" },
      { label: "Verify", href: "/verify", icon: "shield" },
      { label: "Markets", href: "/markets", icon: "layers" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Assets", href: "/assets", icon: "database" },
      { label: "Evidence", href: "/evidence", icon: "network" },
      { label: "Certificates", href: "/certificates", icon: "certificate" },
      { label: "Monitoring", href: "/monitoring", icon: "monitor" },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Developers", href: "/developers", icon: "command" },
      { label: "Integrations", href: "/integrations", icon: "layers" },
      { label: "Policy Studio", href: "/policies", icon: "gate" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Decisions", href: "/decisions", icon: "shield" },
      { label: "Operator Console", href: "/admin", icon: "command" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function Brand() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="ProofLayer overview">
      <Image
        src="/prooflayer-logo.png"
        alt=""
        width={498}
        height={696}
        sizes="(max-width: 1023px) 36px, 42px"
        className="h-10 w-auto shrink-0 object-contain lg:h-11"
        priority
      />
      <span className="min-w-0 flex-1">
        <ProofLayerWordmark className="h-[17px] tracking-[-0.03em]" />
        <span className="mt-1 block text-[7px] font-semibold uppercase tracking-[0.14em] text-tertiary">
          RWA Verification Infrastructure
        </span>
      </span>
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation" className="mt-6 space-y-5">
      {navigationGroups.map((group) => (
        <div key={group.label} className="min-w-0">
          <p className="px-2.5 pb-1.5 text-[7px] font-semibold uppercase tracking-[0.18em] text-tertiary">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`surface-transition relative flex items-center gap-2.5 rounded-[6px] border px-3 py-2 text-[11px] font-medium ${
                    active
                      ? "border-brand/15 bg-brand/[0.06] text-brand-bright before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-full before:bg-brand"
                      : "border-transparent text-tertiary hover:border-edge hover:bg-overlay-hover hover:text-secondary"
                  }`}
                >
                  <Icon
                    name={item.icon}
                    className={`size-[14px] ${active ? "text-brand" : "text-tertiary"}`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function NetworkFooter() {
  return (
    <div className="border-t border-edge pt-3 pb-1">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold text-primary">X Layer Mainnet</p>
          <p className="mt-0.5 font-mono text-[9px] text-tertiary">Chain 196</p>
        </div>
        <span className="flex items-center gap-1.5 text-[9px] font-medium text-success">
          <span className="status-pulse size-1.5 rounded-full bg-success" aria-hidden="true" />
          Connected
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold text-primary">X Layer Testnet</p>
          <p className="mt-0.5 font-mono text-[9px] text-tertiary">Chain 1952</p>
        </div>
        <span className="flex items-center gap-1.5 text-[9px] font-medium text-success">
          <span className="status-pulse size-1.5 rounded-full bg-success" aria-hidden="true" />
          Connected
        </span>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r border-edge bg-sidebar px-3 py-5 lg:flex">
        <Brand />
        <Navigation />
        <div className="mt-auto space-y-2">
          <ThemeSwitcher />
          <NetworkFooter />
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-edge bg-background/95 px-4 py-2.5 backdrop-blur-xl lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="surface-transition rounded-[6px] border border-edge bg-surface px-3 py-1.5 text-[10px] font-semibold text-secondary hover:border-edge-strong hover:text-primary"
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {open ? (
        <div
          id="mobile-navigation"
          className="fixed inset-0 z-30 bg-scrim pt-[60px] backdrop-blur-sm lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div className="flex h-full w-[240px] flex-col border-r border-edge bg-sidebar p-4">
            <Navigation onNavigate={() => setOpen(false)} />
            <div className="mt-auto space-y-2">
              <ThemeSwitcher />
              <NetworkFooter />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
