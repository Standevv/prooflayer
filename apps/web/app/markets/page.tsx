"use client";

import { useCallback, useEffect, useState } from "react";
import { parseUnits, formatUnits } from "ethers";
import { Sidebar } from "@/components/sidebar";
import {
  useWallet,
  shorten,
  XLAYER_CHAIN_ID,
  XLAYER_EXPLORER,
  type TxState,
} from "@/lib/wallet";

/* ── Types ─────────────────────────────────────────────────────────── */

interface MarketAsset {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  category: string;
  chain_id: number;
  network: string;
  total_supply: string | null;
  wallet_supported: boolean;
  aave_available: boolean;
  observed_at: string;
}

interface EarnOpportunity {
  asset: string;
  symbol: string;
  asset_address: string;
  protocol: string;
  supply_apy: number | null;
  supply_apy_display: string | null;
  total_supplied_usd: number | null;
  available_liquidity: string | null;
  collateral_enabled: boolean;
  source: string;
  chain_id: number;
  observed_at: string;
}

interface BorrowOpportunity {
  asset: string;
  symbol: string;
  asset_address: string;
  protocol: string;
  borrow_apy: number | null;
  borrow_apy_display: string | null;
  available_liquidity: string | null;
  ltv: number | null;
  liquidation_threshold: number | null;
  borrowable: boolean;
  collateral_requirements: string | null;
  source: string;
  chain_id: number;
  observed_at: string;
}

interface SwapQuote {
  token_in: string;
  token_out: string;
  symbol_in: string;
  symbol_out: string;
  amount_in: string;
  amount_out: string | null;
  minimum_received: string | null;
  fee_tier: string | null;
  route: string | null;
  source: string;
  chain_id: number;
  available: boolean;
  error: string | null;
  observed_at: string;
}

type Tab = "explore" | "earn" | "borrow" | "swap" | "portfolio";

/* ── Helpers ───────────────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function TxToast({ tx, onClose }: { tx: TxState; onClose: () => void }) {
  if (tx.status === "idle") return null;
  const isTerminal = tx.status === "success" || tx.status === "failed";
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] border border-edge bg-elevated p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold text-primary">{tx.action}</div>
          {tx.hash && (
            <a
              href={`${XLAYER_EXPLORER}/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block font-mono text-[10px] text-brand underline-offset-2 hover:underline"
            >
              {shorten(tx.hash)}
            </a>
          )}
          {tx.status === "approving" && (
            <div className="mt-1 text-[10px] text-secondary">Awaiting token approval…</div>
          )}
          {tx.status === "awaiting_signature" && (
            <div className="mt-1 text-[10px] text-secondary">Confirm in wallet…</div>
          )}
          {tx.status === "submitted" && (
            <div className="mt-1 text-[10px] text-secondary">Transaction submitted…</div>
          )}
          {tx.status === "confirming" && (
            <div className="mt-1 text-[10px] text-secondary">Confirming on-chain…</div>
          )}
          {tx.status === "success" && (
            <div className="mt-1 text-[10px] text-success">Transaction confirmed</div>
          )}
          {tx.status === "failed" && tx.error && (
            <div className="mt-1 text-[10px] text-fail">{tx.error}</div>
          )}
        </div>
        {isTerminal && (
          <button onClick={onClose} className="text-[10px] text-tertiary hover:text-primary">
            ✕
          </button>
        )}
      </div>
      {!isTerminal && (
        <div className="mt-2 h-[2px] w-full overflow-hidden bg-overlay-hover">
          <div className="h-full w-1/3 animate-pulse bg-brand" />
        </div>
      )}
    </div>
  );
}

/* ── Wallet Header ─────────────────────────────────────────────────── */

