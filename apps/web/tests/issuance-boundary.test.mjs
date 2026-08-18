import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeIssuanceRequest,
  sanitizeIssuancePayload,
} from "../lib/issuance-boundary.ts";
import {
  canSubmitIssuance,
  createIssuanceIntent,
  isAuthoritativeRvcWindowCurrent,
  mustRetainIssuanceIntent,
  parseIssuanceIntent,
  serializeIssuanceIntent,
  setIssuanceIntentUnresolved,
} from "../lib/issuance-intent.ts";

const enabledEnv = {
  PROOFLAYER_TESTNET_ISSUANCE_ENABLED: "true",
  PROOFLAYER_OPERATOR_TOKEN: "operator-test-token-at-least-32-bytes",
};

test("testnet issuance is disabled by default", () => {
  const decision = authorizeIssuanceRequest(
    "Bearer operator-test-token-at-least-32-bytes",
    "request-12345678",
    {},
  );
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.errorCode, "ISSUANCE_DISABLED");
});

test("missing or incorrect operator authentication is rejected", () => {
  for (const header of [
    null,
    "Bearer wrong-token",
    "Basic operator-test-token-at-least-32-bytes",
  ]) {
    const decision = authorizeIssuanceRequest(
      header,
      "request-12345678",
      enabledEnv,
    );
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.errorCode, "UNAUTHORIZED_OPERATOR");
    }
  }
});

test("short operator credentials fail closed as unconfigured", () => {
  const decision = authorizeIssuanceRequest(
    "Bearer short-token",
    "request-12345678",
    {
      PROOFLAYER_TESTNET_ISSUANCE_ENABLED: "true",
      PROOFLAYER_OPERATOR_TOKEN: "short-token",
    },
  );
  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    assert.equal(decision.errorCode, "OPERATOR_AUTH_NOT_CONFIGURED");
  }
});

test("authorized issuance requires an idempotency key", () => {
  const decision = authorizeIssuanceRequest(
    "Bearer operator-test-token-at-least-32-bytes",
    null,
    enabledEnv,
  );
  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    assert.equal(decision.errorCode, "INVALID_IDEMPOTENCY_KEY");
  }
});

test("an exact operator credential and idempotency key authorize the BFF", () => {
  const decision = authorizeIssuanceRequest(
    "Bearer operator-test-token-at-least-32-bytes",
    "request-12345678",
    enabledEnv,
  );
  assert.equal(decision.allowed, true);
  if (decision.allowed) {
    assert.equal(decision.idempotencyKey, "request-12345678");
    assert.equal(decision.operatorToken, enabledEnv.PROOFLAYER_OPERATOR_TOKEN);
  }
});

test("configured operator credential comparison is exact", () => {
  const decision = authorizeIssuanceRequest(
    "Bearer operator-test-token-at-least-32-bytes",
    "request-12345678",
    {
      ...enabledEnv,
      PROOFLAYER_OPERATOR_TOKEN: `${enabledEnv.PROOFLAYER_OPERATOR_TOKEN} `,
    },
  );
  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    assert.equal(decision.errorCode, "UNAUTHORIZED_OPERATOR");
  }
});

test("browser payload rejects caller-selected validity or truth fields", () => {
  const sanitized = sanitizeIssuancePayload({
    asset: "USDY",
    claim: "TreasuryBacking",
    policy_id: "default-treasury-policy",
    valid_until: 4_102_444_800,
    result: "PASS",
    evidence_root: "0xattacker",
  });
  assert.equal(sanitized, null);
});

test("browser payload accepts only RVC selection identifiers", () => {
  const sanitized = sanitizeIssuancePayload({
    asset: "USDY",
    claim: "TreasuryBacking",
    policy_id: "default-treasury-policy",
  });
  assert.deepEqual(sanitized, {
    asset: "USDY",
    claim: "TreasuryBacking",
    policy_id: "default-treasury-policy",
  });
});

