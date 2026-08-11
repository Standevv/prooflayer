import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const DECISION_ID = ethers.id("prooflayer:decision:unit-test");
const CERTIFICATE_ID = ethers.id("prooflayer:certificate:decision-log-test");
const ACTION_TYPE = ethers.id("EXECUTE_VERIFIED_ACTION");

describe("ProofLayerDecisionLog", function () {
  async function deployDecisionLogFixture() {
    const [owner, actor] = await ethers.getSigners();
    const decisionLog = await ethers.deployContract("ProofLayerDecisionLog");
    return { decisionLog, owner, actor };
  }

  it("stores a decision correctly and emits an event", async function () {
    const { decisionLog, actor } = await networkHelpers.loadFixture(deployDecisionLogFixture);

    await expect(
      decisionLog.recordDecision(DECISION_ID, CERTIFICATE_ID, actor.address, ACTION_TYPE, true),
    ).to.emit(decisionLog, "DecisionRecorded");

    const decision = await decisionLog.getDecision(DECISION_ID);
    expect(decision.decisionId).to.equal(DECISION_ID);
    expect(decision.certificateId).to.equal(CERTIFICATE_ID);
    expect(decision.actionType).to.equal(ACTION_TYPE);
    expect(decision.allowed).to.equal(true);
    expect(await decisionLog.decisionCount()).to.equal(1n);
  });

  it("rejects a duplicate decision ID", async function () {
    const { decisionLog, actor } = await networkHelpers.loadFixture(deployDecisionLogFixture);
    await decisionLog.recordDecision(DECISION_ID, CERTIFICATE_ID, actor.address, ACTION_TYPE, true);

    await expect(
      decisionLog.recordDecision(DECISION_ID, CERTIFICATE_ID, actor.address, ACTION_TYPE, false),
    )
      .to.be.revertedWithCustomError(decisionLog, "DecisionAlreadyExists")
      .withArgs(DECISION_ID);
  });

  it("records the supplied actor and the transaction block timestamp", async function () {
    const { decisionLog, actor } = await networkHelpers.loadFixture(deployDecisionLogFixture);
    const transaction = await decisionLog.recordDecision(
      DECISION_ID,
      CERTIFICATE_ID,
      actor.address,
      ACTION_TYPE,
      true,
    );
    const receipt = await transaction.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);

    const decision = await decisionLog.getDecision(DECISION_ID);
    expect(decision.actor).to.equal(actor.address);
    expect(decision.timestamp).to.equal(BigInt(block!.timestamp));
  });
});
