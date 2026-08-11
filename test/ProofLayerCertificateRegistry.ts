import { expect } from "chai";
import { network } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import type { ProofLayerCertificateRegistry } from "../types/ethers-contracts/index.js";

const { ethers, networkHelpers } = await network.create();

const CERTIFICATE_ID = ethers.id("prooflayer:certificate:registry-test");
const ASSET_ID = ethers.id("USDY");
const CLAIM_TYPE = ethers.id("TreasuryBacking");
const POLICY_ID = ethers.id("prooflayer:policy:treasury-backing:v1");
const EVIDENCE_ROOT = ethers.id("prooflayer:evidence:registry-test");

type CertificateOverrides = {
  certificateId?: string;
  observedAt?: bigint;
  validUntil?: bigint;
  result?: bigint;
};

describe("ProofLayerCertificateRegistry", function () {
  async function deployRegistryFixture() {
    const [owner, issuer, outsider] = await ethers.getSigners();
    const registry = await ethers.deployContract("ProofLayerCertificateRegistry");
    await registry.setIssuerAuthorization(issuer.address, true);
    return { registry, owner, issuer, outsider };
  }

  async function registerDefault(
    registry: ProofLayerCertificateRegistry,
    issuer: HardhatEthersSigner,
    overrides: CertificateOverrides = {},
  ) {
    const now = BigInt(await networkHelpers.time.latest());
    const observedAt = overrides.observedAt ?? now;
    const validUntil = overrides.validUntil ?? now + 3_600n;
    const certificateId = overrides.certificateId ?? CERTIFICATE_ID;
    const result = overrides.result ?? 1n;

    const transaction = registry.connect(issuer).registerCertificate(
      certificateId,
      ASSET_ID,
      CLAIM_TYPE,
      POLICY_ID,
      EVIDENCE_ROOT,
      observedAt,
      validUntil,
      2n,
      result,
    );

    return { transaction, certificateId, observedAt, validUntil };
  }

  it("allows an authorized issuer to register a PASS certificate and emits an event", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    const { transaction } = await registerDefault(registry, issuer);

    await expect(transaction).to.emit(registry, "CertificateRegistered");
    expect(await registry.isCertificateUsable(CERTIFICATE_ID)).to.equal(true);
  });

  it("rejects an unauthorized issuer", async function () {
    const { registry, outsider } = await networkHelpers.loadFixture(deployRegistryFixture);
    const now = BigInt(await networkHelpers.time.latest());

    await expect(
      registry.connect(outsider).registerCertificate(
        CERTIFICATE_ID,
        ASSET_ID,
        CLAIM_TYPE,
        POLICY_ID,
        EVIDENCE_ROOT,
        now,
        now + 3_600n,
        2n,
        1n,
      ),
    )
      .to.be.revertedWithCustomError(registry, "UnauthorizedIssuer")
      .withArgs(outsider.address);
  });

  it("rejects a duplicate certificate ID", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    await (await registerDefault(registry, issuer)).transaction;

    await expect((await registerDefault(registry, issuer)).transaction)
      .to.be.revertedWithCustomError(registry, "CertificateAlreadyExists")
      .withArgs(CERTIFICATE_ID);
  });

  it("rejects an invalid validity range", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    const now = BigInt(await networkHelpers.time.latest());

    await expect(
      (
        await registerDefault(registry, issuer, {
          observedAt: now,
          validUntil: now,
        })
      ).transaction,
    )
      .to.be.revertedWithCustomError(registry, "InvalidValidityRange")
      .withArgs(now, now);
  });

  it("reports a PASS certificate as usable before expiry", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    await (await registerDefault(registry, issuer, { result: 1n })).transaction;

    expect(await registry.isCertificateUsable(CERTIFICATE_ID)).to.equal(true);
  });

  it("does not report a FAIL certificate as usable", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    await (await registerDefault(registry, issuer, { result: 2n })).transaction;

    expect(await registry.isCertificateUsable(CERTIFICATE_ID)).to.equal(false);
  });

  it("does not treat an INDETERMINATE certificate as PASS", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    await (await registerDefault(registry, issuer, { result: 0n })).transaction;

    expect(await registry.isCertificateUsable(CERTIFICATE_ID)).to.equal(false);
  });

  it("does not report an expired certificate as usable", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    const now = BigInt(await networkHelpers.time.latest());
    const validUntil = now + 10n;
    await (await registerDefault(registry, issuer, { observedAt: now, validUntil })).transaction;
    await networkHelpers.time.increaseTo(validUntil + 1n);

    expect(await registry.isCertificateUsable(CERTIFICATE_ID)).to.equal(false);
  });

  it("does not report a revoked certificate as usable", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    await (await registerDefault(registry, issuer)).transaction;

    await expect(registry.connect(issuer).revokeCertificate(CERTIFICATE_ID))
      .to.emit(registry, "CertificateRevoked")
      .withArgs(CERTIFICATE_ID, issuer.address);
    expect(await registry.isCertificateUsable(CERTIFICATE_ID)).to.equal(false);
  });

  it("does not allow a revoked certificate to become usable again", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    await (await registerDefault(registry, issuer)).transaction;
    await registry.connect(issuer).revokeCertificate(CERTIFICATE_ID);

    await expect(registry.connect(issuer).revokeCertificate(CERTIFICATE_ID))
      .to.be.revertedWithCustomError(registry, "CertificateAlreadyRevoked")
      .withArgs(CERTIFICATE_ID);
    expect((await registry.getCertificate(CERTIFICATE_ID)).revoked).to.equal(true);
    expect(await registry.isCertificateUsable(CERTIFICATE_ID)).to.equal(false);
  });

  it("records the registering issuer from msg.sender", async function () {
    const { registry, issuer } = await networkHelpers.loadFixture(deployRegistryFixture);
    await (await registerDefault(registry, issuer)).transaction;

    const certificate = await registry.getCertificate(CERTIFICATE_ID);
    expect(certificate.issuer).to.equal(issuer.address);
  });
});
