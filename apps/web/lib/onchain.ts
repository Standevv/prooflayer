import { Contract, Interface, JsonRpcProvider } from "ethers";

import {
  CERTIFICATE_REGISTRY_ABI,
  DECISION_LOG_ABI,
  POLICY_GATE_ABI,
  PROOFLAYER_CONTRACTS,
  PROOFLAYER_DEPLOYMENT_BLOCK,
  XLAYER_TESTNET,
} from "@/lib/contracts";

type StoredCertificateResult = {
  certificateId: string;
  assetId: string;
  claimType: string;
  policyId: string;
  evidenceRoot: string;
  observedAt: bigint;
  validUntil: bigint;
  independentRootCount: bigint;
  result: bigint;
  issuer: string;
  revoked: boolean;
};

export type OnchainCertificate = {
  certificateId: string;
  assetId: string;
  claimType: string;
  policyId: string;
  evidenceRoot: string;
  observedAt: number;
  validUntil: number;
  independentRootCount: number;
  result: number;
  issuer: string;
  revoked: boolean;
};

export type OnchainDecision = {
  decisionId: string;
  certificateId: string;
  actor: string;
  actionType: string;
  allowed: boolean;
  timestamp: number;
  transactionHash: string;
};

export type OnchainDashboardData = {
  connected: boolean;
  chainId: number | null;
  latestBlock: number | null;
  registered: boolean | null;
  usable: boolean | null;
  certificate: OnchainCertificate | null;
  decision: OnchainDecision | null;
  decisionLookupComplete: boolean;
  executedActionCount: string | null;
  decisionCount: string | null;
  error: string | null;
};

type OnchainReadOptions = {
  includeDecision?: boolean;
};

const DECISION_EVENT_LOOKBACK = 100_000;
const LOG_QUERY_CHUNK_SIZE = 2_000;
const LOG_QUERY_BATCH_SIZE = 5;

async function findLatestDecision(
  provider: JsonRpcProvider,
  certificateId: string,
  latestBlock: number,
): Promise<OnchainDecision | null> {
  const eventInterface = new Interface(DECISION_LOG_ABI);
  const event = eventInterface.getEvent("DecisionRecorded");
  if (event === null) return null;

  const earliestBlock = Math.max(
    PROOFLAYER_DEPLOYMENT_BLOCK,
    latestBlock - DECISION_EVENT_LOOKBACK,
  );
  const ranges: Array<{ fromBlock: number; toBlock: number }> = [];
  for (let end = latestBlock; end >= earliestBlock; ) {
    const start = Math.max(earliestBlock, end - LOG_QUERY_CHUNK_SIZE + 1);
    ranges.push({ fromBlock: start, toBlock: end });
    end = start - 1;
  }

  for (let index = 0; index < ranges.length; index += LOG_QUERY_BATCH_SIZE) {
    const batch = ranges.slice(index, index + LOG_QUERY_BATCH_SIZE);
    const logs = (
      await Promise.all(
        batch.map((range) =>
          provider.getLogs({
            address: PROOFLAYER_CONTRACTS.decisionLog,
            topics: [event.topicHash, null, certificateId],
            ...range,
          }),
        ),
      )
    ).flat();
    const latestLog = logs.sort(
      (left, right) => right.blockNumber - left.blockNumber || right.index - left.index,
    )[0];
    if (latestLog !== undefined) {
      const parsed = eventInterface.parseLog(latestLog);
      if (parsed === null) return null;
      return {
        decisionId: String(parsed.args.decisionId),
        certificateId: String(parsed.args.certificateId),
        actor: String(parsed.args.actor),
        actionType: String(parsed.args.actionType),
        allowed: Boolean(parsed.args.allowed),
        timestamp: Number(parsed.args.timestamp),
        transactionHash: latestLog.transactionHash,
      };
    }
  }
  return null;
}

export async function getOnchainDashboardData(
  certificateId: string,
  options: OnchainReadOptions = {},
): Promise<OnchainDashboardData> {
  try {
    const provider = new JsonRpcProvider(XLAYER_TESTNET.rpcUrl);
    const registry = new Contract(
      PROOFLAYER_CONTRACTS.registry,
      CERTIFICATE_REGISTRY_ABI,
      provider,
    );
    const policyGate = new Contract(
      PROOFLAYER_CONTRACTS.policyGate,
      POLICY_GATE_ABI,
      provider,
    );
    const decisionLog = new Contract(
      PROOFLAYER_CONTRACTS.decisionLog,
      DECISION_LOG_ABI,
      provider,
    );

    const [rawChainId, latestBlock, registered, gateRegistry, gateDecisionLog] =
      await Promise.all([
        provider.send("eth_chainId", []),
        provider.getBlockNumber(),
        registry.certificateExists(certificateId) as Promise<boolean>,
        policyGate.registry() as Promise<string>,
        policyGate.decisionLog() as Promise<string>,
      ]);
    const chainId = Number(BigInt(String(rawChainId)));
    if (chainId !== XLAYER_TESTNET.chainId) {
      throw new Error(`RPC returned unexpected chain ID ${chainId}`);
    }
    if (gateRegistry.toLowerCase() !== PROOFLAYER_CONTRACTS.registry.toLowerCase()) {
      throw new Error("PolicyGate registry wiring mismatch");
    }
    if (
      gateDecisionLog.toLowerCase() !==
      PROOFLAYER_CONTRACTS.decisionLog.toLowerCase()
    ) {
      throw new Error("PolicyGate DecisionLog wiring mismatch");
    }

    const [executedActionCount, decisionCount] = await Promise.all([
      policyGate.executedActionCount() as Promise<bigint>,
      decisionLog.decisionCount() as Promise<bigint>,
    ]);

    let usable: boolean | null = null;
    let certificate: OnchainCertificate | null = null;
    if (registered) {
      const [stored, isUsable] = (await Promise.all([
        registry.getCertificate(certificateId) as Promise<StoredCertificateResult>,
        registry.isCertificateUsable(certificateId) as Promise<boolean>,
      ])) as [StoredCertificateResult, boolean];
      usable = isUsable;
      certificate = {
        certificateId: stored.certificateId,
        assetId: stored.assetId,
        claimType: stored.claimType,
        policyId: stored.policyId,
        evidenceRoot: stored.evidenceRoot,
        observedAt: Number(stored.observedAt),
        validUntil: Number(stored.validUntil),
        independentRootCount: Number(stored.independentRootCount),
        result: Number(stored.result),
        issuer: stored.issuer,
        revoked: stored.revoked,
      };
    }

    let decision: OnchainDecision | null = null;
    let decisionLookupComplete = false;
    if (options.includeDecision !== false) {
      decisionLookupComplete = true;
      if (decisionCount === BigInt(0)) {
        // No decisions exist on-chain; skip the historical log scan entirely.
        decision = null;
      } else {
        try {
          decision = await findLatestDecision(provider, certificateId, latestBlock);
        } catch {
          // Certificate reads remain useful when an RPC restricts historical logs.
          decisionLookupComplete = false;
        }
      }
    }

    return {
      connected: true,
      chainId,
      latestBlock,
      registered,
      usable,
      certificate,
      decision,
      decisionLookupComplete,
      executedActionCount: executedActionCount.toString(),
      decisionCount: decisionCount.toString(),
      error: null,
    };
  } catch (error) {
    return {
      connected: false,
      chainId: null,
      latestBlock: null,
      registered: null,
      usable: null,
      certificate: null,
      decision: null,
      decisionLookupComplete: false,
      executedActionCount: null,
      decisionCount: null,
      error: error instanceof Error ? error.message : "X Layer RPC unavailable",
    };
  }
}
