import { JuryResultSchema, type AgentFinding } from "./schemas";

export function deliberate(findings: AgentFinding[]) {
  const riskFlags = findings.flatMap((finding) => finding.risks);
  const unsupportedClaims = findings.flatMap((finding) =>
    finding.claims.filter((claim) => claim.status === "unsupported").map((claim) => claim.statement),
  );
  const hasSeriousFlag = riskFlags.some((risk) => risk.severity === "high" || risk.severity === "critical");
  const explicitDispositions = new Set(findings.flatMap((finding) => {
    const recommendation = finding.recommendation.trim().toLowerCase();
    if (recommendation.startsWith("approve")) return ["approve"];
    if (recommendation.startsWith("decline") || recommendation.startsWith("deny")) return ["decline"];
    return [];
  }));
  const hasMaterialDisagreement = explicitDispositions.size > 1;
  const hasMissingEvidence = findings.some((finding) => finding.evidenceReferences.length === 0);
  const hasEvidenceRisk = riskFlags.some((risk) =>
    risk.type === "evidence" && (risk.severity === "high" || risk.severity === "critical"),
  );
  const evidenceQuality = hasMissingEvidence || hasEvidenceRisk
    ? "weak"
    : unsupportedClaims.length || riskFlags.length
      ? "mixed"
      : "strong";
  const averageConfidence = findings.reduce((total, finding) => total + finding.confidence, 0) / findings.length;
  const shouldReview = hasSeriousFlag || unsupportedClaims.length > 0 || hasMaterialDisagreement || evidenceQuality === "weak";
  const agreements = findings
    .flatMap((finding) => finding.claims)
    .filter((claim) => claim.status === "supported")
    .map((claim) => claim.statement)
    .slice(0, 3);
  const disagreements = [
    ...(hasMaterialDisagreement ? ["Agents reached conflicting explicit approve and decline recommendations."] : []),
    ...unsupportedClaims.map((claim) => `A material claim was challenged: ${claim}`),
  ];

  return JuryResultSchema.parse({
    recommendation: shouldReview ? "human_review" : "approve",
    confidence: Number(averageConfidence.toFixed(2)),
    agreements: agreements.length ? agreements : ["No material factual conflicts were identified in the submitted findings."],
    disagreements,
    unsupportedClaims,
    riskFlags,
    evidenceQuality,
    rationale: shouldReview
      ? "Human review is triggered by material risk, unsupported evidence, weak support, or explicit disagreement—not by vote count."
      : "No escalation trigger was found; the evidence and independent findings support automated approval.",
  });
}
