export type VerificationTruthResult = "PASS" | "FAIL" | "INDETERMINATE";

export type CurrentVerificationTruth = {
  result: VerificationTruthResult;
  reason_codes: string[];
  observed_at?: string | null;
  valid_until?: string | null;
};

export type TruthPresentation = {
  currentRvcResult: VerificationTruthResult | "UNAVAILABLE";
  currentRvcReasons: string[];
  historicalCertificateResult: VerificationTruthResult | "UNAVAILABLE";
  currentCertificateUsability: string;
};

export function buildTruthPresentation({
  currentVerification,
  historicalCertificateResult,
  certificateStatus,
  currentCertificateUsable,
}: {
  currentVerification: CurrentVerificationTruth | null;
  historicalCertificateResult: VerificationTruthResult | null;
  certificateStatus: string | null;
  currentCertificateUsable: boolean | null;
}): TruthPresentation {
  const normalizedStatus = certificateStatus?.trim().toUpperCase() || null;
  const usability =
    currentCertificateUsable === null
      ? normalizedStatus ?? "UNAVAILABLE"
      : currentCertificateUsable
        ? normalizedStatus && normalizedStatus !== "ACTIVE"
          ? `${normalizedStatus} / USABLE`
          : "USABLE"
        : normalizedStatus
          ? `${normalizedStatus} / UNUSABLE`
          : "UNUSABLE";

  return {
    // Deliberately no fallback to the historical certificate result. A fixture
    // PASS is immutable historical evidence, not the asset's current RVC state.
    currentRvcResult: currentVerification?.result ?? "UNAVAILABLE",
    currentRvcReasons: currentVerification?.reason_codes ?? [],
    historicalCertificateResult: historicalCertificateResult ?? "UNAVAILABLE",
    currentCertificateUsability: usability,
  };
}
