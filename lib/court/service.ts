import type { ProviderConfig } from "../agents/runner";
import type { Case, AgentFinding, CounterfactualResult, EvidenceMicroFinding, JudgeIssueAssessment, JurorVote } from "../schemas";
import { CourtProcessResultSchema, EvidenceMicroFindingSchema, JudgeIssueAssessmentSchema, JurorVoteSchema } from "../schemas";
import { buildCasePacket, createEvidenceLedger } from "./clerk";
import { calculateJuryVerdict } from "./jury";
import { buildAllJurorViews, type JurorViewId } from "./juror-views";
import { OpenAICourtSessionRunner } from "./openai-session-runner";
import type { CourtSessionRunner } from "./session-runner";
import type { TrialObserver } from "../trial-observer";

const EvidenceOutputSchema = EvidenceMicroFindingSchema.omit({ evidenceId: true, sourceRole: true }).strict();
const JurorOutputSchema = JurorVoteSchema.omit({ jurorId: true, view: true }).strict();
const JudgeOutputSchema = JudgeIssueAssessmentSchema.omit({ issueId: true, issueType: true }).strict();

export type CourtProcessOptions = {
  runner?: CourtSessionRunner;
  useMocks?: boolean;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  demoMode?: boolean;
  observer?: TrialObserver;
};

function fallbackEvidence(caseData: Case, evidenceId: string): EvidenceMicroFinding {
  const evidence = caseData.evidence.find((item) => item.id === evidenceId);
  if (!evidence) throw new Error(`Unknown evidence ${evidenceId}`);
  return EvidenceMicroFindingSchema.parse({
    evidenceId,
    sourceRole: "evidence_examiner",
    finding: evidence.summary,
    supportStatus: "verified",
    confidence: evidence.reliability === "high" ? 0.93 : 0.84,
    riskType: evidenceId === "EV-05" ? "privacy" : evidenceId === "EV-03" ? "factual" : null,
    severity: evidenceId === "EV-05" ? "high" : evidenceId === "EV-03" ? "medium" : "none",
  });
}

async function examineEvidence(caseData: Case, runner: CourtSessionRunner | null, provider: ProviderConfig, observer?: TrialObserver) {
  const results = await Promise.all(caseData.evidence.map(async (evidence) => {
    await observer?.({ type: "evidence_analysis_started", evidenceIds: [evidence.id], status: "examining" });
    if (!runner) {
      const finding = fallbackEvidence(caseData, evidence.id);
      await observer?.({ type: "evidence_analysis_completed", evidenceIds: [evidence.id], status: "verified", summary: finding.finding, confidence: finding.confidence, mode: "fallback" });
      return { finding, fallback: true };
    }
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
      const finding = EvidenceMicroFindingSchema.parse({ evidenceId: evidence.id, sourceRole: "evidence_examiner", ...output });
      await observer?.({ type: "evidence_analysis_completed", evidenceIds: [evidence.id], status: finding.supportStatus, summary: finding.finding, confidence: finding.confidence, mode: "live" });
      return { finding, fallback: false };
    } catch {
      const finding = fallbackEvidence(caseData, evidence.id);
      await observer?.({ type: "evidence_analysis_completed", evidenceIds: [evidence.id], status: finding.supportStatus, summary: finding.finding, confidence: finding.confidence, mode: "fallback" });
      return { finding, fallback: true };
    }
  }));
  return results;
}

function judgeIssues(packet: ReturnType<typeof buildCasePacket>) {
  const issues: Array<{ issueId: string; issueType: JudgeIssueAssessment["issueType"]; label: string; evidenceIds: string[] }> = [];
  if (packet.contradictions.length) issues.push({ issueId: "JI-FACT", issueType: "factual", label: packet.contradictions[0], evidenceIds: ["EV-03", "EV-04"] });
  if (packet.counterfactual.changedOutcome) issues.push({ issueId: "JI-CF", issueType: "counterfactual", label: `${packet.counterfactual.testedField} neutralization changed the recommendation.`, evidenceIds: ["EV-05"] });
  if (packet.riskFlags.some((risk) => risk.type === "privacy" || risk.type === "bias")) issues.push({ issueId: "JI-PRIV", issueType: "privacy", label: "Location data use may create proxy or minimization concerns.", evidenceIds: ["EV-05"] });
  if (!issues.length) issues.push({ issueId: "JI-EVID", issueType: "evidence", label: "Assess whether the structured evidence support is sufficient.", evidenceIds: packet.evidenceReferences });
  return issues.slice(0, 3);
}

function fallbackJudge(issue: ReturnType<typeof judgeIssues>[number]): JudgeIssueAssessment {
  return JudgeIssueAssessmentSchema.parse({
    issueId: issue.issueId,
    issueType: issue.issueType,
    assessment: issue.issueType === "counterfactual"
      ? "The changed outcome establishes counterfactual sensitivity and requires human review; it does not prove discrimination."
      : issue.issueType === "factual"
        ? "The automated factual characterization is unresolved because the contextual evidence provides a material explanation."
        : "Use of location data presents a serious proxy and data-minimization concern requiring human review.",
    supportStatus: "unresolved",
    confidence: 0.84,
    evidenceIds: issue.evidenceIds,
  });
}

