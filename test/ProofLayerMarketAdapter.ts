import { expect } from "chai";
import { network } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";

const { ethers, networkHelpers } = await network.create();

const ASSET_ID = ethers.id("USDY");
const CLAIM_TYPE = ethers.id("TreasuryBacking");
const POLICY_ID = ethers.id("prooflayer:policy:treasury-backing:v1");
const EVIDENCE_ROOT = ethers.id("prooflayer:evidence:market-test");
const ACTION_TYPE = ethers.id("MARKET_WITHDRAW");

describe("ProofLayerMarketAdapter", function () {
  async function deployMarketFixture() {
    const [owner, issuer, alice, bob] = await ethers.getSigners();
    const registry = await ethers.deployContract("ProofLayerCertificateRegistry");
    const decisionLog = await ethers.deployContract("ProofLayerDecisionLog");
    const gate = await ethers.deployContract("ProofLayerPolicyGate", [
      await registry.getAddress(),
      await decisionLog.getAddress(),
    ]);
    await registry.setIssuerAuthorization(issuer.address, true);
    await decisionLog.setWriterAuthorization(await gate.getAddress(), true);
    const market = await ethers.deployContract("ProofLayerMarketAdapter", [await gate.getAddress()]);

    return { registry, decisionLog, gate, market, owner, issuer, alice, bob };
  }

  async function registerPassCertificate(
    registry: Awaited<ReturnType<typeof deployMarketFixture>>["registry"],
    issuer: HardhatEthersSigner,
    certificateId: string,
  ) {
    const now = BigInt(await networkHelpers.time.latest());
    await registry.connect(issuer).registerCertificate(
      certificateId,
      ASSET_ID,
      CLAIM_TYPE,
      POLICY_ID,
      EVIDENCE_ROOT,
      now,
      now + 3_600n,
      2n,
      1n, // PASS
    );
  }

  async function registerFailCertificate(
    registry: Awaited<ReturnType<typeof deployMarketFixture>>["registry"],
    issuer: HardhatEthersSigner,
    certificateId: string,
  ) {
    const now = BigInt(await networkHelpers.time.latest());
    await registry.connect(issuer).registerCertificate(
      certificateId,
      ASSET_ID,
      CLAIM_TYPE,
      POLICY_ID,
      EVIDENCE_ROOT,
      now,
      now + 3_600n,
      2n,
      2n, // FAIL
    );
  }

  async function registerExpiredCertificate(
    registry: Awaited<ReturnType<typeof deployMarketFixture>>["registry"],
    issuer: HardhatEthersSigner,
    certificateId: string,
  ) {
    const now = BigInt(await networkHelpers.time.latest());
    await registry.connect(issuer).registerCertificate(
      certificateId,
      ASSET_ID,
      CLAIM_TYPE,
      POLICY_ID,
      EVIDENCE_ROOT,
      now,
      now + 10n, // expires soon
      2n,
      1n, // PASS but will expire
    );
  }

  it("allows unrestricted deposit", async function () {
    const { market, alice } = await networkHelpers.loadFixture(deployMarketFixture);
    const depositAmount = ethers.parseEther("1.0");

    await expect(market.connect(alice).deposit({ value: depositAmount }))
      .to.emit(market, "Deposited")
      .withArgs(alice.address, depositAmount);

    expect(await market.balances(alice.address)).to.equal(depositAmount);
    expect(await market.poolBalance()).to.equal(depositAmount);
  });

  it("allows withdrawal with a valid PASS certificate", async function () {
    const { registry, market, issuer, alice } = await networkHelpers.loadFixture(deployMarketFixture);
    const certificateId = ethers.id("prooflayer:market:pass:1");
    await registerPassCertificate(registry, issuer, certificateId);

    const depositAmount = ethers.parseEther("2.0");
    await market.connect(alice).deposit({ value: depositAmount });

    const withdrawAmount = ethers.parseEther("1.0");
    await expect(
      market.connect(alice).withdraw(withdrawAmount, certificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID),
    ).to.emit(market, "Withdrawn");

    expect(await market.balances(alice.address)).to.equal(depositAmount - withdrawAmount);
  });

  it("blocks withdrawal with a FAIL certificate", async function () {
    const { registry, gate, market, issuer, alice } = await networkHelpers.loadFixture(deployMarketFixture);
    const certificateId = ethers.id("prooflayer:market:fail:1");
    await registerFailCertificate(registry, issuer, certificateId);

    await market.connect(alice).deposit({ value: ethers.parseEther("1.0") });

    await expect(
      market.connect(alice).withdraw(ethers.parseEther("0.5"), certificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID),
    )
      .to.be.revertedWithCustomError(gate, "CertificateNotUsable")
      .withArgs(certificateId);
  });

  it("blocks withdrawal with an expired certificate", async function () {
    const { registry, gate, market, issuer, alice } = await networkHelpers.loadFixture(deployMarketFixture);
    const certificateId = ethers.id("prooflayer:market:expired:1");
    await registerExpiredCertificate(registry, issuer, certificateId);

    await market.connect(alice).deposit({ value: ethers.parseEther("1.0") });

    const validUntil = (await registry.getCertificate(certificateId)).validUntil;
    await networkHelpers.time.increaseTo(Number(validUntil) + 1);

    await expect(
      market.connect(alice).withdraw(ethers.parseEther("0.5"), certificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID),
    )
      .to.be.revertedWithCustomError(gate, "CertificateNotUsable")
      .withArgs(certificateId);
  });

  it("blocks withdrawal with no deposit balance", async function () {
    const { registry, market, issuer, alice } = await networkHelpers.loadFixture(deployMarketFixture);
    const certificateId = ethers.id("prooflayer:market:nobalance:1");
    await registerPassCertificate(registry, issuer, certificateId);

    await expect(
      market.connect(alice).withdraw(ethers.parseEther("0.5"), certificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID),
    ).to.be.revertedWithCustomError(market, "InsufficientBalance");
  });

  it("blocks withdrawal when amount exceeds deposit", async function () {
    const { registry, market, issuer, alice } = await networkHelpers.loadFixture(deployMarketFixture);
    const certificateId = ethers.id("prooflayer:market:overdraft:1");
    await registerPassCertificate(registry, issuer, certificateId);

    await market.connect(alice).deposit({ value: ethers.parseEther("0.5") });

    await expect(
      market.connect(alice).withdraw(ethers.parseEther("1.0"), certificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID),
    ).to.be.revertedWithCustomError(market, "InsufficientBalance");
  });

  it("validateCertificate returns true for a PASS certificate", async function () {
    const { registry, market, issuer } = await networkHelpers.loadFixture(deployMarketFixture);
    const certificateId = ethers.id("prooflayer:market:validate:1");
    await registerPassCertificate(registry, issuer, certificateId);

    expect(await market.validateCertificate(certificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID)).to.equal(true);
  });

  it("validateCertificate reverts with CertificateNotUsable for a FAIL certificate", async function () {
    const { registry, gate, market, issuer } = await networkHelpers.loadFixture(deployMarketFixture);
    const certificateId = ethers.id("prooflayer:market:validate-fail:1");
    await registerFailCertificate(registry, issuer, certificateId);

    await expect(market.validateCertificate(certificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID))
      .to.be.revertedWithCustomError(gate, "CertificateNotUsable")
      .withArgs(certificateId);
  });

  it("emits correct decisionId from withdrawal", async function () {
    const { registry, decisionLog, gate, market, issuer, alice } =
      await networkHelpers.loadFixture(deployMarketFixture);
    const certificateId = ethers.id("prooflayer:market:decision:1");
    await registerPassCertificate(registry, issuer, certificateId);

    await market.connect(alice).deposit({ value: ethers.parseEther("1.0") });

    const actionCount = await gate.executedActionCount();
    const expectedDecisionId = await gate.computeDecisionId(
      actionCount + 1n,
      certificateId,
      await market.getAddress(),
      ACTION_TYPE,
    );

    await expect(
      market.connect(alice).withdraw(ethers.parseEther("0.5"), certificateId, ASSET_ID, CLAIM_TYPE, POLICY_ID),
    )
      .to.emit(market, "Withdrawn")
      .withArgs(alice.address, ethers.parseEther("0.5"), expectedDecisionId);
  });

  it("multiple deposits accumulate correctly", async function () {
    const { market, alice } = await networkHelpers.loadFixture(deployMarketFixture);

    await market.connect(alice).deposit({ value: ethers.parseEther("1.0") });
    await market.connect(alice).deposit({ value: ethers.parseEther("2.0") });

    expect(await market.balances(alice.address)).to.equal(ethers.parseEther("3.0"));
    expect(await market.poolBalance()).to.equal(ethers.parseEther("3.0"));
  });
});
