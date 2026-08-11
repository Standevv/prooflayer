import indeterminateCertificate from "../../../data/demo/usdy-indeterminate-certificate.json";
import passCertificate from "../../../data/demo/usdy-pass-certificate.json";

export type VerificationResult = "PASS" | "FAIL" | "INDETERMINATE";

export type DemoCertificate = {
  human: {
    asset: string;
    claim_type: string;
    claim_version: string;
    policy_id: string;
    policy_version: string;
    result: VerificationResult;
    evidence_root: string;
    observed_at: string;
    valid_until: string;
    independent_root_count: number;
    reason_codes: string[];
    compiler_version: string;
    simulation: boolean;
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

export const USDY_PASS_CERTIFICATE = passCertificate as DemoCertificate;
export const USDY_INDETERMINATE_CERTIFICATE =
  indeterminateCertificate as DemoCertificate;

export const RESULT_DEFINITIONS: Record<
  VerificationResult,
  { label: string; description: string }
> = {
  PASS: {
    label: "Claim satisfied",
    description: "Claim satisfied under current policy.",
  },
  FAIL: {
    label: "Policy contradicted",
    description: "Evidence contradicts policy requirements.",
  },
  INDETERMINATE: {
    label: "Approval withheld",
    description:
      "Insufficient, stale, or incomplete evidence to safely approve the claim.",
  },
};
