import assert from "node:assert/strict";
import { network } from "hardhat";

const XLAYER_TESTNET_CHAIN_ID = 1952n;
const { ethers } = await network.create();

function assertSameAddress(actual: string, expected: string, message: string): void {
  assert.equal(actual.toLowerCase(), expected.toLowerCase(), message);
}

const connectedNetwork = await ethers.provider.getNetwork();
if (connectedNetwork.chainId !== XLAYER_TESTNET_CHAIN_ID) {
  throw new Error(
    `Refusing to deploy: expected X Layer Testnet chain ID ${XLAYER_TESTNET_CHAIN_ID}, received ${connectedNetwork.chainId}`,
  );
}

const [deployer] = await ethers.getSigners();
const deployerBalance = await ethers.provider.getBalance(deployer.address);
if (deployerBalance === 0n) {
  throw new Error(`Refusing to deploy: ${deployer.address} has no testnet OKB for gas`);
}

console.log("Deploying ProofLayer to X Layer Testnet");
console.log(`Chain ID: ${connectedNetwork.chainId}`);
console.log(`Deployer: ${deployer.address}`);
console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)} OKB`);

console.log("\nA. Deploying ProofLayerCertificateRegistry...");
const registry = await ethers.deployContract("ProofLayerCertificateRegistry", [], deployer);
await registry.waitForDeployment();
const registryAddress = await registry.getAddress();
console.log(`ProofLayerCertificateRegistry: ${registryAddress}`);

console.log("\nB. Deploying ProofLayerDecisionLog...");
const decisionLog = await ethers.deployContract("ProofLayerDecisionLog", [], deployer);
await decisionLog.waitForDeployment();
const decisionLogAddress = await decisionLog.getAddress();
console.log(`ProofLayerDecisionLog: ${decisionLogAddress}`);

console.log("\nC. Deploying ProofLayerPolicyGate...");
const policyGate = await ethers.deployContract(
  "ProofLayerPolicyGate",
  [registryAddress, decisionLogAddress],
  deployer,
);
await policyGate.waitForDeployment();
const policyGateAddress = await policyGate.getAddress();
console.log(`ProofLayerPolicyGate: ${policyGateAddress}`);

console.log("\nAuthorizing ProofLayerPolicyGate as a DecisionLog writer...");
const authorizationTransaction = await decisionLog.setWriterAuthorization(policyGateAddress, true);
await authorizationTransaction.wait();

console.log("Running post-deployment assertions...");
assertSameAddress(await registry.owner(), deployer.address, "Registry owner is not the deployer");
assertSameAddress(await decisionLog.owner(), deployer.address, "DecisionLog owner is not the deployer");
assertSameAddress(await policyGate.registry(), registryAddress, "PolicyGate registry wiring is incorrect");
assertSameAddress(
  await policyGate.decisionLog(),
  decisionLogAddress,
  "PolicyGate DecisionLog wiring is incorrect",
);
assert.equal(
  await decisionLog.authorizedWriters(policyGateAddress),
  true,
  "PolicyGate is not an authorized DecisionLog writer",
);

console.log("All post-deployment assertions passed");
console.log("\nProofLayer deployment addresses");
console.log(`ProofLayerCertificateRegistry: ${registryAddress}`);
console.log(`ProofLayerDecisionLog:          ${decisionLogAddress}`);
console.log(`ProofLayerPolicyGate:           ${policyGateAddress}`);
