import assert from "node:assert/strict";
import { network } from "hardhat";

const XLAYER_TESTNET_CHAIN_ID = 1952n;
const REGISTRY_ADDRESS = "0xC24A1Aa861aA4ca5D15CEC055223EBACd0940935";

type CertificateInput = {
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

type IssuanceResult = {
  success: boolean;
  certificateId: string | null;
  transactionHash: string | null;
  blockNumber: number | null;
  readBack: {
    matches: boolean;
    registered: boolean;
    usable: boolean;
  } | null;
  error: string | null;
  errorCode: string | null;
};

function sameHex(actual: string, expected: string): boolean {
  return actual.toLowerCase() === expected.toLowerCase();
}

function validateBytes32(value: string, fieldName: string): void {
  assert.equal(
    typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value),
    true,
    `${fieldName} must be a 0x-prefixed bytes32 hex string`,
  );
}

function validateInteger(value: number, fieldName: string, min: number, max: number): void {
  assert.equal(
    typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max,
    true,
    `${fieldName} must be a safe integer between ${min} and ${max}`,
  );
}

function validateInput(input: unknown): CertificateInput {
  assert.equal(typeof input === "object" && input !== null, true, "Input must be a JSON object");
  const cert = input as Record<string, unknown>;

  const bytes32Fields = ["certificateId", "assetId", "claimType", "policyId", "evidenceRoot"] as const;
  for (const field of bytes32Fields) {
    validateBytes32(cert[field] as string, field);
  }

  validateInteger(cert.observedAt as number, "observedAt", 0, Number.MAX_SAFE_INTEGER);
  validateInteger(cert.validUntil as number, "validUntil", 0, Number.MAX_SAFE_INTEGER);
  validateInteger(cert.independentRootCount as number, "independentRootCount", 0, 4294967295);
  validateInteger(cert.result as number, "result", 0, 2);

  assert.equal((cert.result as number) === 1, true, "result must be 1 (PASS)");

  return cert as unknown as CertificateInput;
}

function errorResult(
  error: string,
  errorCode: string,
  identity: Partial<Pick<IssuanceResult, "certificateId" | "transactionHash" | "blockNumber" | "readBack">> = {},
): IssuanceResult {
  return {
    success: false,
    certificateId: identity.certificateId ?? null,
    transactionHash: identity.transactionHash ?? null,
    blockNumber: identity.blockNumber ?? null,
    readBack: identity.readBack ?? null,
    error,
    errorCode,
  };
}

type StoredCertificate = {
  certificateId: string;
  assetId: string;
  claimType: string;
  policyId: string;
  evidenceRoot: string;
  observedAt: bigint;
  validUntil: bigint;
  independentRootCount: bigint;
  result: bigint;
};

function successResult(
  certificateId: string,
  transactionHash: string,
  blockNumber: number,
  readBack: { matches: boolean; registered: boolean; usable: boolean },
): IssuanceResult {
  return {
    success: true,
    certificateId,
    transactionHash,
    blockNumber,
    readBack,
    error: null,
    errorCode: null,
  };
}

function storedMatches(stored: StoredCertificate, certificate: CertificateInput): boolean {
  return (
    sameHex(stored.certificateId, certificate.certificateId) &&
    sameHex(stored.assetId, certificate.assetId) &&
    sameHex(stored.claimType, certificate.claimType) &&
    sameHex(stored.policyId, certificate.policyId) &&
    sameHex(stored.evidenceRoot, certificate.evidenceRoot) &&
    stored.observedAt === BigInt(certificate.observedAt) &&
    stored.validUntil === BigInt(certificate.validUntil) &&
    stored.independentRootCount === BigInt(certificate.independentRootCount) &&
    stored.result === BigInt(certificate.result)
  );
}

