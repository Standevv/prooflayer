import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { network } from "hardhat";

const XLAYER_TESTNET_CHAIN_ID = 1952n;
const REGISTRY_ADDRESS = "0xC24A1Aa861aA4ca5D15CEC055223EBACd0940935";
const DECISION_LOG_ADDRESS = "0x0476A86b75a5e92a09c228227A0573d90E1a2fA1";
const POLICY_GATE_ADDRESS = "0x8e07048285D5f54a3D1D2093b80F4Aa2ce75C645";

type DemoCertificate = {
  human: {
    asset: string;
    claim_type: string;
    policy_id: string;
    result: string;
  };
  solidity: {
    certificateId: string;
    assetId: string;
    claimType: string;
    policyId: string;
    evidenceRoot: string;
    observedAt: number;
    validUntil: number;
    independentRootCount: number;
    result: number;
  };
};

const { ethers } = await network.create();
const actionType = ethers.id("EXECUTE_VERIFIED_ACTION");

function sameHex(actual: string, expected: string): boolean {
  return actual.toLowerCase() === expected.toLowerCase();
}

function printable(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
}

async function loadCertificate(relativePath: string): Promise<DemoCertificate> {
  const fileUrl = new URL(relativePath, import.meta.url);
  const parsed: unknown = JSON.parse(await readFile(fileUrl, "utf8"));
  assert.equal(typeof parsed, "object", `${relativePath} must contain a JSON object`);
  assert.notEqual(parsed, null, `${relativePath} must not be null`);

  const candidate = parsed as Partial<DemoCertificate>;
  assert.equal(typeof candidate.human, "object", `${relativePath} is missing human fields`);
  assert.equal(typeof candidate.solidity, "object", `${relativePath} is missing Solidity fields`);
  assert.notEqual(candidate.human, null, `${relativePath} human fields must not be null`);
  assert.notEqual(candidate.solidity, null, `${relativePath} Solidity fields must not be null`);

  const bytes32Fields = [
    "certificateId",
    "assetId",
    "claimType",
    "policyId",
    "evidenceRoot",
  ] as const;
  for (const field of bytes32Fields) {
    assert.equal(
      ethers.isHexString(candidate.solidity?.[field], 32),
      true,
      `${relativePath} solidity.${field} must be bytes32 hex`,
    );
  }
  for (const field of ["observedAt", "validUntil", "independentRootCount", "result"] as const) {
    assert.equal(
      Number.isSafeInteger(candidate.solidity?.[field]),
      true,
      `${relativePath} solidity.${field} must be a safe integer`,
    );
  }

  return candidate as DemoCertificate;
}

const connectedNetwork = await ethers.provider.getNetwork();
if (connectedNetwork.chainId !== XLAYER_TESTNET_CHAIN_ID) {
  throw new Error(
    `Refusing to run: expected X Layer Testnet chain ID ${XLAYER_TESTNET_CHAIN_ID}, received ${connectedNetwork.chainId}`,
  );
}

const [deployer] = await ethers.getSigners();
const registry = await ethers.getContractAt("ProofLayerCertificateRegistry", REGISTRY_ADDRESS, deployer);
const decisionLog = await ethers.getContractAt("ProofLayerDecisionLog", DECISION_LOG_ADDRESS, deployer);
const policyGate = await ethers.getContractAt("ProofLayerPolicyGate", POLICY_GATE_ADDRESS, deployer);

const [registryCode, decisionLogCode, policyGateCode] = await Promise.all([
  ethers.provider.getCode(REGISTRY_ADDRESS),
  ethers.provider.getCode(DECISION_LOG_ADDRESS),
  ethers.provider.getCode(POLICY_GATE_ADDRESS),
]);
assert.notEqual(registryCode, "0x", "Registry address has no deployed bytecode");
assert.notEqual(decisionLogCode, "0x", "DecisionLog address has no deployed bytecode");
assert.notEqual(policyGateCode, "0x", "PolicyGate address has no deployed bytecode");
assert.equal(
  sameHex(await policyGate.registry(), REGISTRY_ADDRESS),
  true,
  "PolicyGate registry wiring mismatch",
);
assert.equal(
  sameHex(await policyGate.decisionLog(), DECISION_LOG_ADDRESS),
  true,
  "PolicyGate DecisionLog wiring mismatch",
);
assert.equal(
  await decisionLog.authorizedWriters(POLICY_GATE_ADDRESS),
  true,
  "PolicyGate is not an authorized DecisionLog writer",
);

