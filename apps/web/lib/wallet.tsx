"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BrowserProvider, Contract, JsonRpcProvider, parseUnits, formatUnits } from "ethers";

/* ── Constants ─────────────────────────────────────────────────────── */

export const XLAYER_CHAIN_ID = 196;
export const XLAYER_CHAIN_HEX = "0xC4";
export const XLAYER_RPC = "https://rpc.xlayer.tech";
export const XLAYER_EXPLORER = "https://www.oklink.com/x-layer";

export const AAVE_V3_POOL = "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116";
export const AAVE_ORACLE = "0x91FC11136d5615575a0fC5981Ab5C0C54418E2C6";

export const UNISWAP_ROUTER = "0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca";
export const UNISWAP_QUOTER = "0xd1b797d92d87b688193a2b976efc8d577d204343";

/** Canonical WETH9-like wrapper on X Layer — verified deposit()/withdraw() in bytecode. */
export const WOKB_ADDRESS = "0xe538905cf8410324e03a5a23c1c177a474d59b2b";

export const XLAYER_NETWORK_PARAMS = {
  chainId: XLAYER_CHAIN_HEX,
  chainName: "X Layer Mainnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: [XLAYER_RPC],
  blockExplorerUrls: [`${XLAYER_EXPLORER}/`],
};

/* ── Verified Aave V3 X Layer reserve addresses ────────────────────── */

export const VERIFIED_AAVE_RESERVES: Set<string> = new Set([
  "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT0 (6 dec)
  "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", // USDG  (6 dec)
  "0xe538905cf8410324e03a5a23c1c177a474d59b2b", // WOKB  (18 dec)
  "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f", // xBTC  (8 dec)
  "0xe7b000003a45145decf8a28fc755ad5ec5ea025a", // xETH  (18 dec)
  "0x505000008de8748dbd4422ff4687a4fc9beba15b", // xSOL  (9 dec)
  "0xafeab3b85b6a56cf5f02317f0f7a23340eb983d7", // xBETH (18 dec)
  "0x14a686103854dab7b8801e31979caa595835b25d", // xOKSOL(9 dec)
]);

function isVerifiedAaveReserve(addr: string): boolean {
  return VERIFIED_AAVE_RESERVES.has(addr.toLowerCase());
}

/* ── Minimal ABIs ──────────────────────────────────────────────────── */

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const AAVE_POOL_ABI = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)",
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReservesList() view returns (address[])",
  "function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
];

const AAVE_ORACLE_ABI = [
  "function getAssetsPrices(address[] assets) view returns (uint256[])",
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
];

const UNISWAP_ROUTER_ABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
];

