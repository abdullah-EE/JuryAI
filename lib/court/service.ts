import type { ProviderConfig } from "../agents/runner";
import type { Case, AgentFinding, CounterfactualResult, EvidenceMicroFinding, JudgeIssueAssessment, JurorVote } from "../schemas";
import { CourtProcessResultSchema, EvidenceMicroFindingSchema, JudgeIssueAssessmentSchema, JurorVoteSchema } from "../schemas";
import { buildCasePacket, createEvidenceLedger } from "./clerk";
import { calculateJuryVerdict } from "./jury";
import { OpenAICourtSessionRunner } from "./openai-session-runner";
import type { CourtSessionRunner } from "./session-runner";

const EvidenceOutputSchema = EvidenceMicroFindingSchema.omit({ evidenceId: true, sourceRole: true }).strict();
const JurorOutputSchema = JurorVoteSchema.omit({ jurorId: true }).strict();
const JudgeOutputSchema = JudgeIssueAssessmentSchema.omit({ issueId: true, issueType: true }).strict();

export type CourtProcessOptions = {
  runner?: CourtSessionRunner;
  useMocks?: boolean;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
};

function fallbackEvidence(caseData: Case, evidenceId: string): EvidenceMicroFinding {
  const evidence = caseData.evidence.find((item) => item.id === evidenceId);
  if (!evidence) throw new Error(`Unknown evidence ${evidenceId}`);
  const findings: Record<string, Pick<EvidenceMicroFinding, "finding" | "supportStatus" | "riskType" | "severity" | "confidence">> = {
    "EV-01": { finding: "Verified records establish stable income and employment tenure.", supportStatus: "verified", riskType: null, severity: "none", confidence: 0.94 },
    "EV-02": { finding: "Credit history establishes no defaults, collections, or missed instalments.", supportStatus: "verified", riskType: null, severity: "none", confidence: 0.95 },
    "EV-03": { finding: "Banking data establishes two transfers posted late and a 31% debt-to-income ratio.", supportStatus: "verified", riskType: "factual", severity: "medium", confidence: 0.91 },
    "EV-04": { finding: "The bank notice attributes the late postings to a documented account migration.", supportStatus: "verified", riskType: "factual", severity: "medium", confidence: 0.93 },
    "EV-05": { finding: "The application profile contains postal code, a potential location proxy requiring limited use.", supportStatus: "verified", riskType: "privacy", severity: "high", confidence: 0.86 },
  };
  return EvidenceMicroFindingSchema.parse({ evidenceId, sourceRole: "evidence_examiner", ...findings[evidenceId] });
}

async function examineEvidence(caseData: Case, runner: CourtSessionRunner | null, provider: ProviderConfig) {
  const results = await Promise.all(caseData.evidence.map(async (evidence) => {
    if (!runner) return { finding: fallbackEvidence(caseData, evidence.id), fallback: true };
    const input = structuredClone({
      evidence: { id: evidence.id, category: evidence.category, verified: evidence.verified, reliability: evidence.reliability, summary: evidence.summary },
      question: "What does this specific evidence piece establish?",
    });
    try {
      const output = await runner.run({
        sessionId: `evidence-${evidence.id}`,
        kind: "evidence",
        input,
        outputSchema: EvidenceOutputSchema,
        provider,
        systemPrompt: "Assess only this evidence fragment. State only what it establishes. Do not issue a case verdict or infer from absent context. Return JSON only.",
      });
      return { finding: EvidenceMicroFindingSchema.parse({ evidenceId: evidence.id, sourceRole: "evidence_examiner", ...output }), fallback: false };
    } catch {
      return { finding: fallbackEvidence(caseData, evidence.id), fallback: true };
    }
  }));
  return results;
}

function judgeIssues(packet: ReturnType<typeof buildCasePacket>) {
  const issues: Array<{ issueId: string; issueType: JudgeIssueAssessment["issueType"]; label: string; evidenceIds: string[] }> = [];
  if (packet.contradictions.length) issues.push({ issueId: "JI-FACT", issueType: "factual", label: packet.contradictions[0], evidenceIds: ["EV-03", "EV-04"] });
  if (packet.counterfactual.changedOutcome) issues.push({ issueId: "JI-CF", issueType: "counterfactual", label: "Postal-code neutralization changed the recommendation.", evidenceIds: ["EV-05"] });
  if (packet.riskFlags.some((risk) => risk.type === "privacy" || risk.type === "bias")) issues.push({ issueId: "JI-PRIV", issueType: "privacy", label: "Location data use may create proxy or minimization concerns.", evidenceIds: ["EV-05"] });
  if (!issues.length) issues.push({ issueId: "JI-EVID", issueType: "evidence", label: "Assess whether the structured evidence support is sufficient.", evidenceIds: packet.evidenceReferences });
  return issues.slice(0, 3);
}

function fallbackJudge(issue: ReturnType<typeof judgeIssues>[number]): JudgeIssueAssessment {
  return JudgeIssueAssessmentSchema.parse({
    issueId: issue.issueId,
    issueType: issue.issueType,
    assessment: issue.issueType === "counterfactual"
      ? "The changed outcome establishes sensitivity to postal code and requires human review; it does not prove discrimination."
      : issue.issueType === "factual"
        ? "The payment-risk characterization is unresolved because contextual evidence attributes the delay to bank migration."
        : "Use of location data presents a serious proxy and data-minimization concern requiring human review.",
    supportStatus: "unresolved",
    confidence: 0.84,
    evidenceIds: issue.evidenceIds,
  });
}