const passCertificate = await loadCertificate("../data/demo/usdy-pass-certificate.json");
const indeterminateCertificate = await loadCertificate(
  "../data/demo/usdy-indeterminate-certificate.json",
);
assert.equal(passCertificate.human.result, "PASS", "PASS fixture has the wrong human result");
assert.equal(passCertificate.solidity.result, 1, "PASS fixture must map to result 1");
assert.equal(
  indeterminateCertificate.human.result,
  "INDETERMINATE",
  "INDETERMINATE fixture has the wrong human result",
);
assert.equal(
  indeterminateCertificate.solidity.result,
  0,
  "INDETERMINATE fixture must map to result 0",
);

const latestBlock = await ethers.provider.getBlock("latest");
assert.notEqual(latestBlock, null, "Could not read the latest X Layer block");
for (const fixture of [passCertificate, indeterminateCertificate]) {
  assert.ok(
    BigInt(fixture.solidity.validUntil) >= BigInt(latestBlock!.timestamp),
    `${fixture.human.result} fixture is expired; run python scripts/export_demo_certificate.py again`,
  );
}

console.log("ProofLayer X Layer end-to-end demo");
console.log(`Chain ID: ${connectedNetwork.chainId}`);
console.log(`Deployer/actor: ${deployer.address}`);
console.log(`Registry: ${REGISTRY_ADDRESS}`);
console.log(`DecisionLog: ${DECISION_LOG_ADDRESS}`);
console.log(`PolicyGate: ${POLICY_GATE_ADDRESS}`);

const passExists = await registry.certificateExists(passCertificate.solidity.certificateId);
const indeterminateExists = await registry.certificateExists(
  indeterminateCertificate.solidity.certificateId,
);
if ((!passExists || !indeterminateExists) && !(await registry.authorizedIssuers(deployer.address))) {
  const registryOwner = await registry.owner();
  assert.equal(
    sameHex(registryOwner, deployer.address),
    true,
    `Deployer is not an authorized issuer and registry owner is ${registryOwner}`,
  );
  const authorizationTransaction = await registry.setIssuerAuthorization(deployer.address, true);
  const authorizationReceipt = await authorizationTransaction.wait();
  assert.equal(authorizationReceipt?.status, 1, "Issuer authorization transaction failed");
  console.log(`Issuer authorization transaction: ${authorizationTransaction.hash}`);
}

function assertStoredCertificate(
  label: string,
  stored: Awaited<ReturnType<typeof registry.getCertificate>>,
  expected: DemoCertificate["solidity"],
): void {
  assert.equal(sameHex(stored.certificateId, expected.certificateId), true, `${label} certificateId mismatch`);
  assert.equal(sameHex(stored.assetId, expected.assetId), true, `${label} assetId mismatch`);
  assert.equal(sameHex(stored.claimType, expected.claimType), true, `${label} claimType mismatch`);
  assert.equal(sameHex(stored.policyId, expected.policyId), true, `${label} policyId mismatch`);
  assert.equal(sameHex(stored.evidenceRoot, expected.evidenceRoot), true, `${label} evidenceRoot mismatch`);
  assert.equal(stored.observedAt, BigInt(expected.observedAt), `${label} observedAt mismatch`);
  assert.equal(stored.validUntil, BigInt(expected.validUntil), `${label} validUntil mismatch`);
  assert.equal(
    stored.independentRootCount,
    BigInt(expected.independentRootCount),
    `${label} independentRootCount mismatch`,
  );
  assert.equal(stored.result, BigInt(expected.result), `${label} result mismatch`);
  assert.equal(stored.revoked, false, `${label} certificate is revoked`);
}

function storedCertificateForPrint(
  stored: Awaited<ReturnType<typeof registry.getCertificate>>,
): Record<string, unknown> {
  return {
    certificateId: stored.certificateId,
    assetId: stored.assetId,
    claimType: stored.claimType,
    policyId: stored.policyId,
    evidenceRoot: stored.evidenceRoot,
    observedAt: stored.observedAt,
    validUntil: stored.validUntil,
    independentRootCount: stored.independentRootCount,
    result: stored.result,
    issuer: stored.issuer,
    revoked: stored.revoked,
  };
}

