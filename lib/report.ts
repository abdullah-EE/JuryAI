import { CaseReportSchema, type AgentFinding, type Case, type CourtProcessResult, type HumanDecision, type JuryResult } from "./schemas";

export function generateReport(
  caseData: Case,
  findings: AgentFinding[],
  juryResult: JuryResult,
  humanDecision: HumanDecision,
  courtProcess?: CourtProcessResult,
) {
  return CaseReportSchema.parse({
    reportId: `RPT-${caseData.id}`,
    caseId: caseData.id,
    generatedAt: humanDecision.decidedAt,
    originalRecommendation: `${caseData.initialDecision.recommendation} (${Math.round(caseData.initialDecision.confidence * 100)}% confidence)`,
    summary: "Independent review found that the decline relied on an overstated payment-risk claim and a location-based proxy that materially changed the outcome.",
    findings,
    evidence: caseData.evidence,
    juryResult,
    humanDecision,
    courtProcess,
    auditTimeline: [
      { time: "09:42:00", title: "Case submitted", description: "Application and five evidence sources sealed into the case file." },
      { time: "09:42:04", title: "Initial decision recorded", description: "Northstar Lending Model v4.2 recommended decline at 86% confidence." },
      { time: "09:42:08", title: "Blind testimony opened", description: "Three witnesses received separate, minimum-necessary evidence packets." },
      { time: "09:42:12", title: "Evidence micro-sessions sealed", description: "Each evidence fragment was assessed in a fresh context and recorded in the Clerk ledger." },
      { time: "09:42:15", title: "Neutral CasePacket assembled", description: "The Clerk organized validated findings, provenance, contradictions, and risk flags." },
      { time: "09:42:18", title: "Independent judicial issues sealed", description: "Issue assessments completed without access to jury votes." },
      { time: "09:42:20", title: "Jury votes revealed together", description: "Three independent votes produced a 2–1 overturn verdict; safeguards required judicial review." },
      { time: humanDecision.decidedAt.split("T")[1]?.slice(0, 8) ?? "09:43:00", title: "Human judgment recorded", description: humanDecision.reason },
    ],
  });
}