async function main(): Promise<void> {
  let input: unknown;

  const stdinChunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    stdinChunks.push(chunk);
  }
  const rawInput = Buffer.concat(stdinChunks).toString("utf8").trim();

  if (!rawInput) {
    const result = errorResult("No input provided via stdin", "INVALID_INPUT");
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
    return;
  }

  try {
    input = JSON.parse(rawInput);
  } catch {
    const result = errorResult("Invalid JSON input", "INVALID_INPUT");
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
    return;
  }

  let certificate: CertificateInput;
  try {
    certificate = validateInput(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = errorResult(`Validation failed: ${message}`, "INVALID_CERTIFICATE");
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
    return;
  }

  const { ethers } = await network.create();
  const connectedNetwork = await ethers.provider.getNetwork();

  if (connectedNetwork.chainId !== XLAYER_TESTNET_CHAIN_ID) {
    const result = errorResult(
      `Wrong network: expected chain ID ${XLAYER_TESTNET_CHAIN_ID}, got ${connectedNetwork.chainId}`,
      "CHAIN_MISMATCH",
    );
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
    return;
  }

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("ProofLayerCertificateRegistry", REGISTRY_ADDRESS, signer);

  const registryCode = await ethers.provider.getCode(REGISTRY_ADDRESS);
  assert.notEqual(registryCode, "0x", "Registry has no deployed bytecode at the configured address");

  const alreadyExists = await registry.certificateExists(certificate.certificateId);
  if (alreadyExists) {
    const stored = await registry.getCertificate(certificate.certificateId);
    // The duplicate path still verifies the stored certificate field by
    // field; a same-ID certificate with different data is treated as a
    // read-back failure, never as a success.
    if (!storedMatches(stored, certificate)) {
      const result = errorResult(
        "Read-back verification failed: existing certificate does not match input",
        "READBACK_MISMATCH",
        { certificateId: certificate.certificateId },
      );
      process.stdout.write(JSON.stringify(result));
      process.exit(1);
      return;
    }
    const readBack = {
      matches: true,
      registered: true,
      usable: await registry.isCertificateUsable(certificate.certificateId),
    };
    const result = successResult(
      certificate.certificateId,
      "ALREADY_REGISTERED",
      await ethers.provider.getBlockNumber(),
      readBack,
    );
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
    return;
  }

  let transactionHash: string | null = null;
  let blockNumber: number | null = null;

  try {
    const transaction = await registry.registerCertificate(
      certificate.certificateId,
      certificate.assetId,
      certificate.claimType,
      certificate.policyId,
      certificate.evidenceRoot,
      certificate.observedAt,
      certificate.validUntil,
      certificate.independentRootCount,
      certificate.result,
    );
    // Retain the public transaction identity as soon as submission succeeds.
    // If confirmation/read-back later fails, callers must treat the outcome as
    // unknown and reconcile this hash instead of issuing under a fresh key.
    transactionHash = transaction.hash;
    const receipt = await transaction.wait();
    if (receipt) blockNumber = receipt.blockNumber;
    assert.equal(receipt?.status, 1, "Transaction reverted");
  } catch {
    const result = errorResult(
      transactionHash !== null
        ? "Transaction was submitted but final state could not be confirmed"
        : "Transaction submission was attempted but its final state is unknown",
      "TRANSACTION_STATE_UNKNOWN",
      {
        certificateId: certificate.certificateId,
        transactionHash,
        blockNumber,
      },
    );
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
    return;
  }

  let stored: StoredCertificate;
  let usable: boolean;
  try {
    stored = await registry.getCertificate(certificate.certificateId);
    usable = await registry.isCertificateUsable(certificate.certificateId);
  } catch {
    const result = errorResult(
      "Transaction was confirmed but post-submit read-back was unavailable",
      "TRANSACTION_STATE_UNKNOWN",
      {
        certificateId: certificate.certificateId,
        transactionHash,
        blockNumber,
      },
    );
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
    return;
  }
  const matches = storedMatches(stored, certificate);

  if (!matches) {
    const result = errorResult(
      "Transaction was confirmed but the stored certificate did not match input",
      "POST_SUBMIT_VERIFICATION_FAILED",
      {
        certificateId: certificate.certificateId,
        transactionHash,
        blockNumber,
        readBack: { matches: false, registered: true, usable },
      },
    );
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
    return;
  }

  const readBack = {
    matches: true,
    registered: true,
    usable,
  };

  if (transactionHash === null || blockNumber === null) {
    const result = errorResult(
      "Transaction completed without a complete public transaction identity",
      "TRANSACTION_STATE_UNKNOWN",
      {
        certificateId: certificate.certificateId,
        transactionHash,
        blockNumber,
        readBack,
      },
    );
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
    return;
  }

  const success = successResult(certificate.certificateId, transactionHash, blockNumber, readBack);
  process.stdout.write(JSON.stringify(success));
}

main().catch(() => {
  const result = errorResult(
    "Unexpected issuance process failure; transaction state may be unknown",
    "TRANSACTION_STATE_UNKNOWN",
  );
  process.stdout.write(JSON.stringify(result));
  process.exit(1);
});
