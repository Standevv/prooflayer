import assert from "node:assert/strict";
import test from "node:test";

import { buildTruthPresentation } from "../lib/truth-presentation.ts";

test("expired historical PASS cannot become current RVC PASS", () => {
  const truth = buildTruthPresentation({
    currentVerification: null,
    historicalCertificateResult: "PASS",
    certificateStatus: "Expired",
    currentCertificateUsable: false,
  });

  assert.equal(truth.historicalCertificateResult, "PASS");
  assert.equal(truth.currentRvcResult, "UNAVAILABLE");
  assert.equal(truth.currentCertificateUsability, "EXPIRED / UNUSABLE");
  assert.notEqual(truth.currentRvcResult, truth.historicalCertificateResult);
});

test("current RVC truth comes only from current evidence data", () => {
  const truth = buildTruthPresentation({
    currentVerification: {
      result: "FAIL",
      reason_codes: ["STALE_ATTESTATION"],
    },
    historicalCertificateResult: "PASS",
    certificateStatus: "Expired",
    currentCertificateUsable: false,
  });

  assert.equal(truth.currentRvcResult, "FAIL");
  assert.deepEqual(truth.currentRvcReasons, ["STALE_ATTESTATION"]);
  assert.equal(truth.historicalCertificateResult, "PASS");
  assert.equal(truth.currentCertificateUsability, "EXPIRED / UNUSABLE");
});
