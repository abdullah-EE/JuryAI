import type { Case, CounterfactualResult } from "../schemas";
import { agentDefinitions, type AgentRole } from "./manifests";

export type SufficiencyAssessment = {
  sufficient: boolean;
  tooMuchContext: boolean;
  missingItems: string[];
  permittedEvidenceIds: string[];
};

export function assessAgentSufficiency(
  role: AgentRole,
  caseData: Case,
  counterfactual?: CounterfactualResult,
): SufficiencyAssessment {
  const manifest = agentDefinitions[role].manifest;
  const availableIds = new Set(caseData.evidence.map((item) => item.id));
  const missingItems = manifest.allowedEvidenceIds.filter((id) => !availableIds.has(id));
  if (role === "fact_checker" && caseData.initialDecision.rationale.length === 0) missingItems.push("claim requiring verification");
  if (role === "bias_privacy_challenger" && !counterfactual) missingItems.push("structured counterfactual result");
  return {
    sufficient: missingItems.length === 0,
    tooMuchContext: false,
    missingItems,
    permittedEvidenceIds: [...manifest.allowedEvidenceIds],
  };
}
