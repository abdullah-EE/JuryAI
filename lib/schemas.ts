import { z } from "zod";

export const ApplicantSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().int().positive(),
  occupation: z.string(),
  employmentYears: z.number().nonnegative(),
  monthlyIncomeEur: z.number().positive(),
  requestedAmountEur: z.number().positive(),
  loanPurpose: z.string(),
  creditScore: z.number().int().min(300).max(850),
  debtToIncomeRatio: z.number().min(0).max(1),
  postalCode: z.string(),
});

// ---------------------------------------------------------------------------
// Input Manifest — structured, Zod-validated access contract per agent
//
// This replaces a free-text sealedInputDescription as the security source of
// truth. The manifest declares exactly what an agent is authorised to see.
// sealedInputDescription is now a derived, human-readable summary for the UI
// only — the manifest fields are what tests and enforcement logic must inspect.
// ---------------------------------------------------------------------------

/** All evidence categories that exist in the system. */
export const EvidenceCategorySchema = z.enum([
  "income",
  "credit",
  "banking",
  "applicant",
  "context",
]);

/** Applicant fields that are considered potentially sensitive / protected.
 *  An agent must explicitly list any sensitive field it requires. */
export const SensitiveApplicantFieldSchema = z.enum([
  "name",
  "age",
  "postalCode",
  "occupation",
  "loanPurpose",
]);

/** The per-agent input access manifest.
 *
 *  - allowedEvidenceIds      — explicit allow-list of evidence document IDs
 *  - allowedDataCategories   — broad evidence categories the agent may access
 *  - allowedSensitiveFields  — protected applicant fields explicitly permitted
 *  - prohibitedContextTypes  — context types the agent must NOT receive
 *  - purpose                 — machine-readable role label (not free text)
 *  - receivesOtherAgentFindings — must always be false during initial testimony
 *  - receivesInitialDecisionRationale — whether the agent can see the model's reasoning
 */
export const AgentInputManifestSchema = z.object({
  allowedEvidenceIds: z.array(z.string()),
  allowedDataCategories: z.array(EvidenceCategorySchema),
  allowedSensitiveFields: z.array(SensitiveApplicantFieldSchema),
  prohibitedContextTypes: z.array(
    z.enum(["other_agent_findings", "jury_conclusions", "raw_chain_of_thought", "full_applicant_record"]),
  ),
  purpose: z.enum([
    "eligibility_assessment",
    "claim_verification",
    "fairness_privacy_audit",
  ]),
  receivesOtherAgentFindings: z.literal(false),
  receivesInitialDecisionRationale: z.boolean(),
});

export const EvidenceSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string(),
  category: z.enum(["income", "credit", "banking", "applicant", "context"]),
  verified: z.boolean(),
  collectedAt: z.string(),
  summary: z.string(),
  reliability: z.enum(["high", "medium", "low"]),
  dataPoints: z.array(z.string()),
});

export const RiskFlagSchema = z.object({
  id: z.string(),
  type: z.enum(["factual", "bias", "privacy", "evidence", "sovereignty"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  description: z.string(),
  sourceAgentId: z.string(),
  evidenceReferences: z.array(z.string()),
});

export const AgentFindingSchema = z.object({
  agentId: z.string(),
  role: z.enum(["decision_witness", "fact_checker", "bias_privacy_challenger"]),
  displayName: z.string(),
  recommendation: z.string(),
  confidence: z.number().min(0).max(1),
  claims: z.array(z.object({
    id: z.string(),
    statement: z.string(),
    status: z.enum(["supported", "unsupported", "disputed", "observed"]),
  })),
  evidenceReferences: z.array(z.string()),
  risks: z.array(RiskFlagSchema),
  dataUsed: z.array(z.string()),
  /**
   * Structured access contract — the authoritative record of what this agent
   * was permitted to see. Tests and enforcement must use this field, not the
   * human-readable sealedInputDescription below.
   */
  inputManifest: AgentInputManifestSchema,
  /**
   * Human-readable summary derived from inputManifest for UI display only.
   * Must NOT be used as the source of truth for compartmentalization checks.
   */
  sealedInputDescription: z.string(),
}).refine(
  // Enforcement: evidenceReferences must be a subset of allowedEvidenceIds.
  // This catches fixtures or real agents that reference evidence they were
  // not granted access to.
  (finding) =>
    finding.evidenceReferences.every((ref) =>
      finding.inputManifest.allowedEvidenceIds.includes(ref),
    ),
  {
    message:
      "evidenceReferences contains IDs not present in inputManifest.allowedEvidenceIds — evidence access violation",
  },
);

export const AgentReviewResultSchema = z.object({
  findings: z.array(AgentFindingSchema).length(3),
  mode: z.enum(["live", "fallback"]),
});

export const CaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["intake", "reviewing", "awaiting_human", "closed"]),
  submittedAt: z.string(),
  applicant: ApplicantSchema,
  evidence: z.array(EvidenceSourceSchema),
  initialDecision: z.object({
    recommendation: z.enum(["approve", "decline", "manual_review"]),
    confidence: z.number().min(0).max(1),
    model: z.string(),
    rationale: z.array(z.string()),
    dataUsed: z.array(z.string()),
  }),
});

export const JuryResultSchema = z.object({
  recommendation: z.enum(["approve", "decline", "human_review"]),
  confidence: z.number().min(0).max(1),
  agreements: z.array(z.string()),
  disagreements: z.array(z.string()),
  unsupportedClaims: z.array(z.string()),
  riskFlags: z.array(RiskFlagSchema),
  evidenceQuality: z.enum(["strong", "mixed", "weak"]),
  rationale: z.string(),
});

export const HumanDecisionSchema = z.object({
  action: z.enum(["approved", "overridden", "review_requested"]),
  reason: z.string(),
  decidedBy: z.string(),
  decidedAt: z.string(),
});

export const CaseReportSchema = z.object({
  reportId: z.string(),
  caseId: z.string(),
  generatedAt: z.string(),
  originalRecommendation: z.string(),
  summary: z.string(),
  findings: z.array(AgentFindingSchema),
  evidence: z.array(EvidenceSourceSchema),
  juryResult: JuryResultSchema,
  humanDecision: HumanDecisionSchema,
  auditTimeline: z.array(z.object({
    time: z.string(),
    title: z.string(),
    description: z.string(),
  })),
});

export type Applicant = z.infer<typeof ApplicantSchema>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type RiskFlag = z.infer<typeof RiskFlagSchema>;
export type AgentInputManifest = z.infer<typeof AgentInputManifestSchema>;
export type AgentFinding = z.infer<typeof AgentFindingSchema>;
export type AgentReviewResult = z.infer<typeof AgentReviewResultSchema>;
export type Case = z.infer<typeof CaseSchema>;
export type JuryResult = z.infer<typeof JuryResultSchema>;
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;
export type CaseReport = z.infer<typeof CaseReportSchema>;