const UNISWAP_QUOTER_ABI = [
  "function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

const WOKB_ABI = [
  "function deposit() payable",
  "function withdraw(uint256)",
  "function balanceOf(address) view returns (uint256)",
];

/* ── Types ─────────────────────────────────────────────────────────── */

export type TxStatus =
  | "idle"
  | "approving"
  | "awaiting_signature"
  | "submitted"
  | "confirming"
  | "success"
  | "failed";

export interface TxState {
  status: TxStatus;
  hash: string | null;
  error: string | null;
  action: string;
}

/** Aave health factor with special handling for type(uint256).max (no debt). */
export interface AaveUserAccountData {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: number;
  ltv: number;
  healthFactor: number;
  healthFactorLabel: string;
  hasDebt: boolean;
}

export interface TokenBalance {
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  balanceFormatted: string;
}

export interface AaveReserveBalance {
  aTokenAddress: string;
  variableDebtTokenAddress: string;
  suppliedBalance: bigint;
  suppliedBalanceFormatted: string;
  debtBalance: bigint;
  debtBalanceFormatted: string;
  supplyAPY: number;
  borrowAPY: number;
  decimals: number;
}

/** Pre-borrow health factor projection. */
export interface BorrowProjection {
  currentHF: number;
  projectedHF: number;
  projectedHFLabel: string;
  totalCollateralBase: bigint;
  projectedDebtBase: bigint;
  safe: boolean;
}

const MAX_UINT256 = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");
const MAX_UINT256_THRESHOLD = BigInt("10000000000000000000000000000000000000000000000000000"); // ~1e50
const MIN_SAFE_HF = 1.05; // Below this, block borrow in UI

/* ── Context ───────────────────────────────────────────────────────── */

interface WalletContextValue {
  // Connection
  connected: boolean;
  address: string | null;
  chainId: number | null;
  provider: BrowserProvider | null;
  signer: Awaited<ReturnType<BrowserProvider["getSigner"]>> | null;
  readProvider: JsonRpcProvider;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToXLayer: () => Promise<void>;

  // Balances
  tokenBalances: TokenBalance[];
  nativeBalance: string;
  refreshBalances: () => Promise<void>;

  // Aave
  aaveAccountData: AaveUserAccountData | null;
  aaveReserveBalances: Map<string, AaveReserveBalance>;
  refreshAaveData: () => Promise<void>;

  // Transaction
  tx: TxState;
  resetTx: () => void;

  // Aave operations
  aaveSupply: (asset: string, amount: string, decimals: number) => Promise<void>;
  aaveWithdraw: (asset: string, amount: string, decimals: number) => Promise<void>;
  aaveBorrow: (asset: string, amount: string, decimals: number) => Promise<void>;
  aaveRepay: (asset: string, amount: string, decimals: number) => Promise<void>;
  projectBorrowHF: (borrowAsset: string, borrowAmount: string, borrowDecimals: number) => Promise<BorrowProjection | null>;

  // Uniswap
  swapExactInputSingle: (
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    decimals: number,
    fee: number,
    slippageBps: number
  ) => Promise<void>;

  // WOKB
  wrapOKB: (amount: string) => Promise<void>;
  unwrapWOKB: (amount: string) => Promise<void>;

  // ERC20
  approveToken: (token: string, spender: string, amount: string, decimals: number) => Promise<void>;
  checkAllowance: (token: string, spender: string, decimals: number) => Promise<bigint>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

const INITIAL_TX: TxState = { status: "idle", hash: null, error: null, action: "" };

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Resolve decimals from chain. Throws if unresolvable — never returns a hardcoded fallback. */
async function resolveDecimals(address: string, provider: JsonRpcProvider): Promise<number> {
  const contract = new Contract(address, ERC20_ABI, provider);
  const decimals = (await contract.decimals()) as number;
  if (decimals <= 0 || decimals > 36) {
    throw new Error(`Implausible decimals ${decimals} for ${address}`);
  }
  return decimals;
}

/** Read decimals for a token. Returns null on failure (fail-closed: never assume 18). */
async function safeResolveDecimals(address: string, provider: JsonRpcProvider): Promise<number | null> {
  try {
    return await resolveDecimals(address, provider);
  } catch {
    return null;
  }
}

/** Parse human-readable amount to raw bigint using chain-resolved decimals. Fail-closed. */
function parseAmount(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

/* ── Provider ──────────────────────────────────────────────────────── */

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<Awaited<ReturnType<BrowserProvider["getSigner"]>> | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [nativeBalance, setNativeBalance] = useState("0");
  const [aaveAccountData, setAaveAccountData] = useState<AaveUserAccountData | null>(null);
  const [aaveReserveBalances, setAaveReserveBalances] = useState<Map<string, AaveReserveBalance>>(new Map());
  const [tx, setTx] = useState<TxState>(INITIAL_TX);

  /** True after explicit user disconnect. Prevents accountsChanged from re-connecting. */
  const manuallyDisconnected = useRef(false);

  const readProvider = useMemo(() => new JsonRpcProvider(XLAYER_RPC, XLAYER_CHAIN_ID), []);

  const connected = !!address && !!provider;

  /* ── Switch to X Layer ──────────────────────────────────────────── */

  const switchToXLayer = useCallback(async () => {
    const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth) return;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: XLAYER_CHAIN_HEX }],
      });
      setChainId(XLAYER_CHAIN_ID);
    } catch (err: unknown) {
      const error = err as { code?: number };
      if (error.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [XLAYER_NETWORK_PARAMS],
        });
        setChainId(XLAYER_CHAIN_ID);
      } else {
        throw err;
      }
    }
  }, []);

  /* ── Connect ─────────────────────────────────────────────────────── */

  const connect = useCallback(async () => {
    if (typeof window === "undefined") return;

    // Clear the manual-disconnect flag — user explicitly wants to connect.
    manuallyDisconnected.current = false;
    try {
      sessionStorage.removeItem("prooflayer_disconnected");
    } catch { /* ignore */ }

    const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth) {
      throw new Error("No EIP-1193 wallet detected. Install MetaMask or OKX Wallet.");
    }

    const browserProvider = new BrowserProvider(eth as unknown as import("ethers").Eip1193Provider);
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    const network = await browserProvider.getNetwork();

    setProvider(browserProvider);
    setAddress(accounts[0]);
    setChainId(Number(network.chainId));
    setSigner(await browserProvider.getSigner());

    if (Number(network.chainId) !== XLAYER_CHAIN_ID) {
      await switchToXLayer();
    }
  }, []);

  const disconnect = useCallback(() => {
    // Mark as manually disconnected so accountsChanged listener and
    // page-refresh auto-connect do not silently reconnect.
    manuallyDisconnected.current = true;
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("prooflayer_disconnected", "1");
      } catch { /* ignore */ }
    }

    // Attempt wallet_revokePermissions — optional, not all wallets support it.
    try {
      const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (eth) {
        eth.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => {
          /* Wallet does not support permission revocation — local disconnect still works */
        });
      }
    } catch { /* optional — ignore */ }

    // Clear all ProofLayer state immediately.
    setAddress(null);
    setChainId(null);
    setProvider(null);
    setSigner(null);
    setTokenBalances([]);
    setNativeBalance("0");
    setAaveAccountData(null);
    setAaveReserveBalances(new Map());
    setTx(INITIAL_TX);
  }, []);

  /* ── Balance reading ─────────────────────────────────────────────── */

  const refreshBalances = useCallback(async () => {
    if (!address || !readProvider) return;

    const bal = await readProvider.getBalance(address);
    setNativeBalance(formatUnits(bal, 18));

    // Token addresses — corrected per on-chain verification August 2026
    const tokens = [
      "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT0 (6 dec)
      "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", // USDG  (6 dec)
      "0xe538905cf8410324e03a5a23c1c177a474d59b2b", // WOKB  (18 dec)
      "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f", // xBTC  (8 dec)
      "0xe7b000003a45145decf8a28fc755ad5ec5ea025a", // xETH  (18 dec)
      "0x505000008de8748dbd4422ff4687a4fc9beba15b", // xSOL  (9 dec) — NOT GHO
      "0xafeab3b85b6a56cf5f02317f0f7a23340eb983d7", // xBETH (18 dec) — NOT xSOL
      "0x14a686103854dab7b8801e31979caa595835b25d", // xOKSOL(9 dec) — NOT xBETH
    ];

    const balances = await Promise.allSettled(
      tokens.map(async (addr) => {
        const contract = new Contract(addr, ERC20_ABI, readProvider);
        const [bal, decimals, symbol] = await Promise.all([
          contract.balanceOf(address) as Promise<bigint>,
          contract.decimals() as Promise<number>,
          contract.symbol() as Promise<string>,
        ]);
        return {
          address: addr,
          symbol,
          decimals,
          balance: bal,
          balanceFormatted: formatUnits(bal, decimals),
        };
      })
    );

    setTokenBalances(
      balances
        .filter((r): r is PromiseFulfilledResult<TokenBalance> => r.status === "fulfilled")
        .map((r) => r.value)
    );
  }, [address, readProvider]);

  /* ── Aave data reading (with dynamic aToken discovery) ───────────── */

  const refreshAaveData = useCallback(async () => {
    if (!address || !readProvider) return;

    // Read account-level data (health factor, collateral, debt)
    try {
      const pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, readProvider);
      const data = (await pool.getUserAccountData(address)) as {
        totalCollateralBase: bigint;
        totalDebtBase: bigint;
        availableBorrowsBase: bigint;
        currentLiquidationThreshold: bigint;
        ltv: bigint;
        healthFactor: bigint;
      };

      // Handle type(uint256).max for accounts with no debt
      const hfRaw = data.healthFactor;
      const hasDebt = data.totalDebtBase > BigInt(0);
      let healthFactor: number;
      let healthFactorLabel: string;

      if (hfRaw >= MAX_UINT256_THRESHOLD || !hasDebt) {
        healthFactor = Infinity;
        healthFactorLabel = hasDebt ? "∞" : "No debt";
      } else {
        healthFactor = Number(hfRaw) / 1e18;
        healthFactorLabel = healthFactor.toFixed(4);
      }

      setAaveAccountData({
        totalCollateralBase: data.totalCollateralBase,
        totalDebtBase: data.totalDebtBase,
        availableBorrowsBase: data.availableBorrowsBase,
        currentLiquidationThreshold: Number(data.currentLiquidationThreshold) / 100,
        ltv: Number(data.ltv) / 100,
        healthFactor,
        healthFactorLabel,
        hasDebt,
      });
    } catch {
      setAaveAccountData(null);
    }

    // Discover aToken and variable-debt-token addresses via getReserveData()
    // Then read actual supplied/debt balances from those token contracts.
    const reserveAddrs = [
      "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT0
      "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", // USDG
      "0xe538905cf8410324e03a5a23c1c177a474d59b2b", // WOKB
      "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f", // xBTC
      "0xe7b000003a45145decf8a28fc755ad5ec5ea025a", // xETH
      "0x505000008de8748dbd4422ff4687a4fc9beba15b", // xSOL
      "0xafeab3b85b6a56cf5f02317f0f7a23340eb983d7", // xBETH
      "0x14a686103854dab7b8801e31979caa595835b25d", // xOKSOL
    ];

    const balances = new Map<string, AaveReserveBalance>();
    const pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, readProvider);

    await Promise.allSettled(
      reserveAddrs.map(async (reserveAddr) => {
        try {
          // 1. Get reserve data from Aave Pool to discover aToken / debtToken addresses
          const reserveData = (await pool.getReserveData(reserveAddr)) as {
            aTokenAddress: string;
            variableDebtTokenAddress: string;
            currentLiquidityRate: bigint;
            currentVariableBorrowRate: bigint;
          };

          const aTokenAddr = reserveData.aTokenAddress;
          const debtTokenAddr = reserveData.variableDebtTokenAddress;

          // 2. Read token decimals from the underlying ERC-20
          const decimals = await safeResolveDecimals(reserveAddr, readProvider);
          if (decimals === null) return; // fail-closed: skip this reserve

          // 3. Read supplied balance from aToken contract
          const aToken = new Contract(aTokenAddr, ERC20_ABI, readProvider);
          const supplied = (await aToken.balanceOf(address)) as bigint;

          // 4. Read debt balance from variable-debt-token contract
          const debtToken = new Contract(debtTokenAddr, ERC20_ABI, readProvider);
          const debt = (await debtToken.balanceOf(address)) as bigint;

          // 5. Convert rates (ray = 1e27) to APY for display
          const supplyAPY = Number(reserveData.currentLiquidityRate) / 1e27;
          const borrowAPY = Number(reserveData.currentVariableBorrowRate) / 1e27;

          balances.set(reserveAddr.toLowerCase(), {
            aTokenAddress: aTokenAddr,
            variableDebtTokenAddress: debtTokenAddr,
            suppliedBalance: supplied,
            suppliedBalanceFormatted: decimals !== null ? formatUnits(supplied, decimals) : "0",
            debtBalance: debt,
            debtBalanceFormatted: decimals !== null ? formatUnits(debt, decimals) : "0",
            supplyAPY,
            borrowAPY,
            decimals,
          });
        } catch {
          // Reserve not initialized or getReserveData failed — skip
        }
      })
    );

    setAaveReserveBalances(balances);
  }, [address, readProvider]);

  /* ── Session restore: clear stale disconnect flag on fresh page load */

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const wasDisconnected = sessionStorage.getItem("prooflayer_disconnected");
      if (wasDisconnected === "1") {
        manuallyDisconnected.current = true;
      }
    } catch { /* ignore */ }
  }, []);

  /* ── Auto-refresh on connect ─────────────────────────────────────── */

  useEffect(() => {
    if (connected && address && !manuallyDisconnected.current) {
      refreshBalances();
      refreshAaveData();
    }
  }, [connected, address, refreshBalances, refreshAaveData]);

  /* ── Wallet event listeners ──────────────────────────────────────── */
  /* Listeners are registered once and use refs to avoid stale-closure    */
  /* bugs. The manuallyDisconnected ref prevents the accountsChanged     */
  /* event from silently re-establishing a connection after the user     */
  /* explicitly disconnected in ProofLayer.                              */

  const refreshBalancesRef = useRef(refreshBalances);
  const refreshAaveDataRef = useRef(refreshAaveData);

  // Keep refs in sync with latest callbacks (avoids stale closures in event listeners)
  useEffect(() => {
    refreshBalancesRef.current = refreshBalances;
    refreshAaveDataRef.current = refreshAaveData;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = (window as unknown as { ethereum?: { on: (event: string, cb: (...args: unknown[]) => void) => void; removeListener: (event: string, cb: (...args: unknown[]) => void) => void } }).ethereum;
    if (!eth) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];

      // If user explicitly disconnected in ProofLayer, ignore wallet events
      // until they click Connect again.
      if (manuallyDisconnected.current) return;

      if (accounts.length === 0) {
        // Wallet extension revoked all accounts — treat as disconnect.
        setAddress(null);
        setChainId(null);
        setProvider(null);
        setSigner(null);
        setTokenBalances([]);
        setNativeBalance("0");
        setAaveAccountData(null);
        setAaveReserveBalances(new Map());
        setTx(INITIAL_TX);
      } else {
        // Wallet switched to a different account — update ProofLayer state.
        setAddress(accounts[0]);
        refreshBalancesRef.current();
        refreshAaveDataRef.current();
      }
    };

    const onChainChanged = (...args: unknown[]) => {
      if (manuallyDisconnected.current) return;
      const chain = args[0] as string;
      setChainId(parseInt(chain, 16));
    };

    eth.on("accountsChanged", onAccountsChanged);
    eth.on("chainChanged", onChainChanged);
    return () => {
      eth.removeListener("accountsChanged", onAccountsChanged);
      eth.removeListener("chainChanged", onChainChanged);
    };
  }, []);

  /* ── ERC20 approval ──────────────────────────────────────────────── */

  const checkAllowance = useCallback(
    async (token: string, spender: string, _decimals: number): Promise<bigint> => {
      if (!readProvider || !address) return BigInt(0);
      const contract = new Contract(token, ERC20_ABI, readProvider);
      const allowance = (await contract.allowance(address, spender)) as bigint;
      return allowance;
    },
    [readProvider, address]
  );

  const approveToken = useCallback(
    async (token: string, spender: string, amount: string, decimals: number) => {
      if (!signer) throw new Error("Wallet not connected");
      const contract = new Contract(token, ERC20_ABI, signer);
      const parsed = parseUnits(amount, decimals);
      setTx({ status: "approving", hash: null, error: null, action: "Approving token" });
      const txResp = await contract.approve(spender, parsed);
      setTx({ status: "submitted", hash: txResp.hash, error: null, action: "Approving token" });
      await txResp.wait();
      setTx({ status: "success", hash: txResp.hash, error: null, action: "Token approved" });
    },
    [signer]
  );

  /* ── Aave Supply ─────────────────────────────────────────────────── */

  const aaveSupply = useCallback(
    async (asset: string, amount: string, decimals: number) => {
      if (!signer || !address) throw new Error("Wallet not connected");
      if (chainId !== XLAYER_CHAIN_ID) throw new Error("Wrong network");

      // Validate: only verified Aave reserves
      if (!isVerifiedAaveReserve(asset)) {
        throw new Error("Token is not a verified Aave V3 reserve on X Layer");
      }

      // Resolve decimals from chain — fail closed
      const resolvedDecimals = await resolveDecimals(asset, readProvider);
      const parsed = parseUnits(amount, resolvedDecimals);

      // Check allowance
      const allowance = await checkAllowance(asset, AAVE_V3_POOL, resolvedDecimals);
      if (allowance < parsed) {
        await approveToken(asset, AAVE_V3_POOL, amount, resolvedDecimals);
      }

      setTx({ status: "awaiting_signature", hash: null, error: null, action: "Supplying to Aave" });
      const pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, signer);
      const txResp = await pool.supply(asset, parsed, address, 0);
      setTx({ status: "submitted", hash: txResp.hash, error: null, action: "Supplying to Aave" });
      await txResp.wait();
      setTx({ status: "success", hash: txResp.hash, error: null, action: "Supply successful" });
      await refreshBalances();
      await refreshAaveData();
    },
    [signer, address, chainId, readProvider, checkAllowance, approveToken, refreshBalances, refreshAaveData]
  );

  /* ── Aave Withdraw ───────────────────────────────────────────────── */

  const aaveWithdraw = useCallback(
    async (asset: string, amount: string, decimals: number) => {
      if (!signer || !address) throw new Error("Wallet not connected");
      if (chainId !== XLAYER_CHAIN_ID) throw new Error("Wrong network");

      if (!isVerifiedAaveReserve(asset)) {
        throw new Error("Token is not a verified Aave V3 reserve on X Layer");
      }

      const resolvedDecimals = await resolveDecimals(asset, readProvider);
      const parsed = parseUnits(amount, resolvedDecimals);
      setTx({ status: "awaiting_signature", hash: null, error: null, action: "Withdrawing from Aave" });
      const pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, signer);
      const txResp = await pool.withdraw(asset, parsed, address);
      setTx({ status: "submitted", hash: txResp.hash, error: null, action: "Withdrawing from Aave" });
      await txResp.wait();
      setTx({ status: "success", hash: txResp.hash, error: null, action: "Withdraw successful" });
      await refreshBalances();
      await refreshAaveData();
    },
    [signer, address, chainId, readProvider, refreshBalances, refreshAaveData]
  );

  /* ── Pre-borrow health factor projection ─────────────────────────── */

  const projectBorrowHF = useCallback(
    async (borrowAsset: string, borrowAmount: string, borrowDecimals: number): Promise<BorrowProjection | null> => {
      if (!readProvider || !address) return null;

      try {
        const pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, readProvider);
        const data = (await pool.getUserAccountData(address)) as {
          totalCollateralBase: bigint;
          totalDebtBase: bigint;
          availableBorrowsBase: bigint;
          currentLiquidationThreshold: bigint;
          ltv: bigint;
          healthFactor: bigint;
        };

        if (data.totalCollateralBase === BigInt(0)) {
          return {
            currentHF: Infinity,
            projectedHF: 0,
            projectedHFLabel: "No collateral",
            totalCollateralBase: BigInt(0),
            projectedDebtBase: BigInt(0),
            safe: false,
          };
        }

        // Get oracle price for the borrow asset
        const oracle = new Contract(AAVE_ORACLE, AAVE_ORACLE_ABI, readProvider);
        const baseUnit = (await oracle.BASE_CURRENCY_UNIT()) as bigint;
        const prices = (await oracle.getAssetsPrices([borrowAsset])) as bigint[];
        const borrowAssetPrice = prices[0];

        if (borrowAssetPrice === BigInt(0)) {
          return null; // Cannot project without price data
        }

        // Convert borrow amount to base currency units for projection
        // Aave uses 8-decimal base currency (USD with 8 decimals)
        const borrowAmountRaw = parseUnits(borrowAmount, borrowDecimals);
        const borrowInBase = (borrowAmountRaw * borrowAssetPrice) / baseUnit;

        // Current HF = totalCollateralBase * LT / (totalDebtBase * 10000)
        const lt = data.currentLiquidationThreshold; // already in basis points
        const projectedDebt = data.totalDebtBase + borrowInBase;

        let projectedHF: number;
        let projectedHFLabel: string;

        if (projectedDebt === BigInt(0)) {
          projectedHF = Infinity;
          projectedHFLabel = "∞";
        } else {
          const hfBig = (data.totalCollateralBase * lt) / (projectedDebt * BigInt(10000));
          projectedHF = Number(hfBig) / 1e18;
          projectedHFLabel = projectedHF.toFixed(4);
        }

        // Current HF
        let currentHF: number;
        if (data.healthFactor >= MAX_UINT256_THRESHOLD || data.totalDebtBase === BigInt(0)) {
          currentHF = Infinity;
        } else {
          currentHF = Number(data.healthFactor) / 1e18;
        }

        return {
          currentHF,
          projectedHF,
          projectedHFLabel,
          totalCollateralBase: data.totalCollateralBase,
          projectedDebtBase: projectedDebt,
          safe: projectedHF >= MIN_SAFE_HF,
        };
      } catch {
        return null;
      }
    },
    [readProvider, address]
  );

  /* ── Aave Borrow ─────────────────────────────────────────────────── */

  const aaveBorrow = useCallback(
    async (asset: string, amount: string, decimals: number) => {
      if (!signer || !address) throw new Error("Wallet not connected");
      if (chainId !== XLAYER_CHAIN_ID) throw new Error("Wrong network");

      if (!isVerifiedAaveReserve(asset)) {
        throw new Error("Token is not a verified Aave V3 reserve on X Layer");
      }

      // Pre-borrow safety check: project health factor
      const projection = await projectBorrowHF(asset, amount, decimals);
      if (projection && !projection.safe) {
        throw new Error(
          `Transaction blocked: projected health factor (${projection.projectedHFLabel}) is below the safety threshold (${MIN_SAFE_HF}). Reduce borrow amount or add more collateral.`
        );
      }

      const resolvedDecimals = await resolveDecimals(asset, readProvider);
      const parsed = parseUnits(amount, resolvedDecimals);
      setTx({ status: "awaiting_signature", hash: null, error: null, action: "Borrowing from Aave" });
      const pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, signer);
      // interestRateMode: 2 = variable
      const txResp = await pool.borrow(asset, parsed, 2, 0, address);
      setTx({ status: "submitted", hash: txResp.hash, error: null, action: "Borrowing from Aave" });
      await txResp.wait();
      setTx({ status: "success", hash: txResp.hash, error: null, action: "Borrow successful" });
      await refreshBalances();
      await refreshAaveData();
    },
    [signer, address, chainId, readProvider, projectBorrowHF, refreshBalances, refreshAaveData]
  );

  /* ── Aave Repay ──────────────────────────────────────────────────── */

  const aaveRepay = useCallback(
    async (asset: string, amount: string, decimals: number) => {
      if (!signer || !address) throw new Error("Wallet not connected");
      if (chainId !== XLAYER_CHAIN_ID) throw new Error("Wrong network");

      if (!isVerifiedAaveReserve(asset)) {
        throw new Error("Token is not a verified Aave V3 reserve on X Layer");
      }

      const resolvedDecimals = await resolveDecimals(asset, readProvider);
      const parsed = parseUnits(amount, resolvedDecimals);

      // Check allowance
      const allowance = await checkAllowance(asset, AAVE_V3_POOL, resolvedDecimals);
      if (allowance < parsed) {
        await approveToken(asset, AAVE_V3_POOL, amount, resolvedDecimals);
      }

      setTx({ status: "awaiting_signature", hash: null, error: null, action: "Repaying Aave debt" });
      const pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, signer);
      // interestRateMode: 2 = variable
      const txResp = await pool.repay(asset, parsed, 2, address);
      setTx({ status: "submitted", hash: txResp.hash, error: null, action: "Repaying Aave debt" });
      await txResp.wait();
      setTx({ status: "success", hash: txResp.hash, error: null, action: "Repay successful" });
      await refreshBalances();
      await refreshAaveData();
    },
    [signer, address, chainId, readProvider, checkAllowance, approveToken, refreshBalances, refreshAaveData]
  );

  /* ── Uniswap Swap ────────────────────────────────────────────────── */

  const swapExactInputSingle = useCallback(
    async (
      tokenIn: string,
      tokenOut: string,
      amountIn: string,
      decimals: number,
      fee: number,
      slippageBps: number
    ) => {
      if (!signer || !address) throw new Error("Wallet not connected");
      if (chainId !== XLAYER_CHAIN_ID) throw new Error("Wrong network");

      const resolvedDecimals = await resolveDecimals(tokenIn, readProvider);
      const parsed = parseUnits(amountIn, resolvedDecimals);

      // Check allowance
      const allowance = await checkAllowance(tokenIn, UNISWAP_ROUTER, resolvedDecimals);
      if (allowance < parsed) {
        await approveToken(tokenIn, UNISWAP_ROUTER, amountIn, resolvedDecimals);
      }

      // Get quote first
      const quoter = new Contract(UNISWAP_QUOTER, UNISWAP_QUOTER_ABI, readProvider);
      const quoteResult = (await quoter.quoteExactInputSingle({
        tokenIn,
        tokenOut,
        amountIn: parsed,
        fee,
        sqrtPriceLimitX96: 0,
      })) as [bigint, bigint, number, bigint];

      const amountOut = quoteResult[0];
      const amountOutMin = (amountOut * BigInt(10000 - slippageBps)) / BigInt(10000);

      setTx({ status: "awaiting_signature", hash: null, error: null, action: "Swapping on Uniswap" });
      const router = new Contract(UNISWAP_ROUTER, UNISWAP_ROUTER_ABI, signer);
      const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes
      const txResp = await router.exactInputSingle({
        tokenIn,
        tokenOut,
        fee,
        recipient: address,
        deadline,
        amountIn: parsed,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0,
      });
      setTx({ status: "submitted", hash: txResp.hash, error: null, action: "Swapping on Uniswap" });
      await txResp.wait();
      setTx({ status: "success", hash: txResp.hash, error: null, action: "Swap successful" });
      await refreshBalances();
    },
    [signer, address, chainId, readProvider, checkAllowance, approveToken, refreshBalances]
  );

  /* ── WOKB Wrapping / Unwrapping ──────────────────────────────────── */

  const wrapOKB = useCallback(
    async (amount: string) => {
      if (!signer || !address) throw new Error("Wallet not connected");
      if (chainId !== XLAYER_CHAIN_ID) throw new Error("Wrong network");

      setTx({ status: "awaiting_signature", hash: null, error: null, action: "Wrapping OKB → WOKB" });
      const wokb = new Contract(WOKB_ADDRESS, WOKB_ABI, signer);
      const parsed = parseUnits(amount, 18);
      const txResp = await wokb.deposit({ value: parsed });
      setTx({ status: "submitted", hash: txResp.hash, error: null, action: "Wrapping OKB → WOKB" });
      await txResp.wait();
      setTx({ status: "success", hash: txResp.hash, error: null, action: "Wrap successful" });
      await refreshBalances();
    },
    [signer, address, chainId, refreshBalances]
  );

  const unwrapWOKB = useCallback(
    async (amount: string) => {
      if (!signer || !address) throw new Error("Wallet not connected");
      if (chainId !== XLAYER_CHAIN_ID) throw new Error("Wrong network");

      setTx({ status: "awaiting_signature", hash: null, error: null, action: "Unwrapping WOKB → OKB" });
      const wokb = new Contract(WOKB_ADDRESS, WOKB_ABI, signer);
      const parsed = parseUnits(amount, 18);
      const txResp = await wokb.withdraw(parsed);
      setTx({ status: "submitted", hash: txResp.hash, error: null, action: "Unwrapping WOKB → OKB" });
      await txResp.wait();
      setTx({ status: "success", hash: txResp.hash, error: null, action: "Unwrap successful" });
      await refreshBalances();
    },
    [signer, address, chainId, refreshBalances]
  );

  /* ── Reset TX ────────────────────────────────────────────────────── */

  const resetTx = useCallback(() => setTx(INITIAL_TX), []);

  /* ── Context value ───────────────────────────────────────────────── */

  const value: WalletContextValue = useMemo(
    () => ({
      connected,
      address,
      chainId,
      provider,
      signer,
      readProvider,
      connect,
      disconnect,
      switchToXLayer,
      tokenBalances,
      nativeBalance,
      refreshBalances,
      aaveAccountData,
      aaveReserveBalances,
      refreshAaveData,
      tx,
      resetTx,
      aaveSupply,
      aaveWithdraw,
      aaveBorrow,
      aaveRepay,
      projectBorrowHF,
      swapExactInputSingle,
      wrapOKB,
      unwrapWOKB,
      approveToken,
      checkAllowance,
    }),
    [
      connected,
      address,
      chainId,
      provider,
      signer,
      readProvider,
      connect,
      disconnect,
      switchToXLayer,
      tokenBalances,
      nativeBalance,
      refreshBalances,
      aaveAccountData,
      aaveReserveBalances,
      refreshAaveData,
      tx,
      resetTx,
      aaveSupply,
      aaveWithdraw,
      aaveBorrow,
      aaveRepay,
      projectBorrowHF,
      swapExactInputSingle,
      wrapOKB,
      unwrapWOKB,
      approveToken,
      checkAllowance,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export { shorten };