async function ensureRegistered(label: string, fixture: DemoCertificate): Promise<void> {
  const expected = fixture.solidity;
  if (await registry.certificateExists(expected.certificateId)) {
    const stored = await registry.getCertificate(expected.certificateId);
    assertStoredCertificate(label, stored, expected);
    console.log(`\n${label} registration: already present and matches expected data`);
    console.log(`Stored ${label} certificate:\n${printable(storedCertificateForPrint(stored))}`);
    return;
  }

  const transaction = await registry.registerCertificate(
    expected.certificateId,
    expected.assetId,
    expected.claimType,
    expected.policyId,
    expected.evidenceRoot,
    expected.observedAt,
    expected.validUntil,
    expected.independentRootCount,
    expected.result,
  );
  const receipt = await transaction.wait();
  assert.equal(receipt?.status, 1, `${label} registration transaction failed`);
  console.log(`\n${label} registration transaction: ${transaction.hash}`);

  const stored = await registry.getCertificate(expected.certificateId);
  assertStoredCertificate(label, stored, expected);
  console.log(`Stored ${label} certificate:\n${printable(storedCertificateForPrint(stored))}`);
}

async function findPreviousPassDecision(): Promise<{
  decisionId: string;
  executionNumber: bigint;
} | null> {
  const executionCount = await policyGate.executedActionCount();
  for (let executionNumber = 1n; executionNumber <= executionCount; executionNumber += 1n) {
    const decisionId = await policyGate.computeDecisionId(
      executionNumber,
      passCertificate.solidity.certificateId,
      deployer.address,
      actionType,
    );
    if (await decisionLog.decisionExists(decisionId)) {
      return { decisionId, executionNumber };
    }
  }
  return null;
}

await ensureRegistered("PASS", passCertificate);
assert.equal(
  await registry.isCertificateUsable(passCertificate.solidity.certificateId),
  true,
  "PASS certificate is not usable",
);
console.log("PASS isCertificateUsable: true");

let passDecision = await findPreviousPassDecision();
if (passDecision === null) {
  const actionCountBefore = await policyGate.executedActionCount();
  const transaction = await policyGate.executeVerifiedAction(
    passCertificate.solidity.certificateId,
    passCertificate.solidity.assetId,
    passCertificate.solidity.claimType,
    passCertificate.solidity.policyId,
    actionType,
  );
  const receipt = await transaction.wait();
  assert.equal(receipt?.status, 1, "PASS protected action transaction failed");
  assert.equal(
    await policyGate.executedActionCount(),
    actionCountBefore + 1n,
    "PASS protected action did not increment the counter",
  );
  const events = await policyGate.queryFilter(
    policyGate.filters.VerifiedActionExecuted(passCertificate.solidity.certificateId),
    receipt!.blockNumber,
    receipt!.blockNumber,
  );
  const actionEvent = events.find((event) => event.transactionHash === transaction.hash);
  assert.notEqual(actionEvent, undefined, "PASS action event was not found in its receipt block");
  passDecision = {
    decisionId: actionEvent!.args.decisionId,
    executionNumber: actionEvent!.args.executionNumber,
  };
  console.log(`PASS protected-action transaction: ${transaction.hash}`);
} else {
  console.log(
    `PASS protected action: previously executed at sequence ${passDecision.executionNumber}; skipping rerun`,
  );
}

const storedDecision = await decisionLog.getDecision(passDecision.decisionId);
assert.equal(
  sameHex(storedDecision.certificateId, passCertificate.solidity.certificateId),
  true,
  "Decision certificateId mismatch",
);
assert.equal(sameHex(storedDecision.actionType, actionType), true, "Decision actionType mismatch");
assert.equal(storedDecision.allowed, true, "PASS decision was not allowed");
console.log(`PASS decision ID: ${passDecision.decisionId}`);
console.log(
  `Stored PASS decision:\n${printable({
    decisionId: storedDecision.decisionId,
    certificateId: storedDecision.certificateId,
    actor: storedDecision.actor,
    actionType: storedDecision.actionType,
    allowed: storedDecision.allowed,
    timestamp: storedDecision.timestamp,
  })}`,
);

await ensureRegistered("INDETERMINATE", indeterminateCertificate);
assert.equal(
  await registry.isCertificateUsable(indeterminateCertificate.solidity.certificateId),
  false,
  "INDETERMINATE certificate unexpectedly became usable",
);
console.log("INDETERMINATE isCertificateUsable: false");

