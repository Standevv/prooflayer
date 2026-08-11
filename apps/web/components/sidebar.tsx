"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Icon, type IconName } from "@/components/icons";

const navigation: Array<{ label: string; href: string; icon: IconName }> = [
  { label: "Overview", href: "/", icon: "overview" },
  { label: "Assets", href: "/assets", icon: "database" },
  { label: "Evidence", href: "/evidence", icon: "network" },
  { label: "Monitoring", href: "/monitoring", icon: "activity" },
  { label: "Policy Studio", href: "/policies", icon: "gate" },
  { label: "Integrations", href: "/integrations", icon: "network" },
  { label: "Developers", href: "/developers", icon: "activity" },
  { label: "Verify", href: "/#verify", icon: "shield" },
  { label: "Certificates", href: "/certificates", icon: "certificate" },
  { label: "Decisions", href: "/#decisions", icon: "activity" },
  { label: "Operator Console", href: "/admin", icon: "command" },
];

function Brand() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="ProofLayer overview">
      <Image
        src="/prooflayer-logo.png"
        alt=""
        width={498}
        height={696}
        sizes="(max-width: 1023px) 32px, 37px"
        className="brand-mark h-11 w-auto shrink-0 object-contain lg:h-[52px]"
        priority
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold tracking-[-0.03em] text-white">ProofLayer</span>
        <span className="mt-1 block text-[7px] font-semibold uppercase leading-3 tracking-[0.09em] text-[#9095a2]">
          RWA Verification Infrastructure
        </span>
      </span>
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation" className="mt-10 space-y-0.5">
      {navigation.map((item) => {
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
            : item.href === "/developers"
              ? pathname.startsWith("/developers")
            : item.href === "/certificates"
              ? pathname.startsWith("/certificates")
            : item.href === "/admin"
              ? pathname.startsWith("/admin")
            : item.href === "/" && pathname === "/";

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`surface-transition relative flex items-center gap-3 rounded-[7px] border px-3 py-2.5 text-[12px] font-semibold ${
              active
                ? "border-[#8f7df0]/20 bg-[#8f7df0]/[0.07] text-[#f7f7fa] before:absolute before:inset-y-2 before:left-0 before:w-px before:bg-[linear-gradient(#8f7df0,#36d17c)] before:shadow-[0_0_8px_rgba(143,125,240,0.5)]"
                : "border-transparent text-[#9297a3] hover:border-white/[0.07] hover:bg-white/[0.025] hover:text-[#e5e7ec]"
            }`}
          >
            <Icon
              name={item.icon}
              className={`size-4 ${active ? "text-[#a89bf6]" : "text-[#747987]"}`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NetworkFooter() {
  return (
    <div className="border-t border-white/[0.09] pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-[#e5e7ec]">X Layer Testnet</p>
          <p className="mt-1 font-mono text-[10px] text-[#818693]">Chain 1952</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-[#8f9a94]">
          <span className="status-pulse size-1.5 rounded-full bg-[#36d17c]" aria-hidden="true" />
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-[#8f7df0]/[0.12] bg-[#08090d] px-[18px] py-6 shadow-[inset_-1px_0_0_rgba(255,255,255,0.015)] lg:flex">
        <Brand />
        <Navigation />
        <div className="mt-auto">
          <NetworkFooter />
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#8f7df0]/[0.12] bg-[#0b0c10]/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="surface-transition rounded-[7px] border border-[#8f7df0]/25 bg-[#8f7df0]/[0.07] px-3 py-1.5 text-xs font-semibold text-[#ddd8ff] hover:border-[#8f7df0]/45"
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      {open ? (
        <div
          id="mobile-navigation"
          className="fixed inset-0 z-30 bg-black/55 pt-[69px] backdrop-blur-sm lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div className="flex h-full w-[250px] flex-col border-r border-white/[0.08] bg-[#08090d] p-4">
            <Navigation onNavigate={() => setOpen(false)} />
            <div className="mt-auto">
              <NetworkFooter />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