async function assessJudgeIssues(packet: ReturnType<typeof buildCasePacket>, runner: CourtSessionRunner | null, provider: ProviderConfig, observer?: TrialObserver) {
  return Promise.all(judgeIssues(packet).map(async (issue) => {
    if (!runner) {
      const assessment = fallbackJudge(issue);
      await observer?.({ type: "judge_assessment_ready", evidenceIds: issue.evidenceIds, status: assessment.supportStatus, summary: assessment.assessment, confidence: assessment.confidence, mode: "fallback" });
      return { assessment, fallback: true };
    }
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
      const assessment = JudgeIssueAssessmentSchema.parse({ issueId: issue.issueId, issueType: issue.issueType, ...output });
      await observer?.({ type: "judge_assessment_ready", evidenceIds: issue.evidenceIds, status: assessment.supportStatus, summary: assessment.assessment, confidence: assessment.confidence, mode: "live" });
      return { assessment, fallback: false };
    } catch {
      const assessment = fallbackJudge(issue);
      await observer?.({ type: "judge_assessment_ready", evidenceIds: issue.evidenceIds, status: assessment.supportStatus, summary: assessment.assessment, confidence: assessment.confidence, mode: "fallback" });
      return { assessment, fallback: true };
    }
  }));
}

const fallbackVotes: JurorVote[] = [
  { jurorId: "J1", view: "evidence_first", vote: "overturn", confidence: 0.88, keyEvidenceIds: ["EV-02", "EV-04"], reason: "Verified context undermines the automated decision basis." },
  { jurorId: "J2", view: "claim_evidence", vote: "overturn", confidence: 0.84, keyEvidenceIds: ["EV-01", "EV-05"], reason: "Evidence support and proxy sensitivity favor overturning." },
  { jurorId: "J3", view: "contradiction_first", vote: "human_review", confidence: 0.8, keyEvidenceIds: ["EV-03", "EV-05"], reason: "The factual and proxy risks require a human disposition." },
].map((vote) => JurorVoteSchema.parse(vote));

async function collectJurorVotes(packet: ReturnType<typeof buildCasePacket>, runner: CourtSessionRunner | null, provider: ProviderConfig, observer?: TrialObserver) {
  const jurorIds = ["J1", "J2", "J3"] as const;
  const views = buildAllJurorViews(packet);
  return Promise.all(jurorIds.map(async (jurorId, index) => {
    await observer?.({ type: "juror_started", role: jurorId, evidenceIds: packet.evidenceReferences, status: "reviewing", details: { view: views[jurorId].view } });
    if (!runner) {
      const vote = structuredClone(fallbackVotes[index]);
      await observer?.({ type: "juror_vote_sealed", role: jurorId, evidenceIds: vote.keyEvidenceIds, status: "sealed", confidence: vote.confidence, mode: "fallback", details: { view: vote.view } });
      return { vote, fallback: true };
    }
    const jurorView = views[jurorId];
    const input = structuredClone({ admissibleCaseView: jurorView });
    try {
      const output = await runner.run({
        sessionId: `juror-${jurorId}`,
        kind: "juror",
        input,
        outputSchema: JurorOutputSchema,
        provider,
        systemPrompt: "Vote independently from this neutral view of the complete admissible facts. You cannot see other jurors. Do not infer omitted facts. Give a very short reason and cited evidence IDs. Return JSON only.",
      });
      if (!output.keyEvidenceIds.every((evidenceId) => packet.evidenceReferences.includes(evidenceId))) throw new Error("Juror cited inadmissible evidence");
      const vote = JurorVoteSchema.parse({ jurorId, view: jurorView.view satisfies JurorViewId, ...output });
      await observer?.({ type: "juror_vote_sealed", role: jurorId, evidenceIds: vote.keyEvidenceIds, status: "sealed", confidence: vote.confidence, mode: "live", details: { view: vote.view } });
      return { vote, fallback: false };
    } catch {
      const vote = structuredClone(fallbackVotes[index]);
      await observer?.({ type: "juror_vote_sealed", role: jurorId, evidenceIds: vote.keyEvidenceIds, status: "sealed", confidence: vote.confidence, mode: "fallback", details: { view: vote.view } });
      return { vote, fallback: true };
    }
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
  const demoMode = options.demoMode ?? process.env.DEMO_MODE === "true";
  const requestedTimeout = options.timeoutMs ?? Number(process.env.AGENT_TIMEOUT_MS ?? (demoMode ? 5000 : 15000));
  const safeTimeout = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : (demoMode ? 5000 : 15000);
  const provider: ProviderConfig = {
    provider: "openai",
    model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    timeoutMs: demoMode ? Math.min(safeTimeout, 5000) : safeTimeout,
    maxOutputTokens: options.maxOutputTokens ?? 180,
  };
  const runner = !useMocks && apiKey ? (options.runner ?? new OpenAICourtSessionRunner(apiKey)) : null;
  const evidenceResults = await examineEvidence(caseData, runner, provider, options.observer);
  const ledger = createEvidenceLedger(evidenceResults.map((result) => result.finding));
  await options.observer?.({ type: "clerk_started", evidenceIds: ledger.entries.map((entry) => entry.evidenceId), status: "validating" });
  const casePacket = buildCasePacket(ledger, witnesses, counterfactual, `CP-${caseData.id}`);
  await options.observer?.({ type: "case_packet_created", evidenceIds: casePacket.evidenceReferences, status: "sealed", confidence: casePacket.confidence, details: { packetId: casePacket.packetId, verified: casePacket.verifiedFindings.length, risks: casePacket.riskFlags.length } });

  // Both branches are independent. The result is not exposed until assessments are sealed.
  const judgePromise = assessJudgeIssues(casePacket, runner, provider, options.observer);
  const jurorPromise = collectJurorVotes(casePacket, runner, provider, options.observer);
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