async function assessJudgeIssues(packet: ReturnType<typeof buildCasePacket>, runner: CourtSessionRunner | null, provider: ProviderConfig) {
  return Promise.all(judgeIssues(packet).map(async (issue) => {
    if (!runner) return { assessment: fallbackJudge(issue), fallback: true };
    const input = structuredClone({ issue: { type: issue.issueType, label: issue.label, evidenceIds: issue.evidenceIds }, packetFindings: [
      ...packet.verifiedFindings.filter((finding) => issue.evidenceIds.includes(finding.evidenceId)),
      ...packet.disputedFindings.filter((finding) => issue.evidenceIds.includes(finding.evidenceId)),
    ] });
    try {
      const output = await runner.run({
        sessionId: `judge-${issue.issueId}`,
        kind: "judge_issue",
        input,
        outputSchema: JudgeOutputSchema,
        provider,
        systemPrompt: "Assess only this issue independently. Do not predict or reference a jury vote. Give no final disposition. Return JSON only.",
      });
      return { assessment: JudgeIssueAssessmentSchema.parse({ issueId: issue.issueId, issueType: issue.issueType, ...output }), fallback: false };
    } catch { return { assessment: fallbackJudge(issue), fallback: true }; }
  }));
}

const fallbackVotes: JurorVote[] = [
  { jurorId: "J1", vote: "overturn", confidence: 0.88, keyEvidenceIds: ["EV-02", "EV-04"], reason: "Verified context undermines the stated payment-risk basis." },
  { jurorId: "J2", vote: "overturn", confidence: 0.84, keyEvidenceIds: ["EV-01", "EV-05"], reason: "Affordability is supported and location sensitivity is material." },
  { jurorId: "J3", vote: "human_review", confidence: 0.8, keyEvidenceIds: ["EV-03", "EV-05"], reason: "The factual and proxy risks require a human disposition." },
].map((vote) => JurorVoteSchema.parse(vote));

async function collectJurorVotes(packet: ReturnType<typeof buildCasePacket>, runner: CourtSessionRunner | null, provider: ProviderConfig) {
  const jurorIds = ["J1", "J2", "J3"] as const;
  return Promise.all(jurorIds.map(async (jurorId, index) => {
    if (!runner) return { vote: structuredClone(fallbackVotes[index]), fallback: true };
    const input = structuredClone({ casePacket: packet });
    try {
      const output = await runner.run({
        sessionId: `juror-${jurorId}`,
        kind: "juror",
        input,
        outputSchema: JurorOutputSchema,
        provider,
        systemPrompt: "Vote independently from this neutral packet. You cannot see other jurors. Give a very short reason and cited evidence IDs. Return JSON only.",
      });
      return { vote: JurorVoteSchema.parse({ jurorId, ...output }), fallback: false };
    } catch { return { vote: structuredClone(fallbackVotes[index]), fallback: true }; }
  }));
}

export async function runCourtProcess(
  caseData: Case,
  witnesses: AgentFinding[],
  counterfactual: CounterfactualResult,
  options: CourtProcessOptions = {},
) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const useMocks = options.useMocks ?? process.env.USE_MOCK_AGENTS === "true";
  const provider: ProviderConfig = {
    provider: "openai",
    model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    timeoutMs: options.timeoutMs ?? Number(process.env.AGENT_TIMEOUT_MS ?? 5000),
    maxOutputTokens: options.maxOutputTokens ?? 180,
  };
  const runner = !useMocks && apiKey ? (options.runner ?? new OpenAICourtSessionRunner(apiKey)) : null;
  const evidenceResults = await examineEvidence(caseData, runner, provider);
  const ledger = createEvidenceLedger(evidenceResults.map((result) => result.finding));
  const casePacket = buildCasePacket(ledger, witnesses, counterfactual);

  // Both branches are independent. The result is not exposed until assessments are sealed.
  const judgePromise = assessJudgeIssues(casePacket, runner, provider);
  const jurorPromise = collectJurorVotes(casePacket, runner, provider);
  const judgeResults = await judgePromise;
  const jurorResults = await jurorPromise;
  const jurorVotes = jurorResults.map((result) => result.vote);
  const mode = [...evidenceResults, ...judgeResults, ...jurorResults].some((result) => result.fallback) ? "fallback" : "live";
  return CourtProcessResultSchema.parse({
    ledger,
    casePacket,
    jurorVotes,
    juryVerdict: calculateJuryVerdict(jurorVotes, casePacket),
    judgeAssessments: judgeResults.map((result) => result.assessment),
    procedure: { judgeAssessmentsSealedBeforeVerdictExposure: true, evidenceSessionsIndependent: true, jurorSessionsIndependent: true },
    mode,
  });
}

export const courtOutputSchemas = { evidence: EvidenceOutputSchema, juror: JurorOutputSchema, judge: JudgeOutputSchema };
