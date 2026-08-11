import xlayerDeployment from "../../../data/xlayer-testnet.json";

const deployment = xlayerDeployment as {
  network: string;
  chain_id: number;
  rpc_url: string;
  explorer_url: string;
  contracts: {
    registry: string;
    decision_log: string;
    policy_gate: string;
  };
  deployment_start_blocks: {
    registry: number;
    decision_log: number;
    policy_gate: number;
  };
};

export const XLAYER_TESTNET = {
  name: deployment.network,
  chainId: deployment.chain_id,
  rpcUrl: deployment.rpc_url,
  explorerUrl: deployment.explorer_url,
};

export const PROOFLAYER_CONTRACTS = {
  registry: deployment.contracts.registry,
  decisionLog: deployment.contracts.decision_log,
  policyGate: deployment.contracts.policy_gate,
};

// Earliest block containing this fixed testnet deployment. It bounds log reads.
export const PROOFLAYER_DEPLOYMENT_BLOCK =
  deployment.deployment_start_blocks.decision_log;

export const CERTIFICATE_REGISTRY_ABI = [
  "function certificateExists(bytes32 certificateId) view returns (bool)",
  "function isCertificateUsable(bytes32 certificateId) view returns (bool)",
  "function getCertificate(bytes32 certificateId) view returns (tuple(bytes32 certificateId, bytes32 assetId, bytes32 claimType, bytes32 policyId, bytes32 evidenceRoot, uint64 observedAt, uint64 validUntil, uint32 independentRootCount, uint8 result, address issuer, bool revoked))",
] as const;

export const POLICY_GATE_ABI = [
  "function registry() view returns (address)",
  "function decisionLog() view returns (address)",
  "function executedActionCount() view returns (uint256)",
] as const;

export const DECISION_LOG_ABI = [
  "function decisionCount() view returns (uint256)",
  "event DecisionRecorded(bytes32 indexed decisionId, bytes32 indexed certificateId, address indexed actor, bytes32 actionType, bool allowed, uint64 timestamp)",
] as const;
