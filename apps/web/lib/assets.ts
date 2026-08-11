export const ASSET_CLASS_FILTERS = [
  "All asset classes",
  "Treasuries",
  "Commodities",
  "Infrastructure",
  "Property",
] as const;

export const VERIFICATION_FILTERS = [
  "All verification states",
  "Verified",
  "Demo",
  "Example",
  "No Certificate",
] as const;

export type AssetClassFilter = (typeof ASSET_CLASS_FILTERS)[number];
export type VerificationFilter = (typeof VERIFICATION_FILTERS)[number];
export type AssetBadgeTone =
  | "live"
  | "fixture"
  | "success"
  | "warning"
  | "neutral";

export type AssetAuthenticityLabel = {
  label: string;
  tone: AssetBadgeTone;
};

export type ProofLayerAsset = {
  slug: string;
  name: string;
  symbol: string;
  assetClass: string;
  assetClassFilter: Exclude<AssetClassFilter, "All asset classes">;
  claim: string;
  eyebrow: string;
  description: string;
  supportState: "demo-live" | "no-fixture" | "example";
  supportSummary: string;
  fixtureAvailable: boolean;
  liveOnchainAvailable: boolean;
  verificationFilters: ReadonlyArray<
    Exclude<VerificationFilter, "All verification states">
  >;
  authenticityLabels: readonly AssetAuthenticityLabel[];
  expectedEvidence: readonly string[];
  image: {
    src: string;
    alt: string;
    position?: string;
    treatment?: "gold" | "grain";
  } | null;
};

export const PROOFLAYER_ASSETS = [
  {
    slug: "usdy",
    name: "USDY",
    symbol: "USDY",
    assetClass: "Tokenized U.S. Treasuries",
    assetClassFilter: "Treasuries",
    claim: "Treasury Backing",
    eyebrow: "Government securities",
    description:
      "A deterministic Treasury-backing demo fixture anchored to the live ProofLayer deployment on X Layer Testnet.",
    supportState: "demo-live",
    supportSummary: "Verification fixture and live read-only certificate state available",
    fixtureAvailable: true,
    liveOnchainAvailable: true,
    verificationFilters: ["Verified", "Demo"],
    authenticityLabels: [
      { label: "DEMO FIXTURE", tone: "fixture" },
      { label: "LIVE ON-CHAIN", tone: "live" },
    ],
    expectedEvidence: [
      "Issuer product and reserve records",
      "Independent on-chain state",
      "Normalized provenance commitments",
      "Deterministic policy inputs",
    ],
    image: {
      src: "/assets/us-treasury.webp",
      alt: "United States Treasury building in Washington, D.C.",
    },
  },
  {
    slug: "paxg",
    name: "PAXG",
    symbol: "PAXG",
    assetClass: "Tokenized Gold",
    assetClassFilter: "Commodities",
    claim: "Gold Backing",
    eyebrow: "Physical commodity",
    description:
      "A gold-reserve verification category. This frontend has no exported PAXG verification fixture or certificate.",
    supportState: "no-fixture",
    supportSummary: "No verification fixture or ProofLayer certificate",
    fixtureAvailable: false,
    liveOnchainAvailable: false,
    verificationFilters: ["No Certificate"],
    authenticityLabels: [
      { label: "NO VERIFICATION FIXTURE", tone: "warning" },
      { label: "NO CERTIFICATE", tone: "neutral" },
    ],
    expectedEvidence: [
      "Issuer reserve attestations",
      "Custodian and bar-allocation records",
      "Token supply and ownership state",
      "Independent reserve reconciliation",
    ],
    image: {
      src: "/assets/paxg-gold-vault.jpeg",
      alt: "Gold bullion stored in an institutional reserve vault",
      position: "center",
      treatment: "gold",
    },
  },
  {
    slug: "solar-infrastructure",
    name: "Solar Infrastructure",
    symbol: "SOLAR",
    assetClass: "Renewable Infrastructure",
    assetClassFilter: "Infrastructure",
    claim: "Project / Asset Backing",
    eyebrow: "Physical infrastructure",
    description:
      "An example coverage category for evidence-backed ownership and project claims involving renewable infrastructure.",
    supportState: "example",
    supportSummary: "Conceptual coverage only; verification support is not enabled",
    fixtureAvailable: false,
    liveOnchainAvailable: false,
    verificationFilters: ["Example", "No Certificate"],
    authenticityLabels: [
      { label: "EXAMPLE ASSET", tone: "warning" },
      { label: "NO CERTIFICATE", tone: "neutral" },
    ],
    expectedEvidence: [
      "Project ownership and title records",
      "Construction and operating documentation",
      "Independent production or metering records",
      "Custody and on-chain claim state",
    ],
    image: {
      src: "/assets/solar-infrastructure.jpeg",
      alt: "Aerial view of a large solar-energy farm and electrical infrastructure",
      position: "center",
    },
  },
  {
    slug: "agricultural-inventory",
    name: "Agricultural Inventory",
    symbol: "GRAIN",
    assetClass: "Commodity / Inventory",
    assetClassFilter: "Commodities",
    claim: "Warehouse / Reserve Backing",
    eyebrow: "Agricultural commodity",
    description:
      "An example coverage category for physical inventory claims that depend on quantity, custody, and provenance.",
    supportState: "example",
    supportSummary: "Conceptual coverage only; verification support is not enabled",
    fixtureAvailable: false,
    liveOnchainAvailable: false,
    verificationFilters: ["Example", "No Certificate"],
    authenticityLabels: [
      { label: "EXAMPLE ASSET", tone: "warning" },
      { label: "NO CERTIFICATE", tone: "neutral" },
    ],
    expectedEvidence: [
      "Warehouse receipts and inventory ledgers",
      "Quantity and quality inspection records",
      "Warehouse operator or custodian records",
      "Ownership and on-chain claim state",
    ],
    image: {
      src: "/assets/agricultural-commodity-storage.jpeg",
      alt: "Aerial view of grain-storage silos surrounded by agricultural fields",
      position: "center",
      treatment: "grain",
    },
  },
  {
    slug: "real-estate",
    name: "Commercial Real Estate",
    symbol: "CRE",
    assetClass: "Property",
    assetClassFilter: "Property",
    claim: "Ownership / Asset Backing",
    eyebrow: "Property",
    description:
      "An example coverage category for property ownership and asset-backing claims. No property image or proof data is supplied.",
    supportState: "example",
    supportSummary: "Conceptual coverage only; verification support is not enabled",
    fixtureAvailable: false,
    liveOnchainAvailable: false,
    verificationFilters: ["Example", "No Certificate"],
    authenticityLabels: [
      { label: "EXAMPLE ASSET", tone: "warning" },
      { label: "NO CERTIFICATE", tone: "neutral" },
    ],
    expectedEvidence: [
      "Title and beneficial-ownership records",
      "Property registry documentation",
      "Independent valuation or inspection records",
      "Issuer and on-chain ownership state",
    ],
    image: null,
  },
] as const satisfies readonly ProofLayerAsset[];

export function getAssetBySlug(slug: string): ProofLayerAsset | undefined {
  return PROOFLAYER_ASSETS.find((asset) => asset.slug === slug);
}