function WalletHeader() {
  const {
    connected,
    address,
    chainId,
    nativeBalance,
    connect,
    disconnect,
    switchToXLayer,
  } = useWallet();

  if (!connected) {
    return (
      <button
        onClick={connect}
        className="rounded-[4px] border border-brand/30 bg-brand/[0.08] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-brand hover:bg-brand/[0.14]"
      >
        Connect Wallet
      </button>
    );
  }

  const wrongChain = chainId !== XLAYER_CHAIN_ID;

  return (
    <div className="flex items-center gap-3">
      {wrongChain ? (
        <button
          onClick={switchToXLayer}
          className="rounded-[4px] border border-warning/30 bg-warning-soft/[0.08] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-warning"
        >
          Switch to X Layer
        </button>
      ) : (
        <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase text-success">
          X Layer ✓
        </span>
      )}
      <div className="text-right">
        <div className="text-[10px] font-semibold text-primary">{shorten(address!)}</div>
        <div className="text-[8px] text-tertiary">{Number(nativeBalance).toFixed(2)} OKB</div>
      </div>
      <button
        onClick={disconnect}
        className="rounded-[4px] border border-edge px-2 py-1 text-[8px] text-tertiary hover:border-fail/30 hover:text-fail"
      >
        Disconnect
      </button>
    </div>
  );
}

/* ── Explore Tab ───────────────────────────────────────────────────── */

