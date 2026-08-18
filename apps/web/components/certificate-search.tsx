"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { isCertificateId } from "@/lib/certificates";

export function CertificateSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = value.trim().toLowerCase();
    if (!isCertificateId(normalized)) {
      setError("Enter a 0x-prefixed bytes32 ID containing exactly 64 hexadecimal characters.");
      return;
    }
    setError(null);
    router.push(`/certificates/${normalized}`);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="certificate-lookup" className="text-[9px] font-semibold uppercase tracking-[0.12em] text-secondary">
        Certificate ID
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="certificate-lookup"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error !== null) setError(null);
          }}
          placeholder="0x…"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : "certificate-lookup-error"}
          className="min-h-11 min-w-0 flex-1 rounded-[6px] border border-edge-strong bg-accent-soft px-3 font-mono text-[12px] text-accent placeholder:text-tertiary focus:border-brand/55"
        />
        <button
          type="submit"
          className="surface-transition min-h-11 shrink-0 rounded-[6px] border border-brand/35 bg-brand/[0.11] px-5 text-[10px] font-bold uppercase tracking-[0.1em] text-accent hover:border-brand/60 hover:bg-brand/[0.16]"
        >
          Inspect certificate →
        </button>
      </div>
      {error === null ? (
        <p className="mt-2 text-[10px] text-tertiary">Full bytes32 IDs only. Malformed values are rejected before any chain lookup.</p>
      ) : (
        <p id="certificate-lookup-error" role="alert" className="mt-2 text-[11px] text-fail">
          {error}
        </p>
      )}
    </form>
  );
}
