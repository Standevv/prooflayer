import assert from "node:assert/strict";
import test from "node:test";

import { parseCurrentVerification } from "../lib/current-verification.ts";

const NOW = new Date("2026-08-14T12:00:00.000Z");

function payload(overrides = {}) {
  const result = overrides.result ?? "FAIL";
  return {
    verification: {
      result,
      current_rvc_result: overrides.current_rvc_result ?? result,
      reason_codes: ["STALE_ATTESTATION"],
      observed_at: "2026-08-14T11:59:00.000Z",
      valid_until: "2026-08-14T12:59:00.000Z",
      simulation: false,
      authority: "ProofLayer deterministic RVC",
      ...overrides,
    },
  };
}

test("current deterministic USDY FAIL remains visible with its reason", () => {
  const current = parseCurrentVerification(payload(), NOW);
  assert.equal(current?.result, "FAIL");
  assert.deepEqual(current?.reason_codes, ["STALE_ATTESTATION"]);
});

test("expired historical PASS cannot parse as a current RVC result", () => {
  const current = parseCurrentVerification(
    payload({
      result: "PASS",
      reason_codes: [],
      observed_at: "2026-08-08T18:01:50.000Z",
      valid_until: "2026-08-08T19:01:50.000Z",
    }),
    NOW,
  );
  assert.equal(current, null);
});

test("simulated or wrong-authority PASS cannot parse as current truth", () => {
  assert.equal(
    parseCurrentVerification(payload({ result: "PASS", simulation: true }), NOW),
    null,
  );
  assert.equal(
    parseCurrentVerification(payload({ result: "PASS", authority: "fixture" }), NOW),
    null,
  );
});

test("conflicting current and compatibility result fields fail closed", () => {
  assert.equal(
    parseCurrentVerification(
      payload({ result: "PASS", current_rvc_result: "FAIL" }),
      NOW,
    ),
    null,
  );
});

test("future-dated or timezone-naive RVC timestamps fail closed", () => {
  assert.equal(
    parseCurrentVerification(
      payload({
        result: "PASS",
        reason_codes: [],
        observed_at: "2026-08-14T12:00:01.000Z",
      }),
      NOW,
    ),
    null,
  );
  assert.equal(
    parseCurrentVerification(
      payload({
        result: "PASS",
        reason_codes: [],
        observed_at: "2026-08-14T11:59:00.000",
      }),
      NOW,
    ),
    null,
  );
});
