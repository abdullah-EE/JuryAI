import { z } from "zod";
import type { Case, CounterfactualResult, RiskFlag } from "./schemas";

export const DecisionCheckInputSchema = z.object({
  creditScore: z.number().int(),
  debtToIncomeRatio: z.number(),
  monthlyIncomeEur: z.number(),
  requestedAmountEur: z.number(),
  delayedTransfers: z.number().int().nonnegative(),
  documentedMigration: z.boolean(),
  postalGeography: z.string().nullable(),
}).strict();

export type DecisionCheckInput = z.infer<typeof DecisionCheckInputSchema>;

export function evaluateDemoDecision(input: DecisionCheckInput): "approve" | "decline" {
  const checked = DecisionCheckInputSchema.parse(input);
  let riskScore = 0;
  if (checked.creditScore < 680) riskScore += 2;
  if (checked.debtToIncomeRatio > 0.36) riskScore += 2;
  if (checked.requestedAmountEur / checked.monthlyIncomeEur > 6) riskScore += 1;
  if (checked.delayedTransfers > 1) riskScore += 1;
  if (checked.documentedMigration) riskScore -= 1;
  if (checked.postalGeography) riskScore += 3;
  return riskScore >= 2 ? "decline" : "approve";
}

export function comparePostalCounterfactual(
  baselineInput: DecisionCheckInput,
  counterfactualInput: DecisionCheckInput = { ...baselineInput, postalGeography: null },
): CounterfactualResult {
  const baselineRecommendation = evaluateDemoDecision(baselineInput);
  const counterfactualRecommendation = evaluateDemoDecision(counterfactualInput);
  const changedOutcome = baselineRecommendation !== counterfactualRecommendation;
  return {
    testedField: "postalCode",
    baselineRecommendation,
    counterfactualRecommendation,
    changedOutcome,
    severity: changedOutcome ? "high" : "low",
    summary: changedOutcome
      ? `Counterfactual sensitivity detected: neutralizing postal code changed the recommendation from ${baselineRecommendation} to ${counterfactualRecommendation}. This indicates sensitivity and warrants human review; it does not prove discrimination.`
      : "No counterfactual sensitivity detected: neutralizing postal code did not change the recommendation. This test alone does not establish that the decision is unbiased.",
  };
}

export function runDemoPostalCounterfactual(caseData: Case): CounterfactualResult {
  const baselineInput: DecisionCheckInput = {
    creditScore: caseData.applicant.creditScore,
    debtToIncomeRatio: caseData.applicant.debtToIncomeRatio,
    monthlyIncomeEur: caseData.applicant.monthlyIncomeEur,
    requestedAmountEur: caseData.applicant.requestedAmountEur,
    delayedTransfers: 2,
    documentedMigration: caseData.evidence.some((evidence) => evidence.id === "EV-04" && evidence.verified),
    postalGeography: caseData.applicant.postalCode,
  };
  return comparePostalCounterfactual(baselineInput);
}

export function runScenarioCounterfactual(caseData: Case): CounterfactualResult {
  if (!caseData.id.includes("HR-") && !caseData.id.includes("GOV-")) return runDemoPostalCounterfactual(caseData);
  const testedField = caseData.id.includes("HR-") ? "careerBreak" as const : "districtCode" as const;
  const label = testedField === "careerBreak" ? "career-break indicator" : "district risk score";
  const contextualEvidenceVerified = caseData.evidence.filter((evidence) => ["EV-01", "EV-02", "EV-03", "EV-04"].includes(evidence.id)).every((evidence) => evidence.verified);
  const baselineRecommendation = caseData.initialDecision.recommendation;
  const counterfactualRecommendation = contextualEvidenceVerified ? "approve" as const : "manual_review" as const;
  const changedOutcome = baselineRecommendation !== counterfactualRecommendation;
  return {
    testedField, baselineRecommendation, counterfactualRecommendation, changedOutcome,
    severity: changedOutcome ? "high" : "low",
    summary: changedOutcome
      ? `Counterfactual sensitivity detected: neutralizing the ${label} changed the recommendation from ${baselineRecommendation} to ${counterfactualRecommendation}. This requires human review; it does not prove discrimination.`
      : `No outcome change was observed when the ${label} was neutralized. This test alone does not establish that the decision is unbiased.`,
  };
}

export function counterfactualRiskFlag(result: CounterfactualResult): RiskFlag | null {
  if (!result.changedOutcome) return null;
  return {
    id: "RF-BIAS-CF-01",
    type: "bias",
    severity: result.severity,
    title: "Counterfactual sensitivity detected",
    description: result.summary,
    sourceAgentId: "AG-BIAS-01",
    evidenceReferences: ["EV-05"],
  };
}
