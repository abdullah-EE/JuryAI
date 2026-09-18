import { AgentInputManifestSchema, type AgentFinding, type AgentInputManifest } from "../schemas";

export type AgentRole = AgentFinding["role"];

type AgentDefinition = {
  agentId: string;
  displayName: string;
  manifest: AgentInputManifest;
  sealedInputDescription: string;
  systemPrompt: string;
};

export const agentDefinitions: Record<AgentRole, AgentDefinition> = {
  decision_witness: {
    agentId: "AG-DECISION-01",
    displayName: "Decision Witness",
    manifest: AgentInputManifestSchema.parse({
      purpose: "eligibility_assessment",
      allowedEvidenceIds: ["EV-01", "EV-02", "EV-03"],
      allowedDataCategories: ["income", "credit", "banking"],
      allowedSensitiveFields: [],
      prohibitedContextTypes: ["other_agent_findings", "jury_conclusions", "raw_chain_of_thought", "full_applicant_record"],
      receivesOtherAgentFindings: false,
      receivesInitialDecisionRationale: false,
    }),
    sealedInputDescription: "Financial evidence EV-01, EV-02, and EV-03 only — no protected attributes or other testimony",
    systemPrompt: "Assess lending eligibility only from the supplied financial evidence. Do not infer protected traits. Return concise conclusions, not chain-of-thought. Cite only supplied evidence IDs.",
  },
  fact_checker: {
    agentId: "AG-FACT-01",
    displayName: "Fact Checker",
    manifest: AgentInputManifestSchema.parse({
      purpose: "claim_verification",
      allowedEvidenceIds: ["EV-02", "EV-03", "EV-04"],
      allowedDataCategories: ["credit", "banking", "context"],
      allowedSensitiveFields: [],
      prohibitedContextTypes: ["other_agent_findings", "jury_conclusions", "raw_chain_of_thought", "full_applicant_record"],
      receivesOtherAgentFindings: false,
      receivesInitialDecisionRationale: true,
    }),
    sealedInputDescription: "Claims under review + EV-02, EV-03, and EV-04 only — model identity and other testimony withheld",
    systemPrompt: "Verify only whether each supplied claim is supported by the supplied evidence. Do not infer who produced a claim or make the lending decision. Return concise conclusions, not chain-of-thought. Cite only supplied evidence IDs.",
  },
  bias_privacy_challenger: {
    agentId: "AG-BIAS-01",
    displayName: "Bias & Privacy Challenger",
    manifest: AgentInputManifestSchema.parse({
      purpose: "fairness_privacy_audit",
      allowedEvidenceIds: ["EV-05"],
      allowedDataCategories: ["applicant"],
      allowedSensitiveFields: ["postalCode"],
      prohibitedContextTypes: ["other_agent_findings", "jury_conclusions", "raw_chain_of_thought", "full_applicant_record"],
      receivesOtherAgentFindings: false,
      receivesInitialDecisionRationale: true,
    }),
    sealedInputDescription: "EV-05, postal code, and model input labels only — underlying financial records withheld",
    systemPrompt: "Identify potential proxy discrimination, unnecessary data use, and fairness/privacy concerns from the supplied limited metadata. Do not claim bias is proven or the decision is unbiased. Return concise conclusions, not chain-of-thought. Cite only supplied evidence IDs.",
  },
};

export const agentRoles = Object.keys(agentDefinitions) as AgentRole[];

export function cloneManifest(role: AgentRole): AgentInputManifest {
  return AgentInputManifestSchema.parse(structuredClone(agentDefinitions[role].manifest));
}