test("ambiguous transaction and network outcomes retain the same issuance intent", () => {
  for (const code of [
    "NETWORK_ERROR",
    "REQUEST_TIMEOUT",
    "IDEMPOTENCY_CONFLICT",
    "IDEMPOTENCY_IN_PROGRESS",
    "TRANSACTION_FAILED",
    "TRANSACTION_STATE_UNKNOWN",
    "POST_SUBMIT_VERIFICATION_FAILED",
  ]) {
    assert.equal(mustRetainIssuanceIntent(code), true, code);
  }
  assert.equal(mustRetainIssuanceIntent("RVC_NOT_PASS"), false);
  assert.equal(mustRetainIssuanceIntent("UNAUTHORIZED_OPERATOR"), false);
});

test("persisted reconciliation intent retains its exact immutable request", () => {
  const original = createIssuanceIntent(
    "request-immutable-1234",
    {
      asset: "USDY",
      claim: "TreasuryBacking",
      policy_id: "default-treasury-policy",
    },
  );
  const unresolved = setIssuanceIntentUnresolved(original);
  const restored = parseIssuanceIntent(serializeIssuanceIntent(unresolved));

  assert.equal(restored?.unresolved, true);
  assert.equal(restored?.idempotencyKey, "request-immutable-1234");
  assert.deepEqual(restored?.payload, original.payload);
  assert.equal(Object.isFrozen(restored), true);
  assert.equal(Object.isFrozen(restored?.payload), true);

  const changedLivePayload = {
    asset: "USDY",
    claim: "TreasuryBacking",
    policy_id: "replacement-policy",
  };
  assert.notDeepEqual(restored?.payload, changedLivePayload);
});

test("malformed or extended persisted intents fail closed", () => {
  assert.equal(parseIssuanceIntent("request-key-only"), null);
  assert.equal(
    parseIssuanceIntent(
      JSON.stringify({
        version: 2,
        idempotencyKey: "request-immutable-1234",
        payload: {
          asset: "USDY",
          claim: "TreasuryBacking",
          policy_id: "default-treasury-policy",
          valid_until: "2099-01-01T00:00:00Z",
        },
        unresolved: true,
      }),
    ),
    null,
  );
});

test("an unresolved intent can be reconciled after current RVC expiry or failure", () => {
  const unresolved = setIssuanceIntentUnresolved(
    createIssuanceIntent("request-reconcile-1234", {
      asset: "USDY",
      claim: "TreasuryBacking",
      policy_id: "default-treasury-policy",
    }),
  );

  assert.equal(
    canSubmitIssuance({
      intent: unresolved,
      currentRvcIsAuthoritative: false,
      currentRvcResult: "FAIL",
      writeCapabilities: true,
      operatorAuthenticated: true,
    }),
    true,
  );
  assert.equal(
    canSubmitIssuance({
      intent: unresolved,
      currentRvcIsAuthoritative: false,
      currentRvcResult: "FAIL",
      writeCapabilities: true,
      operatorAuthenticated: false,
    }),
    false,
  );
});

test("operator RVC authority window advances and fails closed", () => {
  const observedAt = "2026-08-14T11:00:00.000Z";
  const validUntil = "2026-08-14T12:00:00.000Z";

  assert.equal(
    isAuthoritativeRvcWindowCurrent(
      observedAt,
      validUntil,
      Date.parse("2026-08-14T11:59:59.999Z"),
    ),
    true,
  );
  assert.equal(
    isAuthoritativeRvcWindowCurrent(
      observedAt,
      validUntil,
      Date.parse(validUntil),
    ),
    false,
  );
  assert.equal(
    isAuthoritativeRvcWindowCurrent(
      "2026-08-14T12:00:01.000Z",
      "2026-08-14T13:00:00.000Z",
      Date.parse("2026-08-14T12:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    isAuthoritativeRvcWindowCurrent(
      "2026-08-14T11:00:00.000",
      validUntil,
      Date.parse("2026-08-14T11:30:00.000Z"),
    ),
    false,
  );
});
