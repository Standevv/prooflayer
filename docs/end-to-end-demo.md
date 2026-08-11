# ProofLayer end-to-end X Layer demo

This demo connects the existing Python RVC implementation to the ProofLayer contracts already deployed on X Layer Testnet. It does not deploy contracts, transfer tokens, or touch mainnet.

## End-to-end path

```text
USDY evidence
  -> TreasuryBacking RVC
  -> canonical certificate serializer
  -> ProofLayerCertificateRegistry
  -> ProofLayerPolicyGate
  -> ProofLayerDecisionLog
```

The export script constructs deterministic USDY evidence inputs and runs `verify_treasury_backing` twice at one shared evaluation timestamp:

- Complete, policy-compliant evidence produces `PASS`.
- The same evidence without `onchain_supply` produces `INDETERMINATE` with `MISSING_EVIDENCE`.

The serializer turns both RVC certificates into human-readable JSON plus the exact `bytes32`, integer, and result fields expected by Solidity.

## Generate fresh certificate fixtures

Run this shortly before the live demo:

```bash
python scripts/export_demo_certificate.py
```

It writes:

- `data/demo/usdy-pass-certificate.json`
- `data/demo/usdy-indeterminate-certificate.json`

The TreasuryBacking RVC defines a one-hour validity window. The serializer preserves that policy-derived `observed_at` and `valid_until`; it does not lengthen the certificate lifetime. Repeated exports reuse the shared evaluation time while both fixtures have at least five minutes of validity remaining, so reruns are byte-for-byte stable during the active demo window. Once that safety margin is reached, the exporter performs a fresh time-bound evaluation and produces new deterministic certificate IDs.

## Run the live X Layer demo

Configure `DEPLOYER_PRIVATE_KEY` in the ignored `.env` file. `XLAYER_TESTNET_RPC_URL` is optional because the Hardhat configuration has a public X Layer Testnet default.

Then run:

```bash
npm run demo:xlayer
```

The live script refuses to run unless the connected chain ID is `1952`. It also verifies deployed bytecode, PolicyGate wiring, and DecisionLog writer authorization before making writes. If one of the fixture certificates has not been registered and the deployer is the Registry owner, the script authorizes that deployer as a Registry issuer before registration.

### PASS behavior

The script registers the PASS certificate, reads every stored field back, and asserts `isCertificateUsable == true`. It then calls `executeVerifiedAction`, checks that the protected-action counter increments, reads the emitted decision ID, and confirms the append-only DecisionLog entry is allowed.

On rerun with the same fixture, an existing certificate is read and compared field by field instead of being registered again. The script searches deterministic decision IDs for the same certificate, deployer, and action type; if it finds the earlier successful action, it reports and reads that decision rather than silently executing the action again.

### INDETERMINATE behavior

Registration of an INDETERMINATE certificate succeeds because the Registry anchors all RVC outcomes. However, `isCertificateUsable` is false and PolicyGate rejects the protected action with `CertificateNotUsable`. The script confirms that the protected-action counter does not change.

`INDETERMINATE` is not `PASS`. It means the RVC lacks enough trustworthy evidence to prove or disprove the claim. Treating absence of proof as approval would turn missing evidence into an authorization bypass, so the on-chain mapping is deliberately strict:

| RVC result | Solidity value | Usable by PolicyGate |
| --- | ---: | --- |
| `INDETERMINATE` | `0` | No |
| `PASS` | `1` | Yes, while unexpired and unrevoked |
| `FAIL` | `2` | No |

## Why rejected actions are not in DecisionLog

EVM transactions are atomic. If PolicyGate wrote a denied decision and then reverted, the revert would roll back that DecisionLog write as well. The gate therefore logs successful decisions only. The failed INDETERMINATE attempt is demonstrated by its expected revert and unchanged counter rather than by a misleading on-chain denied record.

## Deployed contracts

| Contract | X Layer Testnet address |
| --- | --- |
| ProofLayerCertificateRegistry | `0xC24A1Aa861aA4ca5D15CEC055223EBACd0940935` |
| ProofLayerDecisionLog | `0x0476A86b75a5e92a09c228227A0573d90E1a2fA1` |
| ProofLayerPolicyGate | `0x8e07048285D5f54a3D1D2093b80F4Aa2ce75C645` |

Never commit `.env` or a private key. The script prints the public deployer address and transaction hashes, but never prints `DEPLOYER_PRIVATE_KEY`.
