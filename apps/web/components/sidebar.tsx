"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Icon, type IconName } from "@/components/icons";
import { ThemeSwitcher } from "@/components/theme-switcher";

const navigationGroups: Array<{
  label: string;
  items: Array<{ label: string; href: string; icon: IconName }>;
}> = [
  {
    label: "Primary",
    items: [
      { label: "Overview", href: "/", icon: "overview" },
      { label: "Assets", href: "/assets", icon: "database" },
      { label: "Verify", href: "/verify", icon: "shield" },
      { label: "Verified Markets", href: "/markets", icon: "layers" },
      { label: "Intelligence", href: "/intelligence", icon: "activity" },
      { label: "Developers", href: "/developers", icon: "command" },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { label: "Evidence", href: "/evidence", icon: "network" },
      { label: "Certificates", href: "/certificates", icon: "certificate" },
      { label: "Monitoring", href: "/monitoring", icon: "monitor" },
      { label: "Policy Studio", href: "/policies", icon: "gate" },
      { label: "Decisions", href: "/decisions", icon: "shield" },
      { label: "Integrations", href: "/integrations", icon: "layers" },
      { label: "Operator Console", href: "/admin", icon: "command" },
    ],
  },
];

function Brand() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3.5" aria-label="ProofLayer overview">
      <Image
        src="/prooflayer-logo.png"
        alt=""
        width={498}
        height={696}
        sizes="(max-width: 1023px) 44px, 52px"
        className="brand-mark h-14 w-auto shrink-0 object-contain lg:h-16"
        priority
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[21px] font-bold leading-none tracking-[-0.04em] text-primary">ProofLayer</span>
        <span className="mt-2 block text-[7.5px] font-semibold uppercase leading-3 tracking-[0.12em] text-tertiary">
          RWA Verification Infrastructure
        </span>
      </span>
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation" className="mt-7 space-y-5">
      {navigationGroups.map((group) => (
        <div key={group.label} className="min-w-0">
          <p className="px-3 pb-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-tertiary">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                item.href === "/assets"
                  ? pathname.startsWith("/assets")
                  : item.href === "/evidence"
                    ? pathname.startsWith("/evidence")
                    : item.href === "/monitoring"
                      ? pathname.startsWith("/monitoring")
                      : item.href === "/policies"
                        ? pathname.startsWith("/policies")
                        : item.href === "/integrations"
                          ? pathname.startsWith("/integrations")
                          : item.href === "/verify"
                            ? pathname === "/verify"
                            : item.href === "/markets"
                              ? pathname.startsWith("/markets")
                              : item.href === "/certificates"
                                ? pathname.startsWith("/certificates")
                                : item.href === "/developers"
                                  ? pathname.startsWith("/developers")
                                  : item.href === "/intelligence"
                                    ? pathname.startsWith("/intelligence")
                                    : item.href === "/decisions"
                                      ? pathname.startsWith("/decisions")
                                      : item.href === "/admin"
                                        ? pathname.startsWith("/admin")
                                        : item.href === "/" && pathname === "/";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`surface-transition relative flex items-center gap-2.5 rounded-[6px] border px-3 py-2 text-[12px] font-medium ${
                    active
                      ? "border-brand/20 bg-brand/[0.08] text-accent before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-full before:bg-brand"
                      : "border-transparent text-tertiary hover:border-edge hover:bg-overlay-hover hover:text-accent"
                  }`}
                >
                  <Icon
                    name={item.icon}
                    className={`size-[15px] ${active ? "text-brand-bright" : "text-tertiary"}`}
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
    <div className="border-t border-edge pt-4 pb-1">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-primary">X Layer Testnet</p>
          <p className="mt-0.5 font-mono text-[10px] text-tertiary">Chain 1952</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-success">
          <span className="status-pulse size-1.5 rounded-full bg-success-soft" aria-hidden="true" />
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-edge bg-sidebar px-[16px] py-6 lg:flex">
        <Brand />
        <Navigation />
        <div className="mt-auto space-y-3">
          <ThemeSwitcher />
          <NetworkFooter />
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-brand/[0.12] bg-background/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="surface-transition rounded-[7px] border border-brand/25 bg-brand/[0.07] px-3 py-1.5 text-xs font-semibold text-brand-ink hover:border-brand/45"
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {open ? (
        <div
          id="mobile-navigation"
          className="fixed inset-0 z-30 bg-scrim pt-[69px] backdrop-blur-sm lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div className="flex h-full w-[250px] flex-col border-r border-edge bg-sidebar p-4">
            <Navigation onNavigate={() => setOpen(false)} />
            <div className="mt-auto space-y-3">
              <ThemeSwitcher />
              <NetworkFooter />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