function ExploreTab({
  assets,
  earnOpportunities,
  borrowOpportunities,
}: {
  assets: MarketAsset[];
  earnOpportunities: EarnOpportunity[];
  borrowOpportunities: BorrowOpportunity[];
}) {
  const earnMap = new Map(earnOpportunities.map((e) => [e.asset_address.toLowerCase(), e]));
  const borrowMap = new Map(borrowOpportunities.map((b) => [b.asset_address.toLowerCase(), b]));

  return (
    <div className="overflow-hidden border border-edge bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-edge bg-elevated">
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Asset</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Type</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Supply APY</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Borrow APR</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">LTV</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Liquidity</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Protocol</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Updated</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const earn = earnMap.get(a.address.toLowerCase());
              const borrow = borrowMap.get(a.address.toLowerCase());
              return (
                <tr
                  key={a.address}
                  className="border-b border-edge last:border-b-0 hover:bg-overlay-hover transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-primary">{a.symbol}</div>
                    <div className="text-[9px] text-tertiary">{a.name}</div>
                  </td>
                  <td className="px-4 py-3 capitalize text-secondary">{a.category.replace("_", " ")}</td>
                  <td className="px-4 py-3 font-mono text-success">
                    {earn?.supply_apy_display ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-primary">
                    {borrow?.borrow_apy_display ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-secondary">
                    {borrow?.ltv != null ? `${(borrow.ltv * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-secondary">
                    {earn?.available_liquidity ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {a.aave_available ? (
                      <span className="inline-block rounded-[3px] border border-brand/15 bg-brand/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase text-brand">
                        Aave V3
                      </span>
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[9px] text-tertiary">
                    {timeAgo(a.observed_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Earn Tab ──────────────────────────────────────────────────────── */

function EarnTab({
  opportunities,
  assets,
}: {
  opportunities: EarnOpportunity[];
  assets: MarketAsset[];
}) {
  const {
    connected,
    aaveSupply,
    aaveWithdraw,
    tokenBalances,
    aaveReserveBalances,
    tx,
    resetTx,
  } = useWallet();
  const [actionModal, setActionModal] = useState<{
    type: "supply" | "withdraw";
    opp: EarnOpportunity;
  } | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getWalletBalance = (addr: string): string => {
    const tb = tokenBalances.find((t) => t.address.toLowerCase() === addr.toLowerCase());
    return tb?.balanceFormatted ?? "0";
  };

  const getSuppliedBalance = (addr: string): string => {
    const rb = aaveReserveBalances.get(addr.toLowerCase());
    return rb?.suppliedBalanceFormatted ?? "0";
  };

  const handleAction = async () => {
    if (!actionModal || !amount || Number(amount) <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const asset = actionModal.opp;
      if (actionModal.type === "supply") {
        await aaveSupply(asset.asset_address, amount, assets.find((a) => a.address === asset.asset_address)?.decimals ?? 18);
      } else {
        await aaveWithdraw(asset.asset_address, amount, assets.find((a) => a.address === asset.asset_address)?.decimals ?? 18);
      }
      setActionModal(null);
      setAmount("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("user rejected") || msg.includes("action乃是")) {
        setError("Transaction rejected by wallet");
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-secondary">
        Real Aave V3 supply opportunities on X Layer Mainnet. Connect wallet to supply.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {opportunities.map((o) => (
          <div key={o.asset_address} className="border border-edge bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-primary">{o.symbol}</span>
              <span className="rounded-[3px] border border-brand/15 bg-brand/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase text-brand">
                {o.protocol}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="text-tertiary">Supply APY</div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold text-success">
                  {o.supply_apy_display ?? "0.00%"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Liquidity</div>
                <div className="mt-0.5 font-mono text-[12px] text-primary">
                  {o.available_liquidity ?? "—"}
                </div>
              </div>
              {connected && (
                <>
                  <div>
                    <div className="text-tertiary">Wallet Balance</div>
                    <div className="mt-0.5 font-mono text-[12px] text-primary">
                      {getWalletBalance(o.asset_address)}
                    </div>
                  </div>
                  <div>
                    <div className="text-tertiary">Supplied</div>
                    <div className="mt-0.5 font-mono text-[12px] text-primary">
                      {getSuppliedBalance(o.asset_address)}
                    </div>
                  </div>
                </>
              )}
              <div>
                <div className="text-tertiary">Collateral</div>
                <div className="mt-0.5 text-[12px] text-primary">
                  {o.collateral_enabled ? "✓ Enabled" : "✗ No"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Source</div>
                <div className="mt-0.5 text-[9px] text-secondary">{o.source}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { setActionModal({ type: "supply", opp: o }); setAmount(""); setError(null); }}
                disabled={!connected}
                className="flex-1 rounded-[4px] border border-brand/30 bg-brand/[0.08] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-brand hover:bg-brand/[0.14] disabled:opacity-40"
              >
                Supply
              </button>
              {connected && Number(getSuppliedBalance(o.asset_address)) > 0 && (
                <button
                  onClick={() => { setActionModal({ type: "withdraw", opp: o }); setAmount(getSuppliedBalance(o.asset_address)); setError(null); }}
                  className="flex-1 rounded-[4px] border border-edge px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-secondary hover:bg-overlay-hover"
                >
                  Withdraw
                </button>
              )}
            </div>
            <div className="mt-2 text-[8px] text-tertiary">
              Updated {timeAgo(o.observed_at)}
            </div>
          </div>
        ))}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim">
          <div className="w-[400px] border border-edge bg-elevated p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-primary">
                {actionModal.type === "supply" ? "Supply" : "Withdraw"} {actionModal.opp.symbol}
              </h3>
              <button onClick={() => { setActionModal(null); setError(null); }} className="text-[10px] text-tertiary hover:text-primary">✕</button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="text-[10px] text-secondary">
                {actionModal.type === "supply"
                  ? `Supply ${actionModal.opp.symbol} to Aave V3 at ${actionModal.opp.supply_apy_display ?? "—"} APY`
                  : `Withdraw ${actionModal.opp.symbol} from Aave V3`}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 rounded-[4px] border border-edge bg-surface px-3 py-2 text-[12px] font-mono text-primary"
                />
                <button
                  onClick={() => {
                    if (actionModal.type === "supply") {
                      setAmount(getWalletBalance(actionModal.opp.asset_address));
                    } else {
                      setAmount(getSuppliedBalance(actionModal.opp.asset_address));
                    }
                  }}
                  className="rounded-[4px] border border-brand/30 bg-brand/[0.08] px-3 py-2 text-[9px] font-semibold text-brand hover:bg-brand/[0.14]"
                >
                  MAX
                </button>
              </div>
              <div className="text-[9px] text-tertiary">
                Network: X Layer Mainnet · Protocol: Aave V3
              </div>
              {error && (
                <div className="rounded-[4px] border border-fail/20 bg-fail-soft/[0.06] px-3 py-2 text-[10px] text-fail">
                  {error}
                </div>
              )}
              <button
                onClick={handleAction}
                disabled={loading || !amount || Number(amount) <= 0}
                className="w-full rounded-[4px] border border-brand/30 bg-brand/[0.08] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-brand hover:bg-brand/[0.14] disabled:opacity-40"
              >
                {loading ? "Processing…" : actionModal.type === "supply" ? "Supply" : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Borrow Tab ────────────────────────────────────────────────────── */

function BorrowTab({
  opportunities,
  assets,
}: {
  opportunities: BorrowOpportunity[];
  assets: MarketAsset[];
}) {
  const {
    connected,
    aaveBorrow,
    aaveRepay,
    aaveAccountData,
    aaveReserveBalances,
    tokenBalances,
    projectBorrowHF,
    tx,
    resetTx,
  } = useWallet();
  const [actionModal, setActionModal] = useState<{
    type: "borrow" | "repay";
    opp: BorrowOpportunity;
  } | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projection, setProjection] = useState<{
    currentHF: number;
    projectedHF: number;
    projectedHFLabel: string;
    safe: boolean;
  } | null>(null);

  // Live health factor projection as user types borrow amount
  useEffect(() => {
    if (!actionModal || actionModal.type !== "borrow" || !amount || Number(amount) <= 0) {
      setProjection(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const decimals = assets.find((a) => a.address === actionModal.opp.asset_address)?.decimals ?? 18;
      const result = await projectBorrowHF(actionModal.opp.asset_address, amount, decimals);
      if (!cancelled && result) {
        setProjection({
          currentHF: result.currentHF,
          projectedHF: result.projectedHF,
          projectedHFLabel: result.projectedHFLabel,
          safe: result.safe,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [actionModal, amount, assets, projectBorrowHF]);

  const getWalletBalance = (addr: string): string => {
    const tb = tokenBalances.find((t) => t.address.toLowerCase() === addr.toLowerCase());
    return tb?.balanceFormatted ?? "0";
  };

  const getDebtBalance = (addr: string): string => {
    const rb = aaveReserveBalances.get(addr.toLowerCase());
    return rb?.debtBalanceFormatted ?? "0";
  };

  const handleAction = async () => {
    if (!actionModal || !amount || Number(amount) <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const asset = actionModal.opp;
      const decimals = assets.find((a) => a.address === asset.asset_address)?.decimals ?? 18;
      if (actionModal.type === "borrow") {
        await aaveBorrow(asset.asset_address, amount, decimals);
      } else {
        await aaveRepay(asset.asset_address, amount, decimals);
      }
      setActionModal(null);
      setAmount("");
      setProjection(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("user rejected") || msg.includes("action乃是")) {
        setError("Transaction rejected by wallet");
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-secondary">
        Real Aave V3 borrow parameters on X Layer Mainnet. Connect wallet with collateral to borrow.
      </p>

      {/* Account Summary */}
      {connected && aaveAccountData && (
        <div className="border border-edge bg-surface p-4">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-tertiary mb-3">
            Your Aave Position
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
            <div>
              <div className="text-tertiary">Health Factor</div>
              <div className={`mt-0.5 font-mono text-[13px] font-semibold ${
                !aaveAccountData.hasDebt ? "text-success"
                : aaveAccountData.healthFactor >= 1.5
                  ? "text-success"
                  : aaveAccountData.healthFactor >= 1.1
                    ? "text-warning"
                    : "text-fail"
              }`}>
                {aaveAccountData.healthFactorLabel}
              </div>
            </div>
            <div>
              <div className="text-tertiary">Total Collateral</div>
              <div className="mt-0.5 font-mono text-[13px] text-primary">
                ${(Number(aaveAccountData.totalCollateralBase) / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-tertiary">Total Debt</div>
              <div className="mt-0.5 font-mono text-[13px] text-primary">
                ${(Number(aaveAccountData.totalDebtBase) / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-tertiary">Available Borrows</div>
              <div className="mt-0.5 font-mono text-[13px] text-brand">
                ${(Number(aaveAccountData.availableBorrowsBase) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {opportunities.map((o) => (
          <div key={o.asset_address} className="border border-edge bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-primary">{o.symbol}</span>
              {o.borrowable ? (
                <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase text-success">
                  Borrowable
                </span>
              ) : (
                <span className="rounded-[3px] border border-edge bg-elevated px-1.5 py-0.5 text-[8px] font-bold uppercase text-tertiary">
                  Supply Only
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="text-tertiary">Borrow APR</div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold text-primary">
                  {o.borrow_apy_display ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Liquidity</div>
                <div className="mt-0.5 font-mono text-[12px] text-primary">
                  {o.available_liquidity ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">LTV</div>
                <div className="mt-0.5 font-mono text-[12px] text-primary">
                  {o.ltv != null ? `${(o.ltv * 100).toFixed(0)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Liquidation Threshold</div>
                <div className="mt-0.5 font-mono text-[12px] text-primary">
                  {o.liquidation_threshold != null ? `${(o.liquidation_threshold * 100).toFixed(0)}%` : "—"}
                </div>
              </div>
              {connected && (
                <div>
                  <div className="text-tertiary">Wallet Balance</div>
                  <div className="mt-0.5 font-mono text-[12px] text-primary">
                    {getWalletBalance(o.asset_address)}
                  </div>
                </div>
              )}
            </div>
            {o.collateral_requirements && (
              <div className="mt-2 rounded-[3px] bg-elevated px-2 py-1 text-[9px] text-secondary">
                {o.collateral_requirements}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              {o.borrowable && (
                <button
                  onClick={() => { setActionModal({ type: "borrow", opp: o }); setAmount(""); setError(null); }}
                  disabled={!connected}
                  className="flex-1 rounded-[4px] border border-brand/30 bg-brand/[0.08] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-brand hover:bg-brand/[0.14] disabled:opacity-40"
                >
                  Borrow
                </button>
              )}
              {connected && o.borrowable && (
                <button
                  onClick={() => { setActionModal({ type: "repay", opp: o }); setAmount(""); setError(null); }}
                  className="flex-1 rounded-[4px] border border-edge px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-secondary hover:bg-overlay-hover"
                >
                  Repay
                </button>
              )}
            </div>
            <div className="mt-2 text-[8px] text-tertiary">
              Updated {timeAgo(o.observed_at)}
            </div>
          </div>
        ))}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim">
          <div className="w-[400px] border border-edge bg-elevated p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-primary">
                {actionModal.type === "borrow" ? "Borrow" : "Repay"} {actionModal.opp.symbol}
              </h3>
              <button onClick={() => { setActionModal(null); setError(null); }} className="text-[10px] text-tertiary hover:text-primary">✕</button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="text-[10px] text-secondary">
                {actionModal.type === "borrow"
                  ? `Borrow ${actionModal.opp.symbol} at variable rate ${actionModal.opp.borrow_apy_display ?? "—"}`
                  : `Repay ${actionModal.opp.symbol} debt`}
              </div>

              {actionModal.type === "borrow" && projection && !projection.safe && (
                <div className="rounded-[4px] border border-fail/20 bg-fail-soft/[0.06] px-3 py-2 text-[10px] text-fail">
                  Projected health factor {projection.projectedHFLabel} is below safety threshold. Reduce borrow amount or add more collateral.
                </div>
              )}
              {actionModal.type === "borrow" && projection && projection.safe && projection.projectedHF < 1.5 && (
                <div className="rounded-[4px] border border-warning/20 bg-warning-soft/[0.06] px-3 py-2 text-[10px] text-warning">
                  Projected health factor {projection.projectedHFLabel} — moderate risk.
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 rounded-[4px] border border-edge bg-surface px-3 py-2 text-[12px] font-mono text-primary"
                />
                <button
                  onClick={() => setAmount("0")}
                  className="rounded-[4px] border border-brand/30 bg-brand/[0.08] px-3 py-2 text-[9px] font-semibold text-brand hover:bg-brand/[0.14]"
                >
                  MAX
                </button>
              </div>

              <div className="text-[9px] text-tertiary">
                Network: X Layer Mainnet · Protocol: Aave V3 · Variable Rate
              </div>
              {error && (
                <div className="rounded-[4px] border border-fail/20 bg-fail-soft/[0.06] px-3 py-2 text-[10px] text-fail">
                  {error}
                </div>
              )}
              <button
                onClick={handleAction}
                disabled={loading || !amount || Number(amount) <= 0 || (actionModal.type === "borrow" && projection !== null && !projection.safe)}
                className="w-full rounded-[4px] border border-brand/30 bg-brand/[0.08] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-brand hover:bg-brand/[0.14] disabled:opacity-40"
              >
                {loading ? "Processing…" : actionModal.type === "borrow" ? "Borrow" : "Repay"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Swap Tab ──────────────────────────────────────────────────────── */

function SwapTab({ assets }: { assets: MarketAsset[] }) {
  const {
    connected,
    tokenBalances,
    swapExactInputSingle,
    tx,
    resetTx,
  } = useWallet();
  const [tokenIn, setTokenIn] = useState("");
  const [tokenOut, setTokenOut] = useState("");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getWalletBalance = (addr: string): string => {
    const tb = tokenBalances.find((t) => t.address.toLowerCase() === addr.toLowerCase());
    return tb?.balanceFormatted ?? "0";
  };

  const getQuote = useCallback(async () => {
    if (!tokenIn || !tokenOut || !amount) return;
    setQuoteLoading(true);
    try {
      const res = await fetch("/api/markets/quote/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_in: tokenIn, token_out: tokenOut, amount: parseUnits(amount, assets.find((a) => a.address === tokenIn)?.decimals ?? 18).toString() }),
      });
      const data = await res.json();
      setQuote(data);
    } catch {
      setQuote(null);
    }
    setQuoteLoading(false);
  }, [tokenIn, tokenOut, amount, assets]);

  const handleSwap = async () => {
    if (!quote || !tokenIn || !tokenOut || !amount) return;
    setTxLoading(true);
    setError(null);
    try {
      const decimals = assets.find((a) => a.address === tokenIn)?.decimals ?? 18;
      const fee = quote.fee_tier ? parseInt(quote.fee_tier) : 3000;
      const slippageBps = Math.round(parseFloat(slippage) * 100);
      await swapExactInputSingle(tokenIn, tokenOut, amount, decimals, fee, slippageBps);
      setQuote(null);
      setAmount("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Swap failed";
      if (msg.includes("user rejected") || msg.includes("action乃是")) {
        setError("Transaction rejected by wallet");
      } else {
        setError(msg);
      }
    }
    setTxLoading(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-secondary">
        {connected
          ? "Real Uniswap V3 quotes and execution on X Layer Mainnet."
          : "Read-only Uniswap V3 quotes. Connect wallet to execute swaps."}
      </p>
      <div className="border border-edge bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-[8px] font-semibold uppercase tracking-wider text-tertiary">
              Token In
            </label>
            <select
              value={tokenIn}
              onChange={(e) => { setTokenIn(e.target.value); setQuote(null); setError(null); }}
              className="w-full rounded-[4px] border border-edge bg-elevated px-2 py-1.5 text-[11px] text-primary"
            >
              <option value="">Select…</option>
              {assets.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.symbol} {connected ? `(${getWalletBalance(a.address)})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[8px] font-semibold uppercase tracking-wider text-tertiary">
              Token Out
            </label>
            <select
              value={tokenOut}
              onChange={(e) => { setTokenOut(e.target.value); setQuote(null); setError(null); }}
              className="w-full rounded-[4px] border border-edge bg-elevated px-2 py-1.5 text-[11px] text-primary"
            >
              <option value="">Select…</option>
              {assets.filter((a) => a.address !== tokenIn).map((a) => (
                <option key={a.address} value={a.address}>
                  {a.symbol}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[8px] font-semibold uppercase tracking-wider text-tertiary">
              Amount
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setQuote(null); setError(null); }}
              className="w-full rounded-[4px] border border-edge bg-elevated px-2 py-1.5 text-[11px] font-mono text-primary"
              placeholder="0.00"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={getQuote}
              disabled={quoteLoading || !tokenIn || !tokenOut || !amount}
              className="flex-1 rounded-[4px] border border-brand/30 bg-brand/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand hover:bg-brand/[0.14] disabled:opacity-40"
            >
              {quoteLoading ? "Quoting…" : "Get Quote"}
            </button>
            {connected && quote?.available && (
              <button
                onClick={handleSwap}
                disabled={txLoading}
                className="flex-1 rounded-[4px] border border-brand/30 bg-brand/[0.12] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-bright hover:bg-brand/[0.2] disabled:opacity-40"
              >
                {txLoading ? "Swapping…" : "Swap"}
              </button>
            )}
          </div>
        </div>

        {/* Slippage */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[9px] text-tertiary">Slippage:</span>
          {["0.1", "0.5", "1.0"].map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={`rounded-[3px] px-2 py-0.5 text-[8px] font-semibold ${
                slippage === s
                  ? "border border-brand/30 bg-brand/[0.08] text-brand"
                  : "border border-edge text-tertiary hover:text-secondary"
              }`}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      {/* Quote Result */}
      {quote && (
        <div className="border border-edge bg-surface p-4">
          {quote.available ? (
            <div className="grid gap-3 sm:grid-cols-4 text-[10px]">
              <div>
                <div className="text-tertiary">Amount Out</div>
                <div className="mt-0.5 font-mono text-[13px] font-semibold text-primary">
                  {quote.amount_out
                    ? `${(Number(quote.amount_out) / Math.pow(10, assets.find((a) => a.address === quote.token_out)?.decimals ?? 18)).toFixed(6)}`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Min Received</div>
                <div className="mt-0.5 font-mono text-[13px] text-primary">
                  {quote.minimum_received
                    ? `${(Number(quote.minimum_received) / Math.pow(10, assets.find((a) => a.address === quote.token_out)?.decimals ?? 18)).toFixed(6)}`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Fee Tier</div>
                <div className="mt-0.5 font-mono text-[13px] text-primary">
                  {quote.fee_tier ? `${(Number(quote.fee_tier) / 10000).toFixed(2)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Route</div>
                <div className="mt-0.5 text-[11px] text-primary">
                  {quote.route ?? "—"}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-warning">
              {quote.error || "Quote unavailable"}
            </div>
          )}
          <div className="mt-3 text-[8px] text-tertiary">
            {quote.source} · {timeAgo(quote.observed_at)}
          </div>
        </div>
      )}

      {error && (
        <div className="border border-fail/20 bg-fail-soft/[0.06] p-3 text-[10px] text-fail">
          {error}
        </div>
      )}
    </div>
  );
}

/* ── Portfolio Tab ─────────────────────────────────────────────────── */

function PortfolioTab({ assets }: { assets: MarketAsset[] }) {
  const {
    connected,
    address,
    tokenBalances,
    nativeBalance,
    aaveAccountData,
    aaveReserveBalances,
  } = useWallet();

  if (!connected) {
    return (
      <div className="border border-edge bg-surface p-8 text-center">
        <div className="text-[13px] text-secondary">Connect wallet to view portfolio</div>
        <div className="mt-2 text-[10px] text-tertiary">
          View wallet balances, Aave positions, and health factor
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Health Factor Card */}
      {aaveAccountData && (
        <div className="border border-edge bg-surface p-5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-tertiary mb-3">
            Aave Health Factor
          </div>
          <div className="flex items-baseline gap-4">
            <div className={`font-mono text-[28px] font-semibold ${
              !aaveAccountData.hasDebt ? "text-success"
              : aaveAccountData.healthFactor >= 1.5
                ? "text-success"
                : aaveAccountData.healthFactor >= 1.1
                  ? "text-warning"
                  : "text-fail"
            }`}>
              {aaveAccountData.healthFactorLabel}
            </div>
            <div className="text-[10px] text-tertiary">
              {!aaveAccountData.hasDebt
                ? "No open debt"
                : aaveAccountData.healthFactor > 1.5
                  ? "Healthy"
                  : aaveAccountData.healthFactor > 1.1
                    ? "At Risk"
                    : "Liquidation Imminent"}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-[10px]">
            <div>
              <div className="text-tertiary">Total Collateral</div>
              <div className="mt-0.5 font-mono text-[12px] text-primary">
                ${(Number(aaveAccountData.totalCollateralBase) / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-tertiary">Total Debt</div>
              <div className="mt-0.5 font-mono text-[12px] text-primary">
                ${(Number(aaveAccountData.totalDebtBase) / 100).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-tertiary">Available Borrows</div>
              <div className="mt-0.5 font-mono text-[12px] text-brand">
                ${(Number(aaveAccountData.availableBorrowsBase) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Balances */}
      <div className="border border-edge bg-surface p-5">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-tertiary mb-3">
          Wallet Balances
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-[4px] bg-elevated px-3 py-2 text-[11px]">
            <div>
              <span className="font-semibold text-primary">OKB</span>
              <span className="ml-2 text-tertiary">Native</span>
            </div>
            <span className="font-mono text-primary">{Number(nativeBalance).toFixed(4)}</span>
          </div>
          {tokenBalances.map((tb) => (
            <div
              key={tb.address}
              className="flex items-center justify-between rounded-[4px] bg-elevated px-3 py-2 text-[11px]"
            >
              <div>
                <span className="font-semibold text-primary">{tb.symbol}</span>
                <span className="ml-2 text-tertiary">
                  {assets.find((a) => a.address === tb.address)?.name ?? ""}
                </span>
              </div>
              <span className="font-mono text-primary">{Number(tb.balanceFormatted).toFixed(6)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Aave Positions */}
      <div className="border border-edge bg-surface p-5">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-tertiary mb-3">
          Aave Positions
        </div>
        {aaveReserveBalances.size === 0 ? (
          <div className="text-[11px] text-tertiary">No positions found</div>
        ) : (
          <div className="space-y-2">
            {Array.from(aaveReserveBalances.entries()).map(([addr, rb]) => {
              const asset = assets.find((a) => a.address.toLowerCase() === addr);
              if (!asset) return null;
              return (
                <div
                  key={addr}
                  className="flex items-center justify-between rounded-[4px] bg-elevated px-3 py-2 text-[11px]"
                >
                  <div>
                    <span className="font-semibold text-primary">{asset.symbol}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-primary">Supplied: {Number(rb.suppliedBalanceFormatted).toFixed(6)}</div>
                    <div className="font-mono text-fail">Debt: {Number(rb.debtBalanceFormatted).toFixed(6)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────── */

export default function MarketsPage() {
  const { tx, resetTx } = useWallet();
  const [tab, setTab] = useState<Tab>("explore");
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [earnOpps, setEarnOpps] = useState<EarnOpportunity[]>([]);
  const [borrowOpps, setBorrowOpps] = useState<BorrowOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/markets/assets").then((r) => r.json()),
      fetch("/api/markets/opportunities/earn").then((r) => r.json()),
      fetch("/api/markets/opportunities/borrow").then((r) => r.json()),
    ])
      .then(([a, e, b]) => {
        setAssets(Array.isArray(a) ? a : []);
        setEarnOpps(Array.isArray(e) ? e : []);
        setBorrowOpps(Array.isArray(b) ? b : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "explore", label: "Explore" },
    { key: "earn", label: "Earn" },
    { key: "borrow", label: "Borrow" },
    { key: "swap", label: "Swap" },
    { key: "portfolio", label: "Portfolio" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
          {/* Header */}
          <section className="relative px-6 py-7 sm:px-8 border border-edge bg-surface">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                    X Layer Markets
                  </p>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    Chain 196
                  </span>
                </div>
                <h1 className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.04em] text-primary sm:text-[34px]">
                  X Layer Markets
                </h1>
                <p className="mt-2 max-w-xl text-[12px] leading-5 text-secondary">
                  Discover, compare and access onchain opportunities on X Layer Mainnet.
                </p>
              </div>
              <div className="flex items-center gap-5">
                <div className="flex gap-5 text-[10px]">
                  <div>
                    <div className="text-tertiary">Assets</div>
                    <div className="font-mono text-[14px] font-semibold text-primary">{assets.length}</div>
                  </div>
                  <div>
                    <div className="text-tertiary">Aave Reserves</div>
                    <div className="font-mono text-[14px] font-semibold text-brand">{earnOpps.length}</div>
                  </div>
                  <div>
                    <div className="text-tertiary">Network</div>
                    <div className="font-mono text-[14px] font-semibold text-primary">Mainnet</div>
                  </div>
                </div>
                <WalletHeader />
              </div>
            </div>
          </section>

          {/* Tabs */}
          <div className="mt-4 flex gap-0.5 border border-edge bg-surface p-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-[4px] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  tab === t.key
                    ? "bg-brand text-white"
                    : "text-secondary hover:bg-overlay-hover"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="mt-4">
            {loading ? (
              <div className="border border-edge bg-surface p-8 text-center text-[11px] text-secondary">
                Loading X Layer mainnet data…
              </div>
            ) : (
              <>
                {tab === "explore" && (
                  <ExploreTab
                    assets={assets}
                    earnOpportunities={earnOpps}
                    borrowOpportunities={borrowOpps}
                  />
                )}
                {tab === "earn" && <EarnTab opportunities={earnOpps} assets={assets} />}
                {tab === "borrow" && <BorrowTab opportunities={borrowOpps} assets={assets} />}
                {tab === "swap" && <SwapTab assets={assets} />}
                {tab === "portfolio" && <PortfolioTab assets={assets} />}
              </>
            )}
          </div>

          <footer className="mt-5 border-t border-edge py-3 text-[9px] text-tertiary">
            All data sourced from X Layer Mainnet (chain 196). Rates from Aave V3 Pool contract. Quotes from Uniswap V3 QuoterV2. All transactions signed by connected wallet.
          </footer>
        </div>
      </main>

      {/* Transaction Toast */}
      <TxToast tx={tx} onClose={resetTx} />
    </div>
  );
}