function collectRevertData(
  value: unknown,
  candidates: Set<string>,
  seen: Set<object>,
  depth = 0,
): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (ethers.isHexString(value) && value.length >= 10) candidates.add(value);
    for (const match of value.match(/0x[0-9a-fA-F]{8,}/g) ?? []) {
      if (match.length % 2 === 0) candidates.add(match);
    }
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;

  seen.add(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    try {
      collectRevertData((value as Record<string, unknown>)[key], candidates, seen, depth + 1);
    } catch {
      // Some provider error objects expose throwing property getters.
    }
  }
}

function revertName(error: unknown): string | null {
  try {
    if (typeof error === "object" && error !== null) {
      const revert = (error as { revert?: { name?: unknown } }).revert;
      if (typeof revert?.name === "string") return revert.name;
    }

    const candidates = new Set<string>();
    collectRevertData(error, candidates, new Set<object>());
    for (const data of candidates) {
      try {
        const parsed = policyGate.interface.parseError(data);
        if (parsed !== null) return parsed.name;
      } catch {
        // The candidate may be transaction calldata rather than revert data.
      }
    }
  } catch {
    // Revert decoding is best-effort and must not replace the state proof.
  }
  return null;
}

const actionCountBeforeRejection = await policyGate.executedActionCount();
const decisionCountBeforeRejection = await decisionLog.decisionCount();
const rejectedDecisionId = await policyGate.computeDecisionId(
  actionCountBeforeRejection + 1n,
  indeterminateCertificate.solidity.certificateId,
  deployer.address,
  actionType,
);
assert.equal(
  await decisionLog.decisionExists(rejectedDecisionId),
  false,
  "Prospective INDETERMINATE decision ID already exists before the rejection attempt",
);

let decodedRevert: string | null = null;
let staticRejectionConfirmed = false;
try {
  await policyGate.executeVerifiedAction.staticCall(
    indeterminateCertificate.solidity.certificateId,
    indeterminateCertificate.solidity.assetId,
    indeterminateCertificate.solidity.claimType,
    indeterminateCertificate.solidity.policyId,
    actionType,
  );
} catch (error) {
  staticRejectionConfirmed = true;
  decodedRevert = revertName(error);
  if (decodedRevert !== null) {
    assert.equal(decodedRevert, "CertificateNotUsable", "Unexpected decoded rejection reason");
  } else {
    console.log("Static call rejected; provider did not expose decodable revert metadata.");
  }
}
assert.equal(staticRejectionConfirmed, true, "INDETERMINATE static call unexpectedly succeeded");

let rejected = false;
let actionSucceeded = false;
try {
  const transaction = await policyGate.executeVerifiedAction(
    indeterminateCertificate.solidity.certificateId,
    indeterminateCertificate.solidity.assetId,
    indeterminateCertificate.solidity.claimType,
    indeterminateCertificate.solidity.policyId,
    actionType,
  );
  const receipt = await transaction.wait();
  rejected = receipt?.status === 0;
  actionSucceeded = receipt?.status === 1;
} catch (error) {
  const transactionRevert = revertName(error);
  if (transactionRevert !== null) {
    assert.equal(transactionRevert, "CertificateNotUsable", "Unexpected decoded rejection reason");
    decodedRevert = transactionRevert;
  }
  rejected = true;
}
assert.equal(actionSucceeded, false, "INDETERMINATE protected action unexpectedly succeeded");
assert.equal(rejected, true, "INDETERMINATE protected action unexpectedly succeeded");
const actionCountAfterRejection = await policyGate.executedActionCount();
assert.equal(
  actionCountAfterRejection,
  actionCountBeforeRejection,
  "Rejected action changed the protected-action counter",
);
assert.equal(
  await decisionLog.decisionCount(),
  decisionCountBeforeRejection,
  "Rejected action changed the DecisionLog count",
);
assert.equal(
  await decisionLog.decisionExists(rejectedDecisionId),
  false,
  "Rejected INDETERMINATE action created a successful DecisionLog record",
);

console.log("INDETERMINATE protected action: REJECTED AS EXPECTED");
if (decodedRevert !== null) {
  console.log(`Decoded revert: ${decodedRevert}`);
} else {
  console.log(
    "Provider did not expose decodable revert metadata; unchanged on-chain state confirms rejection.",
  );
}
console.log(`Protected-action counter unchanged: ${actionCountAfterRejection}`);
console.log(`DecisionLog count unchanged: ${decisionCountBeforeRejection}`);
console.log(`Rejected decision ID absent: ${rejectedDecisionId}`);
console.log("\nProofLayer end-to-end demo completed successfully");
