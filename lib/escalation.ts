import type { CounterfactualResult, JuryResult } from "./schemas";

export type EscalationReason = {
  id: string;
  label: string;
  tone: "red" | "amber";
};

export function getEscalationReasons(jury: JuryResult, counterfactual: CounterfactualResult): EscalationReason[] {
  const reasons: EscalationReason[] = [];
  if (counterfactual.changedOutcome) {
    reasons.push({ id: "counterfactual", label: "Counterfactual sensitivity: postal code changed the decision", tone: "amber" });
  }
  if (jury.riskFlags.some((risk) => risk.type === "factual" && (risk.severity === "high" || risk.severity === "critical"))) {
    reasons.push({ id: "factual", label: "High-severity factual issue", tone: "red" });
  }
  if (jury.unsupportedClaims.length > 0) {
    reasons.push({ id: "unsupported", label: "Unsupported material claim", tone: "red" });
  }
  if (jury.evidenceQuality === "weak") {
    reasons.push({ id: "evidence", label: "Weak evidence support", tone: "amber" });
  }
  if (jury.disagreements.some((item) => item.startsWith("Agents reached conflicting"))) {
    reasons.push({ id: "disagreement", label: "Material agent disagreement", tone: "amber" });
  }
  if (!reasons.length && jury.recommendation === "human_review") {
    reasons.push({ id: "risk", label: "Serious risk flag requires human judgment", tone: "amber" });
  }
  return reasons;
}
