import { expect } from "chai";
import { network } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import type { ProofLayerCertificateRegistry } from "../types/ethers-contracts/index.js";

const { ethers, networkHelpers } = await network.create();

const CERTIFICATE_ID = ethers.id("prooflayer:certificate:policy-gate-test");
const ASSET_ID = ethers.id("USDY");
const CLAIM_TYPE = ethers.id("TreasuryBacking");
const POLICY_ID = ethers.id("prooflayer:policy:treasury-backing:v1");
const EVIDENCE_ROOT = ethers.id("prooflayer:evidence:policy-gate-test");
const ACTION_TYPE = ethers.id("EXECUTE_VERIFIED_ACTION");

describe("ProofLayerPolicyGate", function () {
  async function deployPolicyGateFixture() {
    const [owner, issuer, actor] = await ethers.getSigners();
    const registry = await ethers.deployContract("ProofLayerCertificateRegistry");
    const decisionLog = await ethers.deployContract("ProofLayerDecisionLog");
    const gate = await ethers.deployContract("ProofLayerPolicyGate", [
      await registry.getAddress(),
      await decisionLog.getAddress(),
    ]);
    await registry.setIssuerAuthorization(issuer.address, true);
    await decisionLog.setWriterAuthorization(await gate.getAddress(), true);

    return { registry, decisionLog, gate, owner, issuer, actor };
  }

  async function registerCertificate(
    registry: ProofLayerCertificateRegistry,
    issuer: HardhatEthersSigner,
    options: { certificateId?: string; result?: bigint; validUntil?: bigint } = {},
  ) {
    const now = BigInt(await networkHelpers.time.latest());
    const certificateId = options.certificateId ?? CERTIFICATE_ID;
    await registry.connect(issuer).registerCertificate(
      certificateId,
      ASSET_ID,
      CLAIM_TYPE,
      POLICY_ID,
      EVIDENCE_ROOT,
      now,
      options.validUntil ?? now + 3_600n,
      2n,
      options.result ?? 1n,
    );
    return certificateId;
  }

  it("permits an action with a usable PASS certificate", async function () {
    const { registry, gate, issuer, actor } = await networkHelpers.loadFixture(deployPolicyGateFixture);
    await registerCertificate(registry, issuer);

    expect(await gate.validateAction(CERTIFICATE_ID, ASSET_ID, CLAIM_TYPE, POLICY_ID)).to.equal(true);
    await expect(
      gate.connect(actor).executeVerifiedAction(CERTIFICATE_ID, ASSET_ID, CLAIM_TYPE, POLICY_ID, ACTION_TYPE),
    ).not.to.revert(ethers);
  });

  it("blocks an action with a FAIL certificate", async function () {
    const { registry, gate, issuer, actor } = await networkHelpers.loadFixture(deployPolicyGateFixture);
    await registerCertificate(registry, issuer, { result: 2n });

    await expect(
      gate.connect(actor).executeVerifiedAction(CERTIFICATE_ID, ASSET_ID, CLAIM_TYPE, POLICY_ID, ACTION_TYPE),
    )
      .to.be.revertedWithCustomError(gate, "CertificateNotUsable")
      .withArgs(CERTIFICATE_ID);
  });

  it("blocks an action with an INDETERMINATE certificate", async function () {
    const { registry, gate, issuer, actor } = await networkHelpers.loadFixture(deployPolicyGateFixture);
    await registerCertificate(registry, issuer, { result: 0n });

    await expect(
      gate.connect(actor).executeVerifiedAction(CERTIFICATE_ID, ASSET_ID, CLAIM_TYPE, POLICY_ID, ACTION_TYPE),
    )
      .to.be.revertedWithCustomError(gate, "CertificateNotUsable")
      .withArgs(CERTIFICATE_ID);
  });

  it("blocks an action with an expired certificate", async function () {
    const { registry, gate, issuer, actor } = await networkHelpers.loadFixture(deployPolicyGateFixture);
    const now = BigInt(await networkHelpers.time.latest());
    const validUntil = now + 10n;
    await registerCertificate(registry, issuer, { validUntil });
    await networkHelpers.time.increaseTo(validUntil + 1n);

    await expect(
      gate.connect(actor).executeVerifiedAction(CERTIFICATE_ID, ASSET_ID, CLAIM_TYPE, POLICY_ID, ACTION_TYPE),
    )
      .to.be.revertedWithCustomError(gate, "CertificateNotUsable")
      .withArgs(CERTIFICATE_ID);
  });

  it("blocks an action with a revoked certificate", async function () {
    const { registry, gate, issuer, actor } = await networkHelpers.loadFixture(deployPolicyGateFixture);
    await registerCertificate(registry, issuer);
    await registry.connect(issuer).revokeCertificate(CERTIFICATE_ID);

    await expect(
      gate.connect(actor).executeVerifiedAction(CERTIFICATE_ID, ASSET_ID, CLAIM_TYPE, POLICY_ID, ACTION_TYPE),
    )
      .to.be.revertedWithCustomError(gate, "CertificateNotUsable")
      .withArgs(CERTIFICATE_ID);
  });

  it("blocks an action when the asset ID does not match", async function () {
    const { registry, gate, issuer, actor } = await networkHelpers.loadFixture(deployPolicyGateFixture);
    await registerCertificate(registry, issuer);
    const otherAssetId = ethers.id("PAXG");

    await expect(
      gate.connect(actor).executeVerifiedAction(
        CERTIFICATE_ID,
        otherAssetId,
        CLAIM_TYPE,
        POLICY_ID,
        ACTION_TYPE,
      ),
    )
      .to.be.revertedWithCustomError(gate, "AssetMismatch")
      .withArgs(otherAssetId, ASSET_ID);
  });

  it("blocks an action when the claim type does not match", async function () {
    const { registry, gate, issuer, actor } = await networkHelpers.loadFixture(deployPolicyGateFixture);
    await registerCertificate(registry, issuer);
    const otherClaimType = ethers.id("GoldBacking");

    await expect(
      gate.connect(actor).executeVerifiedAction(
        CERTIFICATE_ID,
        ASSET_ID,
        otherClaimType,
        POLICY_ID,
        ACTION_TYPE,
      ),
    )
      .to.be.revertedWithCustomError(gate, "ClaimTypeMismatch")
      .withArgs(otherClaimType, CLAIM_TYPE);
  });

  it("blocks an action when the policy ID does not match", async function () {
    const { registry, gate, issuer, actor } = await networkHelpers.loadFixture(deployPolicyGateFixture);
    await registerCertificate(registry, issuer);
    const otherPolicyId = ethers.id("prooflayer:policy:other:v1");

    await expect(
      gate.connect(actor).executeVerifiedAction(
        CERTIFICATE_ID,
        ASSET_ID,
        CLAIM_TYPE,
        otherPolicyId,
        ACTION_TYPE,
      ),
    )
      .to.be.revertedWithCustomError(gate, "PolicyMismatch")
      .withArgs(otherPolicyId, POLICY_ID);
  });

  it("emits an event and increments the counter after a successful action", async function () {
    const { registry, gate, issuer, actor } = await networkHelpers.loadFixture(deployPolicyGateFixture);
    await registerCertificate(registry, issuer);
    const decisionId = await gate.computeDecisionId(1n, CERTIFICATE_ID, actor.address, ACTION_TYPE);

    await expect(
      gate.connect(actor).executeVerifiedAction(CERTIFICATE_ID, ASSET_ID, CLAIM_TYPE, POLICY_ID, ACTION_TYPE),
    )
      .to.emit(gate, "VerifiedActionExecuted")
      .withArgs(CERTIFICATE_ID, decisionId, actor.address, ACTION_TYPE, 1n);
    expect(await gate.executedActionCount()).to.equal(1n);
  });

  it("runs the USDY TreasuryBacking PASS flow and rejects the INDETERMINATE flow end to end", async function () {
    const { registry, decisionLog, gate, issuer, actor } =
      await networkHelpers.loadFixture(deployPolicyGateFixture);
    const passCertificateId = ethers.id("prooflayer:usdy:treasury-backing:pass");
    const indeterminateCertificateId = ethers.id("prooflayer:usdy:treasury-backing:indeterminate");
    await registerCertificate(registry, issuer, { certificateId: passCertificateId, result: 1n });
    await registerCertificate(registry, issuer, { certificateId: indeterminateCertificateId, result: 0n });

    const expectedDecisionId = await gate.computeDecisionId(1n, passCertificateId, actor.address, ACTION_TYPE);
    await gate
      .connect(actor)
      .executeVerifiedAction(passCertificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID, ACTION_TYPE);

    const decision = await decisionLog.getDecision(expectedDecisionId);
    expect(decision.certificateId).to.equal(passCertificateId);
    expect(decision.actor).to.equal(actor.address);
    expect(decision.actionType).to.equal(ACTION_TYPE);
    expect(decision.allowed).to.equal(true);

    await expect(
      gate
        .connect(actor)
        .executeVerifiedAction(indeterminateCertificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID, ACTION_TYPE),
    )
      .to.be.revertedWithCustomError(gate, "CertificateNotUsable")
      .withArgs(indeterminateCertificateId);
    expect(await decisionLog.decisionCount()).to.equal(1n);
    expect(await gate.executedActionCount()).to.equal(1n);
  });
});
